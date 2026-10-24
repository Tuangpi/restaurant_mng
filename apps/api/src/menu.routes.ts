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

// Rate limit for menu routes
const menuRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

// Helper: extract user from access_token cookie
function getUserFromToken(req: RequestWithTenant) {
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
async function hasMenuAuth(userId: string, tenantId: string, req: RequestWithTenant) {
  const userIdFromToken = getUserFromToken(req);
  if (!userIdFromToken) return false;

  const membership = await prisma.membershipembership.findFirst({
    where: { tenantId, userId: userIdFromToken },
  });

  if (!membership) return false;

  return membership.role === "OWNER" || membership.role === "MANAGER";
}

// GET /api/menu/categories - list categories with items count
router.get(
  "/categories",
  menuRateLimit,
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
      const membership = await prisma.membershipembership.findFirst({
        where: { tenantId, userId },
      });

      if (!membership) {
        return res.status(403).json({
          success: false,
          error: { code: "ACCESS_DENIED", message: "You are not a member of this tenant." },
        });
      }

      const categories = await prisma.mENUcategory.findMany({
        where: { tenantId, isActive: true },
        select: {
          id: true,
          name: true,
          nameMm: true,
          sortOrder: true,
          _count: {
            select: { items: { where: { isActive: true } } },
          },
          orderBy: { sortOrder: "asc" },
        },
      });

      res.json({
        success: true,
        data: categories,
      });
    } catch (err) {
      console.error("Error fetching categories:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to fetch categories" },
      });
    }
  }
);

// POST /api/menu/categories - create a category
router.post(
  "/categories",
  menuRateLimit,
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
      const authCheck = await hasMenuAuth(userId, tenantId, req);
      if (!authCheck) {
        return res.status(403).json({
          success: false,
          error: { code: "ACCESS_DENIED", message: "Only OWNER/MANAGER can create categories." },
        });
      }

      const createSchema = z.object({
        name: z.string().min(2),
        nameMm: z.string().optional(),
        sortOrder: z.number().int().optional().default(0),
      });

      const validation = createSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Validation failed" },
        });
      }

      const { name, nameMm, sortOrder } = validation.data;

      // Check if category with this name already exists in this tenant
      const existingCategory = await prisma.mENUcategory.findFirst({
        where: { tenantId, name },
      });

      if (existingCategory) {
        return res.status(409).json({
          success: false,
          error: { code: "CATEGORY_EXISTS", message: "Category with this name already exists." },
        });
      }

      const category = await prisma.mENUcategory.create({
        data: {
          tenantId,
          name,
          nameMm,
          sortOrder,
          isActive: true,
        },
      });

      res.status(201).json({
        success: true,
        data: {
          id: category.id,
          name: category.name,
          nameMm: category.nameMm,
          sortOrder: category.sortOrder,
        },
      });
    } catch (err) {
      console.error("Error creating category:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to create category" },
      });
    }
  }
);

// PATCH /api/menu/categories/:categoryId - update a category
router.patch(
  "/categories/:categoryId",
  menuRateLimit,
  async (req: RequestWithTenant, res: Response) => {
    try {
      const tenantId = req.tenant?.id || "";
      const categoryId = req.params.categoryId;
      const userId = getUserFromToken(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: { code: "AUTHENTICATION_ERROR", message: "Unauthorized" },
        });
      }

      // Check if user has OWNER or MANAGER role
      const authCheck = await hasMenuAuth(userId, tenantId, req);
      if (!authCheck) {
        return res.status(403).json({
          success: false,
          error: { code: "ACCESS_DENIED", message: "Only OWNER/MANAGER can update categories." },
        });
      }

      const updateSchema = z.object({
        name: z.string().min(2).optional(),
        nameMm: z.string().optional(),
        sortOrder: z.number().int().optional(),
        isActive: z.boolean().optional(),
      });

      const validation = updateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Validation failed" },
        });
      }

      const { name, nameMm, sortOrder, isActive } = validation.data;

      const updateData: any = {};
      if (name) updateData.name = name;
      if (nameMm !== undefined) updateData.nameMm = nameMm;
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
      if (isActive !== undefined) updateData.isActive = isActive;

      const category = await prisma.mENUcategory.update({
        where: { id: categoryId, tenantId },
        data: updateData,
        select: {
          id: true,
          name: true,
          nameMm: true,
          sortOrder: true,
          isActive: true,
        },
      });

      res.json({
        success: true,
        data: {
          id: category.id,
          name: category.name,
          nameMm: category.nameMm,
          sortOrder: category.sortOrder,
          isActive: category.isActive,
        },
      });
    } catch (err) {
      console.error("Error updating category:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to update category" },
      });
    }
  }
);

