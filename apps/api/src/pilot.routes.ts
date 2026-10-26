import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import { z } from "zod";
import jwt from "jsonwebtoken";

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }, {
    schema: process.env.DATABASE_URL
      ? new URL(process.env.DATABASE_URL).searchParams.get("schema") ?? "public"
      : "public",
  }),
});

const router = express.Router();

const featureFlagSchema = z.object({
  flag: z.string().min(1),
  enabled: z.boolean().optional().default(false),
});

function getUserFromToken(req: Request): string | null {
  const cookie = req.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("access_token="))
    ?.slice("access_token=".length);

  if (!cookie) return null;

  try {
    const secret =
      process.env.ACCESS_TOKEN_SECRET ||
      (process.env.NODE_ENV !== "production"
        ? "restaurant-mng-access-secret"
        : undefined);
    if (!secret) return null;
    const payload = jwt.verify(decodeURIComponent(cookie), secret, {
      algorithms: ["HS256"],
    });
    if (
      typeof payload === "string" ||
      typeof (payload as any).userId !== "string" ||
      !(payload as any).userId
    ) {
      return null;
    }
    return (payload as any).userId;
  } catch {
    return null;
  }
}

router.post(
  "/feature-flag",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
  }),
  async (req: Request, res: Response) => {
    const userId = getUserFromToken(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: "Unauthorized" },
      });
    }

    const tenantId = req.get("X-Tenant-Id");
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "X-Tenant-Id is required." },
      });
    }

    const parsed = featureFlagSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Validation failed" },
      });
    }

    const { flag, enabled } = parsed.data;

    try {
      const setting = await prisma.featureFlag.upsert({
        where: { tenantId_flag: { tenantId, flag } },
        update: { enabled, updatedAt: new Date() },
        create: { tenantId, flag, enabled, userId },
      });

      return res.json({ success: true, data: { setting } });
    } catch (error) {
      console.error("Feature flag error:", error);
      return res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to update feature flag." },
      });
    }
  }
);

router.get(
  "/flags/:userId",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
  }),
  async (req: Request, res: Response) => {
    const tenantId = req.get("X-Tenant-Id");
    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "X-Tenant-Id is required." },
      });
    }

    try {
      const flags = await prisma.featureFlag.findMany({
        where: { tenantId },
        select: { flag: true, enabled: true },
      });

      return res.json({ success: true, data: { flags } });
    } catch (error) {
      console.error("Get feature flags error:", error);
      return res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to retrieve feature flags." },
      });
    }
  }
);

export default router;
