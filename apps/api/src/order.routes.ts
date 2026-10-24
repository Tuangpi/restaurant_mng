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

const router = express();

// Rate limit for order routes
const orderRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
});

// Helper: extract user from access_token cookie
function getUserFromToken(req: Request) {
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
async function hasOrderAuth(userId: string, tenantId: string, req: Request) {
  const userIdFromToken = getUserFromToken(req);
  if (!userIdFromToken) return false;

  const membership = await prisma.membership.findFirst({
    where: { tenantId, userId: userIdFromToken },
  });

  if (!membership) return false;

  return membership.role === "OWNER" || membership.role === "MANAGER";
}

// POST /api/orders - create a new order
router.post(
  "/",
  orderRateLimit,
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

      // Check if user has OWNER or MANAGER role
      const authCheck = await hasOrderAuth(userId, tenantId, req);
      if (!authCheck) {
        return res.status(403).json({
          success: false,
          error: { code: "ACCESS_DENIED", message: "Only OWNER/MANAGER can create orders." },
        });
      }

      const createSchema = z.object({
        tableId: z.string().optional(),
        items: z.array(
          z.object({
            menuItemId: z.string(),
            quantity: z.number().int().positive(),
          })
        ),
        idempotencyKey: z.string().optional(),
        type: z.enum(["DINE_IN", "TAKEOUT", "DELIVERY"]).optional(),
      });

      const validation = createSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Validation failed" },
        });
      }

      const { items, idempotencyKey, type } = validation.data;

      // Check idempotency - if key provided, check if order already exists
      if (idempotencyKey) {
        const existingOrder = await prisma.order.findFirst({
          where: { idempotencyKey, tenantId },
        });

        if (existingOrder) {
          return res.json({
            success: true,
            data: {
              id: existingOrder.id,
              orderNumber: existingOrder.orderNumber,
              status: existingOrder.status,
              total: existingOrder.total,
            },
          });
        }
      }

      // Calculate order totals from items
      let subtotal = 0;
      const orderItemsData = [];

      for (const item of items) {
        const menuItem = await prisma.mENUitem.findFirst({
          where: { id: item.menuItemId, tenantId, isActive: true },
        });

        if (!menuItem) {
          return res.status(404).json({
            success: false,
            error: { code: "ITEM_NOT_FOUND", message: `Menu item ${item.menuItemId} not found` },
          });
        }

        subtotal += menuItem.price * item.quantity;

        orderItemsData.push({
          menuItemId: item.menuItemId,
          name: menuItem.name,
          unitPrice: menuItem.price,
          quantity: item.quantity,
          lineTotal: menuItem.price * item.quantity,
        });
      }

      const discount = 0; // Will be calculated later if needed
      const tax = Math.round(subtotal * 0.07); // 7% tax
      const serviceCharge = 0;
      const total = subtotal + tax + serviceCharge - discount;

      // Generate order number
      const orderNumber = Math.floor(Math.random() * 9000) + 1000;

      // Create the order
      const order = await prisma.order.create({
        data: {
          tenantId,
          orderNumber,
          type: type || "DINE_IN",
          status: "OPEN",
          paymentStatus: "UNPAID",
          subtotal,
          discount,
          tax,
          serviceCharge,
          total,
          createdById: userId,
        },
      });

      // Create order items
      for (const item of orderItemsData) {
        await prisma.orderItem.create({
          data: {
            orderId: order.id,
            menuItemId: item.menuItemId,
            name: item.name,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            lineTotalt: item.lineTotal,
          },
        });
      }

      // TODO: Create order history entry, inventory movements, etc.

      res.status(201).json({
        success: true,
        data: {
          id: order.id,
          orderNumber: order.orderNumber,
          type: order.type,
          status: order.status,
          paymentStatus: order.paymentStatus,
          subtotal: order.subtotal,
          tax: order.tax,
          total: order.total,
          items: orderItemsData,
        },
      });
    } catch (err) {
      console.error("Error creating order:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to create order" },
      });
    }
  }
);

export default router;
