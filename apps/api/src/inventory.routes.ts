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
    schema: process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).searchParams.get("schema") ?? "public" : "public",
  }),
});

const router = express.Router();

const inventoryRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
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

async function getMembership(userId: string, tenantId: string) {
  return prisma.membership.findFirst({
    where: {
      tenantId,
      userId,
      status: "ACTIVE",
      user: { status: "ACTIVE" },
      tenant: { status: "ACTIVE" },
    },
  });
}

function isOwnerOrManager(role: string) {
  return role === "OWNER" || role === "MANAGER";
}

const createSchema = z
  .object({
    name: z.string().min(1),
    unit: z.string().min(1).optional(),
    quantityOnHand: z.number().int().min(0).optional(),
    quantity: z.number().int().min(0).optional(),
    reorderLevel: z.number().int().min(0).optional(),
    minQuantity: z.number().int().min(0).optional(),
  })
  .transform((data) => ({
    name: data.name,
    unit: data.unit ?? "piece",
    quantityOnHand: data.quantityOnHand ?? data.quantity ?? 0,
    reorderLevel: data.reorderLevel ?? 0,
    minQuantity: data.minQuantity ?? 0,
  }));

const updateSchema = z
  .object({
    name: z.string().min(1).optional(),
    unit: z.string().min(1).optional(),
    quantityOnHand: z.number().int().min(0).optional(),
    quantity: z.number().int().min(0).optional(),
    reorderLevel: z.number().int().min(0).optional(),
    minQuantity: z.number().int().min(0).optional(),
  })
  .transform((data) => {
    const result: Record<string, unknown> = {};
    if (data.name !== undefined) result.name = data.name;
    if (data.unit !== undefined) result.unit = data.unit;
    if (data.quantityOnHand !== undefined || data.quantity !== undefined) {
      result.quantityOnHand = data.quantityOnHand ?? data.quantity;
    }
    if (data.reorderLevel !== undefined) result.reorderLevel = data.reorderLevel;
    if (data.minQuantity !== undefined) result.minQuantity = data.minQuantity;
    return result;
  });

router.get(
  "/",
  inventoryRateLimit,
  async (req: Request, res: Response) => {
    try {
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

      const membership = await getMembership(userId, tenantId);
      if (!membership) {
        return res.status(403).json({
          success: false,
          error: { code: "ACCESS_DENIED", message: "You are not a member of this tenant." },
        });
      }

      const items = await prisma.inventoryItem.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
      });

      return res.json({ success: true, data: items });
    } catch (err) {
      console.error("Error fetching inventory items:", err);
      return res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to fetch inventory items" },
      });
    }
  }
);

router.post(
  "/",
  inventoryRateLimit,
  async (req: Request, res: Response) => {
    try {
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

      const membership = await getMembership(userId, tenantId);
      if (!membership || !isOwnerOrManager(membership.role)) {
        return res.status(403).json({
          success: false,
          error: { code: "ACCESS_DENIED", message: "Only OWNER/MANAGER can create inventory items." },
        });
      }

      const validation = createSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Validation failed" },
        });
      }

      const data = validation.data;

      const existingItem = await prisma.inventoryItem.findFirst({
        where: { tenantId, name: data.name },
      });
      if (existingItem) {
        return res.status(409).json({
          success: false,
          error: { code: "ITEM_EXISTS", message: "Inventory item with this name already exists." },
        });
      }

      const item = await prisma.inventoryItem.create({
        data: {
          tenantId,
          name: data.name,
          unit: data.unit,
          quantityOnHand: data.quantityOnHand,
          reorderLevel: data.reorderLevel,
          minQuantity: data.minQuantity,
        },
      });

      return res.status(201).json({ success: true, data: item });
    } catch (err) {
      console.error("Error creating inventory item:", err);
      return res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to create inventory item" },
      });
    }
  }
);

router.put(
  "/:itemId",
  inventoryRateLimit,
  async (req: Request, res: Response) => {
    try {
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

      const membership = await getMembership(userId, tenantId);
      if (!membership || !isOwnerOrManager(membership.role)) {
        return res.status(403).json({
          success: false,
          error: { code: "ACCESS_DENIED", message: "Only OWNER/MANAGER can update inventory items." },
        });
      }

      const itemId = String(req.params.itemId);

      const existing = await prisma.inventoryItem.findFirst({
        where: { id: itemId, tenantId },
      });
      if (!existing) {
        return res.status(404).json({
          success: false,
          error: { code: "ITEM_NOT_FOUND", message: "Inventory item not found." },
        });
      }

      const validation = updateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Validation failed" },
        });
      }

      const updateData = validation.data;
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "No fields to update." },
        });
      }

      const item = await prisma.inventoryItem.update({
        where: { id: itemId },
        data: updateData,
      });

      return res.json({ success: true, data: item });
    } catch (err) {
      console.error("Error updating inventory item:", err);
      return res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to update inventory item" },
      });
    }
  }
);

export default router;
