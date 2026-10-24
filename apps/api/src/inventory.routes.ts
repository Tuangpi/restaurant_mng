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

// Rate limit for inventory routes
const inventoryRateLimit = rateLimit({
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
async function hasInvAuth(userId: string, tenantId: string, req: RequestWithTenant): Promise<boolean> {
  const userIdFromToken = getUserFromToken(req);
  if (!userIdFromToken) return false;

  const membership = await prisma.membership.findFirst({
    where: { tenantId, userId: userIdFromToken },
  });

  if (!membership) return false;

  return membership.role === "OWNER" || membership.role === "MANAGER";
}

// GET /api/inventory/items - list inventory items
router.get(
  "/",
  inventoryRateLimit,
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

      const items = await prisma.inventoryItem.findMany({
        where: { tenantId, isActive: true },
        orderBy: { name: "asc" },
      });

      res.json({
        success: true,
        data: items,
      });
    } catch (err) {
      console.error("Error fetching inventory items:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to fetch inventory items" },
      });
    }
  }
);

// POST /api/inventory/items - create inventory item
router.post(
  "/",
  inventoryRateLimit,
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
      const authCheck = await hasInvAuth(userId, tenantId, req);
      if (!authCheck) {
        return res.status(403).json({
          success: false,
          error: { code: "ACCESS_DENIED", message: "Only OWNER/MANAGER can create inventory items." },
        });
      }

      const createSchema = z.object({
        name: z.string().min(2),
        nameMm: z.string().optional(),
        unit: z.enum(["piece", "kg", "liter", "gram", "pack"]).default("piece"),
      });

      const validation = createSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Validation failed" },
        });
      }

      const { name, nameMm } = validation.data;

      // Check if item name already exists in this tenant
      const existingItem = await prisma.inventoryItem.findFirst({
        where: { tenantId, name },
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
          name,
          nameMm,
          unit: validation.data.unit,
          isActive: true,
        },
      });

      res.status(201).json({
        success: true,
        data: {
          id: item.id,
          name: item.name,
          nameMm: item.nameMm,
          unit: item.unit,
          isActive: item.isActive,
        },
      });
    } catch (err) {
      console.error("Error creating inventory item:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to create inventory item" },
      });
    }
  }
);

// PATCH /api/inventory/items/:itemId - adjust inventory quantity with movement log
router.patch(
  "/:itemId",
  inventoryRateLimit,
  async (req: RequestWithTenant, res: Response) => {
    try {
      const tenantId = req.tenant?.id || "";
      const itemId = req.params.itemId;
      const userId = getUserFromToken(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: { code: "AUTHENTICATION_ERROR", message: "Unauthorized" },
        });
      }

      // Check if user has OWNER role (only owner can adjust inventory)
      const membership = await prisma.membership.findFirst({
        where: { tenantId, userId },
      });

      if (!membership|| membership.role !== "OWNER") {
        return res.status(403).json({
          success: false,
          error: { code: "ACCESS_DENIED", message: "Only OWNER can adjust inventory." },
        });
      }

      const updateSchema = z.object({
        movementType: z.enum(["IN", "OUT", "ADJUST"]),
        quantity: z.number().int(),
        reason: z.string().optional(),
      });

      const validation = updateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Validation failed" },
        });
      }

      const { quantity, movementType, reason } = validation.data;

      // Check if item exists
      const item = await prisma.inventoryItem.findFirst({
        where: { id: itemId, tenantId },
      });

      if (!item) {
        return res.status(404).json({
          success: false,
          error: { code: "ITEM_NOT_FOUND", message: "Inventory item not found." },
        });
      }

      // Create movement log
      await prisma.inventoryMovement.create({
        data: {
          tenantId,
          itemId,
          type: movementType,
          quantity: quantity,
          previousQuantity: item.currentQuantity,
          newQuantity: quantity,
          reason,
        },
      });

      // Update item quantity - need to figure out current quantity
      // For simplicity, set the item's quantity field
      const updatedItem = await prisma.inventoryItem.update({
        where: { id: itemId, tenantId },
        data: {
          currentQuantity: quantity,
        },
      });

      res.json({
        success: true,
        data: {
          id: updatedItem.id,
          name: updatedItem.name,
          currentQuantity: updatedItem.currentQuantity,
        },
      });
    } catch (err) {
      console.error("Error adjusting inventory:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to adjust inventory" },
      });
    }
  }
);

export default router;
