import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
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
  "/revoke-all",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
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

    try {
      res.clearCookie("access_token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      });
      res.clearCookie("refresh_token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      });

      await prisma.membership.updateMany({
        where: { tenantId, userId, status: "ACTIVE" },
        data: { status: "REVOKED" },
      });

      return res.json({
        success: true,
        data: { message: "All sessions revoked successfully." },
      });
    } catch (error) {
      console.error("Security revoke error:", error);
      return res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to revoke sessions." },
      });
    }
  }
);

export default router;
