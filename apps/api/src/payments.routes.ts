import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";

interface RequestWithTenant extends Request {
  tenant?: { id: string };
}
import { z } from "zod";

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const router = express();

// Rate limit for payment routes
const paymentRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
});

// Helper: extract user from access_token cookie
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

// Helper: check if user has OWNER or MANAGER role
async function hasPayAuth(userId: string, tenantId: string, req: RequestWithTenant): Promise<boolean> {
  const userIdFromToken = getUserFromToken(req);
  if (!userIdFromToken) return false;

  const membership = await prisma.membership.findFirst({
    where: { tenantId, userId: userIdFromToken },
  });

  if (!membership) return false;

  return membership.role === "OWNER" || membership.role === "MANAGER";
}

// POST /api/payments - record a payment
router.post(
  "/",
  paymentRateLimit,
  async (req: RequestWithTenant, res: Response) => {
    try {
      const tenantId = req.tenant?.id || "";
      const userId = getUserFromToken(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: { code: "AUTHENTICATION_ERROR", message: "Unauthorized" },
        });
      }

      // Check if user has OWNER or MANAGER role
      const authCheck = await hasPayAuth(userId, tenantId, req);
      if (!authCheck) {
        return res.status(403).json({
          success: false,
          error: { code: "ACCESS_DENIED", message: "Only OWNER/MANAGER can record payments." },
        });
      }

      const createSchema = z.object({
        orderId: z.string(),
        amount: z.number().int().positive(),
        method: z.enum(["CASH", "CARD", "MOBILE", "QR"]),
        tendered: z.number().int().optional(),
        reference: z.string().optional(),
      });

      const validation = createSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Validation failed" },
        });
      }

      const { orderId, amount, method, tendered, reference } = validation.data;

      // Check if order exists and belongs to tenant
      const order = await prisma.order.findFirst({
        where: { id: orderId, tenantId },
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          error: { code: "ORDER_NOT_FOUND", message: "Order not found." },
        });
      }

      // Check if order already has payment
      const existingPayment = await prisma.payment.findFirst({
        where: { orderId },
      });

      if (existingPayment) {
        return res.status(409).json({
          success: false,
          error: { code: "PAYMENT_EXISTS", message: "Order already has a payment recorded." },
        });
      }

      // Calculate change if tendered
      const change = tendered ? tendered - amount : null;

      // Record the payment
      const payment = await prisma.payment.create({
        data: {
          tenantId,
          orderId,
          amount,
          method,
          tendered,
          change,
          reference,
          status: "COMPLETED",
        },
      });

      // Update order payment status
      await prisma.order.update({
        where: { id: orderId },
        data: { paymentStatus: "PAID" },
      });

      res.status(201).json({
        success: true,
        data: {
          id: payment.id,
          amount: payment.amount,
          method: payment.method,
          tendered: payment.tendered,
          change: payment.change,
          status: payment.status,
        },
      });
    } catch (err) {
      console.error("Error recording payment:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to record payment" },
      });
    }
  }
);

// GET /api/payments - list payments
router.get(
  "/",
  paymentRateLimit,
  async (req: RequestWithTenant, res: Response) => {
    try {
      const tenantId = req.tenant?.id || "";
      const userId = getUserFromToken(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: { code: "AUTHENTICATION_ERROR", message: "Unauthorized" },
        });
      }

      // Check if user is a member of this tenant
      const membership = await prisma.membership.findFirst({
        where: { tenantId, userId },
      });

      if (!membership) {
        return res.status(403).json({
          success: false,
          error: { code: "ACCESS_DENIED", message: "You are not a member of this tenant." },
        });
      }

      const payments = await prisma.payment.findMany({
        where: { tenantId },
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      res.json({
        success: true,
        data: payments,
      });
    } catch (err) {
      console.error("Error fetching payments:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to fetch payments" },
      });
    }
  }
);