// DELETE /api/menu/categories/:categoryId - delete a category (soft delete)
router.delete(
  "/categories/:categoryId",
  menuRateLimit,
  async (req: RequestWithTenant, res: Response) => {
    try {
      const tenantId = req.tenant?.id || "";
      const categoryId = req.params.categoryId;
      const userId = getUserFromToken(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: { code: "AUTHENTICATION_ERROR", message: "Unauthorized" },
        });
      }

      // Only OWNER can delete categories
      const membership = await prisma.membershipembership.findFirst({
        where: { tenantId, userId },
      });

      if (!membership|| membership.role !== "OWNER") {
        return res.status(403).json({
          success: false,
          error: { code: "ACCESS_DENIED", message: "Only OWNER can delete categories." },
        });
      }

      // Soft delete: set isActive to false
      const category = await prisma.mENUcategory.update({
        where: { id: categoryId, tenantId },
        data: { isActive: false },
        select: {
          id: true,
          name: true,
          isActive: true,
        },
      });

      res.json({
        success: true,
        data: {
          id: category.id,
          name: category.name,
          isActive: category.isActive,
        },
      });
    } catch (err) {
      console.error("Error deleting category:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to delete category" },
      });
    }
  }
);

// GET /api/menu/items - list items with category filter
router.get(
  "/items",
  menuRateLimit,
  async (req: RequestWithTenant, res: Response) => {
    try {
      const tenantId = req.tenant?.id || "";
      const userId = getUserFromToken(req);
      const categoryId = req.query.categoryId as string | undefined;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: { code: "AUTHENTICATION_ERROR", message: "Unauthorized" },
        });
      }

      // Check if user is a member of this tenant
      const membership = await prisma.membershipembership.findFirst({
        where: { tenantId, userId },
      });

      if (!membership) {
        return res.status(403).json({
          success: false,
          error: { code: "ACCESS_DENIED", message: "You are not a member of this tenant." },
        });
      }

      const where: any = { tenantId, isActive: true };
      if (categoryId) {
        where.categoryId = categoryId;
      }

      const items = await prisma.mENUitem.findMany({
        where,
        select: {
          id: true,
          name: true,
          nameMm: true,
          price: true,
          isAvailable: true,
          category: {
            select: {
              id: true,
              name: true,
              nameMm: true,
            },
          },
          orderBy: { sortOrder: "asc" },
        },
      });

      res.json({
        success: true,
        data: items,
      });
    } catch (err) {
      console.error("Error fetching items:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to fetch items" },
      });
    }
  }
);

// POST /api/menu/items - create a menu item
router.post(
  "/items",
  menuRateLimit,
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
      const authCheck = await hasMenuAuth(userId, tenantId, req);
      if (!authCheck) {
        return res.status(403).json({
          success: false,
          error: { code: "ACCESS_DENIED", message: "Only OWNER/MANAGER can create items." },
        });
      }

      const createSchema = z.object({
        name: z.string().min(2),
        nameMm: z.string().optional(),
        categoryId: z.string().optional(),
        price: z.number().int().positive(),
        costPrice: z.number().int().optional(),
        isAvailable: z.boolean().optional().default(true),
      });

      const validation = createSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Validation failed" },
        });
      }

      const { name, nameMm, categoryId, price, costPrice, isAvailable } = validation.data;

      // Check if category exists if provided
      if (categoryId) {
        const categoryExists = await prisma.mENUcategory.findFirst({
          where: { id: categoryId, tenantId, isActive: true },
        });

        if (!categoryExists) {
          return res.status(404).json({
            success: false,
            error: { code: "CATEGORY_NOT_FOUND", message: "Category not found." },
          });
        }
      }

      // Check if item name already exists in this tenant/category
      const existingItem = await prisma.mENUitem.findFirst({
        where: { tenantId, name, categoryId },
      });

      if (existingItem) {
        return res.status(409).json({
          success: false,
          error: { code: "ITEM_EXISTS", message: "Item with this name already exists in this category." },
        });
      }

      const item = await prisma.mENUitem.create({
        data: {
          tenantId,
          name,
          nameMm,
          categoryId,
          price,
          costPrice,
          isAvailable,
        },
      });

      res.status(201).json({
        success: true,
        data: {
          id: item.id,
          name: item.name,
          nameMm: item.nameMm,
          price: item.price,
          isAvailable: item.isAvailable,
          categoryId: item.categoryId,
        },
      });
    } catch (err) {
      console.error("Error creating item:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to create item" },
      });
    }
  }
);

