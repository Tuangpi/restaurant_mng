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

const shiftsRateLimit = rateLimit({
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

async function isOwnerOrManager(userId: string, tenantId: string): Promise<boolean> {
  const membership = await prisma.membership.findFirst({
    where: { tenantId, userId },
  });
  if (!membership) return false;
  return membership.role === "OWNER" || membership.role === "MANAGER";
}

async function getOpenShift(tenantId: string, userId: string) {
  return prisma.cashierShift.findFirst({
    where: { tenantId, userId, status: "OPEN" },
    orderBy: { openedAt: "desc" },
  });
}

// POST /api/shifts - open a cashier shift
router.post(
  "/",
  shiftsRateLimit,
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

      const membership = await prisma.membership.findFirst({
        where: { tenantId, userId },
      });
      if (!membership) {
        return res.status(403).json({
          success: false,
          error: { code: "ACCESS_DENIED", message: "You are not a member of this tenant." },
        });
      }

      const existingOpenShift = await getOpenShift(tenantId, userId);
      if (existingOpenShift) {
        return res.status(409).json({
          success: false,
          error: { code: "SHIFT_ALREADY_OPEN", message: "You already have an open shift." },
        });
      }

      const openSchema = z.object({
        openingFloat: z.number().int().nonnegative(),
      });

      const validation = openSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Validation failed" },
        });
      }

      const { openingFloat } = validation.data;

      const shift = await prisma.cashierShift.create({
        data: {
          tenantId,
          userId,
          status: "OPEN",
          openingFloat,
          expectedCash: openingFloat,
        },
      });

      res.status(201).json({
        success: true,
        data: {
          id: shift.id,
          userId: shift.userId,
          status: shift.status,
          openingFloat: shift.openingFloat,
          expectedCash: shift.expectedCash,
          openedAt: shift.openedAt,
        },
      });
    } catch (err) {
      console.error("Error opening shift:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to open shift" },
      });
    }
  }
);

// GET /api/shifts/current - the caller's open shift
router.get(
  "/current",
  shiftsRateLimit,
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

      const membership = await prisma.membership.findFirst({
        where: { tenantId, userId },
      });
      if (!membership) {
        return res.status(403).json({
          success: false,
          error: { code: "ACCESS_DENIED", message: "You are not a member of this tenant." },
        });
      }

      const shift = await getOpenShift(tenantId, userId);

      if (!shift) {
        return res.status(404).json({
          success: false,
          error: { code: "NO_OPEN_SHIFT", message: "No open shift found for the current user." },
        });
      }

      res.json({ success: true, data: { shift } });
    } catch (err) {
      console.error("Error fetching current shift:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to fetch current shift" },
      });
    }
  }
);

// POST /api/shifts/:shiftId/close - close a shift and reconcile the drawer
router.post(
  "/:shiftId/close",
  shiftsRateLimit,
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

      const shift = await prisma.cashierShift.findFirst({
        where: { id: req.params.shiftId, tenantId },
      });
      if (!shift) {
        return res.status(404).json({
          success: false,
          error: { code: "SHIFT_NOT_FOUND", message: "Shift not found." },
        });
      }

      if (shift.status !== "OPEN") {
        return res.status(409).json({
          success: false,
          error: { code: "SHIFT_NOT_OPEN", message: "Shift is already closed." },
        });
      }

      if (!(await isOwnerOrManager(userId, tenantId))) {
        return res.status(403).json({
          success: false,
          error: { code: "ACCESS_DENIED", message: "Only OWNER can close shifts." },
        });
      }

      const closeSchema = z.object({
        closingCash: z.number().int().nonnegative(),
      });

      const validation = closeSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Validation failed" },
        });
      }

      const { closingCash } = validation.data;

      // Server-authoritative: expected cash = opening float + cash payments - cash refunds
      const cashPayments = await prisma.payment.groupBy({
        by: ["id"],
        where: { shiftId: shift.id, method: "CASH", status: "VERIFIED" },
        _sum: { amount: true },
      });
      const cashRefunds = await prisma.refund.groupBy({
        by: ["id"],
        where: { shiftId: shift.id, method: "CASH", status: "PROCESSED" },
        _sum: { amount: true },
      });

      const cashPaymentTotal = cashPayments[0]?._sum?.amount || 0;
      const cashRefundTotal = cashRefunds[0]?._sum?.amount || 0;

      const expectedCash = shift.openingFloat + cashPaymentTotal - cashRefundTotal;
      const difference = closingCash - expectedCash;

      const closedShift = await prisma.cashierShift.update({
        where: { id: shift.id },
        data: {
          status: "CLOSED",
          closingCash,
          expectedCash,
          difference,
          closedAt: new Date(),
        },
        select: {
          id: true,
          userId: true,
          status: true,
          openingFloat: true,
          closingCash: true,
          expectedCash: true,
          difference: true,
          openedAt: true,
          closedAt: true,
        },
      });

      res.json({ success: true, data: { shift: closedShift } });
    } catch (err) {
      console.error("Error closing shift:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to close shift" },
      });
    }
  }
);


export default router;