// POST /api/shifts/open - open a cashier shift
router.post(
  "/shifts/open",
  paymentRateLimit,
  async (req: RequestWithTenant, res: Response) => {
    try {
      const tenantId = req.tenant?.id || "";
      const userId = getUserFromToken(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: { code: "AUTHENTICATION_ERROR", message: "Unauthorized" },
        });
      }

      // Check if user has OWNER or MANAGER role
      const authCheck = await hasPayAuth(userId, tenantId, req);
      if (!authCheck) {
        return res.status(403).json({
          success: false,
          error: { code: "ACCESS_DENIED", message: "Only OWNER/MANAGER can open shifts." },
        });
      }

      // Check if there's already an open shift
      const existingShift = await prisma.cashierShift.findFirst({
        where: { tenantId, status: "OPEN" },
      });

      if (existingShift) {
        return res.status(409).json({
          success: false,
          error: { code: "SHIFT_EXISTS", message: "There is already an open shift." },
        });
      }

      const shift = await prisma.cashierShift.create({
        data: {
          tenantId,
          userId,
          status: "OPEN",
          openingFloat: 0, // Will be set when closing
          expectedCash: 0,
          difference: 0,
        },
      });

      res.status(201).json({
        success: true,
        data: {
          id: shift.id,
          status: shift.status,
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

// POST /api/shifts/close - close a cashier shift
router.post(
  "/shifts/close",
  paymentRateLimit,
  async (req: RequestWithTenant, res: Response) => {
    try {
      const tenantId = req.tenant?.id || "";
      const userId = getUserFromToken(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: { code: "AUTHENTICATION_ERROR", message: "Unauthorized" },
        });
      }

      // Check if user has OWNER role (only owner can close shifts)
      const membership = await prisma.membership.findFirst({
        where: { tenantId, userId },
      });

      if (!membership|| membership.role !== "OWNER") {
        return res.status(403).json({
          success: false,
          error: { code: "ACCESS_DENIED", message: "Only OWNER can close shifts." },
        });
      }

      // Find the open shift
      const shift = await prisma.cashierShift.findFirst({
        where: { tenantId, status: "OPEN" },
      });

      if (!shift) {
        return res.status(404).json({
          success: false,
          error: { code: "SHIFT_NOT_FOUND", message: "No open shift found." },
        });
      }

      // Calculate shift totals from payments
      const payments = await prisma.payment.findMany({
        where: { shiftId: shift.id, tenantId },
      });

      let totalPayments = 0;
      for (const p of payments) {
        totalPayments += p.amount;
      }

      // Get total sales from orders in this period (simplified)
      // In a full implementation, would query orders opened within shift timeframe
      const totalSales = totalPayments; // For now, use total payments as sales

      const difference = (shift.openingFloat || 0) + totalSales - (shift.expectedCash || 0);

      // Close the shift
      const closedShift = await prisma.cashierShift.update({
        where: { id: shift.id },
        data: {
          status: "CLOSED",
          closingCash: totalPayments,
          expectedCash: shift.openingFloat + totalSales,
          difference,
          closedAt: new Date(),
        },
      });

      res.json({
        success: true,
        data: {
          id: closedShift.id,
          status: closedShift.status,
          openingFloat: closedShift.openingFloat,
          closingCash: closedShift.closingCash,
          expectedCash: closedShift.expectedCash,
          difference: closedShift.difference,
          openedAt: closedShift.openedAt,
          closedAt: closedShift.closedAt,
        },
      });
    } catch (err) {
      console.error("Error closing shift:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to close shift" },
      });
    }
  }
);

// GET /api/refunds - list refunds
router.get(
  "/refunds",
  paymentRateLimit,
  async (req: RequestWithTenant, res: Response) => {
    try {
      const tenantId = req.tenant?.id || "";
      const userId = getUserFromToken(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: { code: "AUTHENTICATION_ERROR", message: "Unauthorized" },
        });
      }

      // Check if user is a member of this tenant
      const membership = await prisma.membership.findFirst({
        where: { tenantId, userId },
      });

      if (!membership) {
        return res.status(403).json({
          success: false,
          error: { code: "ACCESS_DENIED", message: "You are not a member of this tenant." },
        });
      }

      const refunds = await prisma.refund.findMany({
        where: { tenantId },
        include: {
          payment: {
            select: {
              id: true,
              amount: true,
              method: true,
            },
          },
          order: {
            select: {
              id: true,
              orderNumber: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      res.json({
        success: true,
        data: refunds,
      });
    } catch (err) {
      console.error("Error fetching refunds:", err);
      res.status(500).json({
        success: false,
          error: { code: "INTERNAL_ERROR", message: "Failed to fetch refunds" },
      });
    }
  }
);

// POST /api/refunds - create a refund
router.post(
  "/refunds",
  paymentRateLimit,
  async (req: RequestWithTenant, res: Response) => {
    try {
      const tenantId = req.tenant?.id || "";
      const userId = getUserFromToken(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: { code: "AUTHENTICATION_ERROR", message: "Unauthorized" },
        });
      }

      // Check if user has OWNER or MANAGER role
      const authCheck = await hasPayAuth(userId, tenantId, req);
      if (!authCheck) {
        return res.status(403).json({
          success: false,
          error: { code: "ACCESS_DENIED", message: "Only OWNER/MANAGER can process refunds." },
        });
      }

      const createSchema = z.object({
        orderId: z.string(),
        amount: z.number().int().positive(),
        reason: z.string().min(2),
        method: z.enum(["CASH", "CARD", "MOBILE"]).optional(),
      });

      const validation = createSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Validation failed" },
        });
      }

      const { orderId, amount, reason, method } = validation.data;

      // Check if order exists and belongs to tenant
      const order = await prisma.order.findFirst({
        where: { id: orderId, tenantId },
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          error: { code: "ORDER_NOT_FOUND", message: "Order not found." },
        });
      }

      // Check if order already has a refund
      const existingRefund = await prisma.refund.findFirst({
        where: { orderId },
      });

      if (existingRefund) {
        return res.status(409).json({
          success: false,
          error: { code: "REFUND_EXISTS", message: "Order already has a refund recorded." },
        });
      }

      // Record the refund
      const refund = await prisma.refund.create({
        data: {
          tenantId,
          orderId,
          amount,
          reason,
          method: method || "CASH",
          status: "PROCESSED",
          createdById: userId,
        },
      });

      res.status(201).json({
        success: true,
        data: {
          id: refund.id,
          amount: refund.amount,
          reason: refund.reason,
          method: refund.method,
          status: refund.status,
        },
      });
    } catch (err) {
      console.error("Error processing refund:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to process refund" },
      });
    }
  }
);

export default router;
