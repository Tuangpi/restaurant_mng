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

const tablesRateLimit = rateLimit({
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

// GET /api/tables - tables and seating areas
router.get(
  "/",
  tablesRateLimit,
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

      const tables = await prisma.table.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
      });

      res.json({ success: true, data: { tables } });
    } catch (err) {
      console.error("Error fetching tables:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to fetch tables" },
      });
    }
  }
);

// POST /api/tables - add a table
router.post(
  "/",
  tablesRateLimit,
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
          error: { code: "ACCESS_DENIED", message: "Only OWNER/MANAGER can add tables." },
        });
      }

      const createSchema = z.object({
        name: z.string().min(2),
        code: z.string().optional(),
        area: z.string().optional(),
        seats: z.number().int().positive(),
      });

      const validation = createSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Validation failed" },
        });
      }

      const { name, code, area, seats } = validation.data;

      const table = await prisma.table.create({
        data: {
          tenantId,
          name,
          code,
          area,
          seats,
          status: "AVAILABLE",
        },
      });

      res.status(201).json({
        success: true,
        data: { table: { id: table.id, name: table.name, code: table.code, area: table.area, seats: table.seats, status: table.status } },
      });
    } catch (err) {
      console.error("Error creating table:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to create table" },
      });
    }
  }
);


// PATCH /api/tables/:tableId - update a table
router.patch(
  "/:tableId",
  tablesRateLimit,
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
          error: { code: "ACCESS_DENIED", message: "Only OWNER/MANAGER can update tables." },
        });
      }

      const updateSchema = z.object({
        name: z.string().min(2).optional(),
        code: z.string().optional(),
        area: z.string().optional(),
        seats: z.number().int().positive().optional(),
        status: z.enum(["AVAILABLE", "OCCUPIED", "RESERVED", "MAINTENANCE"]).optional(),
      });

      const validation = updateSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Validation failed" },
        });
      }

      const updates: any = {};
      if (validation.data.name !== undefined) updates.name = validation.data.name;
      if (validation.data.code !== undefined) updates.code = validation.data.code;
      if (validation.data.area !== undefined) updates.area = validation.data.area;
      if (validation.data.seats !== undefined) updates.seats = validation.data.seats;
      if (validation.data.status !== undefined) updates.status = validation.data.status;

      const table = await prisma.table.update({
        where: { id: req.params.tableId, tenantId },
        data: updates,
        select: {
          id: true,
          name: true,
          code: true,
          area: true,
          seats: true,
          status: true,
        },
      });

      res.json({ success: true, data: { table } });
    } catch (err) {
      if ((err as any).code === "P2025") {
        return res.status(404).json({
          success: false,
          error: { code: "TABLE_NOT_FOUND", message: "Table not found." },
        });
      }
      if ((err as any).code === "P2027") {
        return res.status(409).json({
          success: false,
          error: { code: "TABLE_EXISTS", message: "A table with this code already exists." },
        });
      }
      console.error("Error updating table:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to update table" },
      });
    }
  }
);


export default router;