// PATCH /api/menu/items/:itemId - update a menu item
router.patch(
  "/items/:itemId",
  menuRateLimit,
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

      // Check if user has OWNER or MANAGER role
      const authCheck = await hasMenuAuth(userId, tenantId, req);
      if (!authCheck) {
        return res.status(403).json({
          success: false,
          error: { code: "ACCESS_DENIED", message: "Only OWNER/MANAGER can update items." },
        });
      }

      const updateSchema = z.object({
        name: z.string().min(2).optional(),
        nameMm: z.string().optional(),
        categoryId: z.string().optional(),
        price: z.number().int().positive().optional(),
        costPrice: z.number().int().optional(),
        isAvailable: z.boolean().optional(),
      });

      const validation = updateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Validation failed" },
        });
      }

      const { name, nameMm, categoryId, price, costPrice, isAvailable } = validation.data;

      // If categoryId is being changed, validate the new category
      if (categoryId) {
        const categoryExists = await prisma.mENUcategory.findFirst({
          where: { id: categoryId, tenantId, isActive: true },
        });

        if (!categoryExists) {
          return res.status(404).json({
            success: false,
            error: { code: "CATEGORY_NOT_FOUND", message: "Category not found." },
          });
        }
      }

      const updateData: any = {};
      if (name) updateData.name = name;
      if (nameMm !== undefined) updateData.nameMm = nameMm;
      if (categoryId !== undefined) updateData.categoryId = categoryId;
      if (price !== undefined) updateData.price = price;
      if (costPrice !== undefined) updateData.costPrice = costPrice;
      if (isAvailable !== undefined) updateData.isAvailable = isAvailable;

      const item = await prisma.mENUitem.update({
        where: { id: itemId, tenantId },
        data: updateData,
        select: {
          id: true,
          name: true,
          nameMm: true,
          price: true,
          isAvailable: true,
          category: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      res.json({
        success: true,
        data: {
          id: item.id,
          name: item.name,
          nameMm: item.nameMm,
          price: item.price,
          isAvailable: item.isAvailable,
          categoryId: item.category?.id,
        },
      });
    } catch (err) {
      console.error("Error updating item:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to update item" },
      });
    }
  }
);

// DELETE /api/menu/items/:itemId - soft delete a menu item
router.delete(
  "/items/:itemId",
  menuRateLimit,
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

      // Only OWNER can delete items
      const membership = await prisma.membership
.findFirst({
        where: { tenantId, userId },
      });

      if (!membership|| membership.role !== "OWNER") {
        return res.status(403).json({
          success: false,
          error: { code: "ACCESS_DENIED", message: "Only OWNER can delete items." },
        });
      }

      // Soft delete: set isActive to false
      const item = await prisma.mENUitem.update({
        where: { id: itemId, tenantId },
        data: { isActive: false },
        select: {
          id: true,
          name: true,
          isActive: true,
        },
      });

      res.json({
        success: true,
        data: {
          id: item.id,
          name: item.name,
          isActive: item.isActive,
        },
      });
    } catch (err) {
      console.error("Error deleting item:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to delete item" },
      });
    }
  }
);

export default router;
