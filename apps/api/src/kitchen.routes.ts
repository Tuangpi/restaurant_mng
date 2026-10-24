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

const router = express.Router();

// Rate limit for kitchen routes
const kitchenRateLimit = rateLimit({
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
async function hasKitchenAuth(userId: string, tenantId: string, req: RequestWithTenant): Promise<boolean> {
  const userIdFromToken = getUserFromToken(req);
  if (!userIdFromToken) return false;

  const membership = await prisma.membership.findFirst({
    where: { tenantId, userId: userIdFromToken },
  });

  if (!membership) return false;

  return membership.role === "OWNER" || membership.role === "MANAGER";
}

// GET /api/kitchen/orders - get open orders for kitchen display
router.get(
  "/",
  kitchenRateLimit,
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

      // Get orders that are not closed (status != CLOSED)
      const orders = await prisma.order.findMany({
        where: {
          tenantId,
          status: { not: "CLOSED" },
        },
        include: {
          orderItems: {
            select: {
              id: true,
              name: true,
              quantity: true,
              unitPrice: true,
              lineTotal: true,
            },
          },
          orderHistory: {
            orderBy: { changedAt: "desc" },
            select: {
              status: true,
              changedAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      // Transform orders for kitchen display
      interface OrderHistoryEntry {
  status: string;
  changedAt: Date;
}

interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface Order {
  id: string;
  orderNumber: string;
  type: string;
  status: string;
  tableId: string | null;
  createdAt: Date;
  orderHistory: OrderHistoryEntry[];
  orderItems: OrderItem[];
}

// Transform orders for kitchen display
const kitchenOrders = orders.map((order: Order) => {
  const statusHistory = order.orderHistory.map((oh: OrderHistoryEntry) => ({
    status: oh.status,
    changedAt: oh.changedAt,
  })).filter(
    (h: { status: string }, idx: number, arr: OrderHistoryEntry[]) => idx === 0 || h.status !== arr[idx - 1]?.status,
  );

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    type: order.type,
    status: order.status,
    tableId: order.tableId,
    createdAt: order.createdAt,
    items: order.orderItems.map((oi: OrderItem) => ({
      id: oi.id,
      name: oi.name,
      quantity: oi.quantity,
      unitPrice: oi.unitPrice,
      lineTotal: oi.lineTotal,
    })),
    statusHistory,
  };
});

      res.json({
        success: true,
        data: kitchenOrders,
      });
    } catch (err) {
      console.error("Error fetching kitchen orders:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to fetch kitchen orders" },
      });
    }
  }
);

// POST /api/kitchen/orders/:orderId/status - update order status
router.post(
  "/:orderId/status",
  kitchenRateLimit,
  async (req: RequestWithTenant, res: Response) => {
    try {
      const tenantId = req.tenant?.id || "";
      const orderId = req.params.orderId;
      const userId = getUserFromToken(req);
      const { status } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: { code: "AUTHENTICATION_ERROR", message: "Unauthorized" },
        });
      }

      // Check if user has OWNER or MANAGER role
      const authCheck = await hasKitchenAuth(userId, tenantId, req);
      if (!authCheck) {
        return res.status(403).json({
          success: false,
          error: { code: "ACCESS_DENIED", message: "Only OWNER/MANAGER can update order status." },
        });
      }

      if (!status) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Status is required" },
        });
      }

      // Validate status is a valid status
      const validStatuses = ["PREP", "COOKING", "READY", "SERVED", "CLOSED"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: { code: "INVALID_STATUS", message: "Invalid status value" },
        });
      }

      // Update order status
      const order = await prisma.order.update({
        where: { id: orderId, tenantId },
        data: { status },
      });

      // Create status history entry
      await prisma.orderStatusHistory.create({
        data: {
          orderId,
          status,
          changedById: userId,
        },
      });

      res.json({
        success: true,
        data: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
        },
      });
    } catch (err) {
      console.error("Error updating order status:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to update order status" },
      });
    }
  }
);

export default router;
