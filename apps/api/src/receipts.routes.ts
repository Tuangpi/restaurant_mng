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

const receiptsRateLimit = rateLimit({
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

async function isTenantMember(userId: string, tenantId: string): Promise<boolean> {
  const membership = await prisma.membership.findFirst({
    where: { tenantId, userId },
  });
  return !!membership;
}

// GET /api/orders/:orderId/receipts - issued receipts for an order
router.get(
  "/orders/:orderId/receipts",
  receiptsRateLimit,
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

      const receipts = await prisma.receipt.findMany({
        where: { orderId: req.params.orderId, tenantId },
        orderBy: { issuedAt: "desc" },
        select: {
          id: true,
          number: true,
          content: true,
          issuedAt: true,
        },
      });

      res.json({ success: true, data: { receipts } });
    } catch (err) {
      console.error("Error fetching receipts:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to fetch receipts" },
      });
    }
  }
);

// POST /api/orders/:orderId/receipts - issue a receipt
router.post(
  "/orders/:orderId/receipts",
  receiptsRateLimit,
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

      const createSchema = z.object({
        content: z.any().optional(),
      });

      const validation = createSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Validation failed" },
        });
      }

      const number = `RCPT-${String(order.orderNumber).padStart(6, "0")}-${String(Date.now()).slice(-6)}`;

      const receipt = await prisma.receipt.create({
        data: {
          tenantId,
          orderId: req.params.orderId,
          number,
          content: validation.data.content || {
            orderNumber: order.orderNumber,
            type: order.type,
            total: order.total,
          },
          issuedAt: new Date(),
        },
      });

      res.status(201).json({
        success: true,
        data: {
          receipt: {
            id: receipt.id,
            orderId: receipt.orderId,
            number: receipt.number,
            content: receipt.content,
            issuedAt: receipt.issuedAt,
          },
        },
      });
    } catch (err) {
      console.error("Error issuing receipt:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to issue receipt" },
      });
    }
  }
);

// GET /api/receipts/:receiptId - one receipt (reprint)
router.get(
  "/:receiptId",
  receiptsRateLimit,
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

      const receipt = await prisma.receipt.findUnique({
        where: { id: req.params.receiptId, tenantId },
        select: {
          id: true,
          number: true,
          content: true,
          issuedAt: true,
        },
      });

      if (!receipt) {
        return res.status(404).json({
          success: false,
          error: { code: "RECEIPT_NOT_FOUND", message: "Receipt not found." },
        });
      }

      res.json({ success: true, data: { receipt } });
    } catch (err) {
      console.error("Error fetching receipt:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to fetch receipt" },
      });
    }
  }
);


export default router;
