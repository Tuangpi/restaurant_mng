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

const refundsRateLimit = rateLimit({
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

// GET /api/orders/:orderId/refunds - refunds for an order
router.get(
  "/orders/:orderId/refunds",
  refundsRateLimit,
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

      const order = await prisma.order.findFirst({
        where: { id: req.params.orderId, tenantId },
      });
      if (!order) {
        return res.status(404).json({
          success: false,
          error: { code: "ORDER_NOT_FOUND", message: "Order not found." },
        });
      }

      const refunds = await prisma.refund.findMany({
        where: { orderId: req.params.orderId, tenantId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          paymentId: true,
          amount: true,
          reason: true,
          method: true,
          status: true,
          createdAt: true,
        },
      });

      res.json({ success: true, data: { refunds } });
    } catch (err) {
      console.error("Error fetching refunds:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to fetch refunds" },
      });
    }
  }
);

// POST /api/orders/:orderId/refunds - refund part or all of a payment
router.post(
  "/orders/:orderId/refunds",
  refundsRateLimit,
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

      if (!(await isOwnerOrManager(userId, tenantId))) {
        return res.status(403).json({
          success: false,
          error: { code: "ACCESS_DENIED", message: "Only OWNER/MANAGER can process refunds." },
        });
      }

      const order = await prisma.order.findFirst({
        where: { id: req.params.orderId, tenantId },
      });
      if (!order) {
        return res.status(404).json({
          success: false,
          error: { code: "ORDER_NOT_FOUND", message: "Order not found." },
        });
      }

      const createSchema = z.object({
        paymentId: z.string(),
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

      const { paymentId, amount, reason, method } = validation.data;

      const payment = await prisma.payment.findFirst({
        where: { id: paymentId, orderId: req.params.orderId, tenantId },
      });
      if (!payment) {
        return res.status(404).json({
          success: false,
          error: { code: "PAYMENT_NOT_FOUND", message: "Payment not found." },
        });
      }

      const existingRefund = await prisma.refund.findFirst({
        where: { orderId: req.params.orderId, tenantId },
      });
      if (existingRefund) {
        return res.status(409).json({
          success: false,
          error: { code: "REFUND_EXISTS", message: "Order already has a refund recorded." },
        });
      }

      const refund = await prisma.refund.create({
        data: {
          tenantId,
          paymentId,
          orderId: req.params.orderId,
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
          paymentId: refund.paymentId,
          amount: refund.amount,
          reason: refund.reason,
          method: refund.method,
          status: refund.status,
          createdAt: refund.createdAt,
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
