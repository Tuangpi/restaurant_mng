import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import { z } from "zod";

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const router = express.Router();

const settingsRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
});

function getUserFromToken(req: Request): string | null {
  const cookie = req.cookies?.["access_token"];
  if (!cookie) return null;

  try {
    const token = cookie.split(".")[1];
    const payload = JSON.parse(Buffer.from(token, "base64").toString());
    return payload.userId;
  } catch {
    return null;
  }
}

async function isTenantOwner(userId: string, tenantId: string): Promise<boolean> {
  const membership = await prisma.membership.findFirst({
    where: { tenantId, userId },
  });
  if (!membership) return false;
  return membership.role === "OWNER";
}

// GET /api/settings - restaurant profile and rates
router.get("/", settingsRateLimit, async (_req: Request, res: Response) => {
  try {
    const tenantId = (_req as any).tenant?.id || "";
    const userId = getUserFromToken(_req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: "AUTHENTICATION_ERROR", message: "Unauthorized" },
      });
    }

    const membership = await prisma.membership.findFirst({
      where: { tenantId, userId },
    });
    if (!membership) {
      return res.status(403).json({
        success: false,
        error: { code: "ACCESS_DENIED", message: "You are not a member of this tenant." },
      });
    }

    const settings = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        currency: true,
        taxRate: true,
        serviceChargeRate: true,
      },
    });

    if (!settings) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: "Restaurant settings not found." },
      });
    }

    res.json({ success: true, data: { settings } });
  } catch (err) {
    console.error("Error fetching settings:", err);
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to fetch settings" },
    });
  }
});

// PATCH /api/settings - update profile and rates
router.patch(
  "/",
  settingsRateLimit,
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).tenant?.id || "";
      const userId = getUserFromToken(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: { code: "AUTHENTICATION_ERROR", message: "Unauthorized" },
        });
      }

      if (!(await isTenantOwner(userId, tenantId))) {
        return res.status(403).json({
          success: false,
          error: { code: "ACCESS_DENIED", message: "Only OWNER can update settings." },
        });
      }

      const updateSchema = z.object({
        name: z.string().min(2).optional(),
        slug: z.string().min(2).optional(),
        currency: z.string().optional(),
        taxRate: z.number().min(0).max(1).optional(),
        serviceChargeRate: z.number().min(0).max(1).optional(),
      });

      const validation = updateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Validation failed" },
        });
      }

      const { name, slug, currency, taxRate, serviceChargeRate } = validation.data;

      const updates: any = {};
      if (name) updates.name = name;
      if (slug) updates.slug = slug;
      if (currency) updates.currency = currency;
      if (taxRate !== undefined) updates.taxRate = taxRate;
      if (serviceChargeRate !== undefined) updates.serviceChargeRate = serviceChargeRate;

      const settings = await prisma.tenant.update({
        where: { id: tenantId },
        data: updates,
        select: {
          id: true,
          name: true,
          slug: true,
          currency: true,
          taxRate: true,
          serviceChargeRate: true,
        },
      });

      res.json({ success: true, data: { settings } });
    } catch (err) {
      console.error("Error updating settings:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to update settings" },
      });
    }
  }
);

export default router;
