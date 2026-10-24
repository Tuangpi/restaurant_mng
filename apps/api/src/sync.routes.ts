import "dotenv/config";
import express from "express";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }, {
    schema: process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).searchParams.get("schema") ?? "public" : "public",
  }),
});

const batchSchema = z.object({
  clientId: z.string().trim().min(1).max(200),
  operations: z.array(z.object({
    idempotencyKey: z.string().trim().min(1).max(200),
    entity: z.string(),
    operation: z.string(),
    payload: z.unknown(),
  }).strict()).min(1).max(100),
}).strict();

const orderSchema = z.object({
  type: z.enum(["DINE_IN", "TAKEAWAY", "DELIVERY"]),
  tableId: z.string().min(1).optional(),
  items: z.array(z.object({
    menuItemId: z.string().min(1),
    quantity: z.number().int().positive().max(10000),
  }).strict()).min(1).max(100),
}).strict();

class SyncError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

type Operation = z.infer<typeof batchSchema>["operations"][number];

async function replay(tenantId: string, userId: string, clientId: string, operation: Operation) {
  return prisma.$transaction(async (tx) => {
    // Serialize sync writes for this tenant across processes, including duplicate retries.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${tenantId}, 0))::text`;

    const existing = await tx.syncOperation.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: operation.idempotencyKey } },
    });
    if (existing) {
      return { idempotencyKey: operation.idempotencyKey, status: "DUPLICATE", entityId: existing.entityId };
    }

    if (operation.entity !== "ORDER" || operation.operation !== "CREATE") {
      throw new SyncError("UNSUPPORTED_OPERATION", "Only ORDER CREATE is supported.");
    }
    const validation = orderSchema.safeParse(operation.payload);
    if (!validation.success) {
      throw new SyncError("VALIDATION_ERROR", "Invalid order payload; send an order type and nonempty items without prices.");
    }
    const { type, tableId, items } = validation.data;
    if (tableId && !await tx.table.findFirst({ where: { id: tableId, tenantId } })) {
      throw new SyncError("TABLE_NOT_FOUND", "Table not found in this restaurant.");
    }

    const orderItems = [];
    let subtotal = 0;
    for (const item of items) {
      const menuItem = await tx.menuItem.findFirst({
        where: { id: item.menuItemId, tenantId, isActive: true, isAvailable: true },
      });
      if (!menuItem) {
        throw new SyncError("ITEM_NOT_FOUND", "Menu item not found or unavailable in this restaurant.");
      }
      const lineTotal = menuItem.price * item.quantity;
      if (menuItem.price < 0 || lineTotal > 2147483647) {
        throw new SyncError("VALIDATION_ERROR", "Order amount is outside the supported MMK range.");
      }
      subtotal += lineTotal;
      orderItems.push({
        menuItemId: menuItem.id, name: menuItem.name,
        unitPrice: menuItem.price, quantity: item.quantity, lineTotal,
      });
    }
    // Match the existing online order route until tenant tax settings are implemented.
    const tax = Math.round(subtotal * 0.07);
    const total = subtotal + tax;
    if (total > 2147483647) {
      throw new SyncError("VALIDATION_ERROR", "Order amount is outside the supported MMK range.");
    }
    const lastOrder = await tx.order.aggregate({ where: { tenantId }, _max: { orderNumber: true } });
    const order = await tx.order.create({
      data: {
        tenantId, createdById: userId, type, tableId,
        orderNumber: (lastOrder._max.orderNumber ?? 0) + 1,
        status: "OPEN", paymentStatus: "UNPAID", subtotal, tax, total,
        orderItems: { create: orderItems },
        orderHistory: { create: { toStatus: "OPEN", changedById: userId } },
      },
    });
    await tx.syncOperation.create({
      data: {
        tenantId, clientId, idempotencyKey: operation.idempotencyKey,
        entity: operation.entity, operation: operation.operation, entityId: order.id,
      },
    });
    return { idempotencyKey: operation.idempotencyKey, status: "APPLIED", entityId: order.id };
  });
}

const router = express.Router();
router.post("/", rateLimit({
  windowMs: 15 * 60 * 1000, max: 100,
  standardHeaders: true, legacyHeaders: false,
}), async (req, res) => {
  // Parse only this cookie; the app does not currently install cookie-parser.
  const cookie = req.headers.cookie?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith("access_token="))?.slice("access_token=".length);
  let userId: string;
  try {
    const secret = process.env.ACCESS_TOKEN_SECRET ||
      (process.env.NODE_ENV !== "production" ? "restaurant-mng-access-secret" : undefined);
    if (!cookie || !secret) throw new Error("Missing session");
    const payload = jwt.verify(decodeURIComponent(cookie), secret, { algorithms: ["HS256"] });
    if (typeof payload === "string" || typeof payload.userId !== "string" || !payload.userId) {
      throw new Error("Invalid session");
    }
    userId = payload.userId;
  } catch {
    return res.status(401).json({ success: false, error: { code: "AUTHENTICATION_ERROR", message: "Unauthorized" } });
  }

  const tenantId = req.get("X-Tenant-Id");
  if (!tenantId) {
    return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "X-Tenant-Id is required." } });
  }
  try {
    const membership = await prisma.membership.findFirst({
      where: { tenantId, userId, status: "ACTIVE", user: { status: "ACTIVE" }, tenant: { status: "ACTIVE" } },
    });
    if (!membership || !["OWNER", "MANAGER", "CASHIER", "WAITER"].includes(membership.role)) {
      return res.status(403).json({ success: false, error: { code: "ACCESS_DENIED", message: "Order access is required for this restaurant." } });
    }
    const validation = batchSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid sync batch." } });
    }
    const results = [];
    for (const operation of validation.data.operations) {
      try {
        results.push(await replay(tenantId, userId, validation.data.clientId, operation));
      } catch (error) {
        const known = error instanceof SyncError;
        results.push({
          idempotencyKey: operation.idempotencyKey, status: "REJECTED",
          error: {
            code: known ? error.code : "INTERNAL_ERROR",
            message: known ? error.message : "Operation could not be applied; retry safely.",
          },
        });
      }
    }
    return res.json({ success: true, data: { results, serverTime: new Date().toISOString() } });
  } catch {
    return res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "Sync is unavailable." } });
  }
});

export default router;