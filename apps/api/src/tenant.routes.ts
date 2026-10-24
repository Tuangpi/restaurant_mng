import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import { z } from "zod";

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

// Initialize PrismaClient with driver adapter for Prisma 7.x
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const router = express.Router();

// Rate limiter for tenant routes
const tenantRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
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

// POST /api/tenants - create a new tenant, authenticated user becomes OWNER
router.post(
  "/",
  tenantRateLimit,
  async (req: Request, res: Response) => {
    try {
      const userId = getUserFromToken(req);
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: { code: "AUTHENTICATION_ERROR", message: "Unauthorized" },
        });
      }

      const createSchema = z.object({
        name: z.string().min(2),
        slug: z.string().min(2),
        currency: z.string().optional().default("MMK"),
      });

      const validation = createSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Validation failed" },
        });
      }

      const { name, slug, currency } = validation.data;

      // Check if tenant with this slug already exists
      const existingTenant = await prisma.tenant.findFirst({
        where: { slug },
      });
      if (existingTenant) {
        return res.status(409).json({
          success: false,
          error: { code: "TENANT_EXISTS", message: "Tenant with this slug already exists." },
        });
      }

      // Create the tenant
      const tenant = await prisma.tenant.create({
        data: { name, slug, currency },
      });

      // Create membership record making the user an OWNER
      await prisma.membership.create({
        data: {
          tenantId: tenant.id,
          userId,
          role: "OWNER",
          status: "ACTIVE",
        },
      });

      res.status(201).json({
        success: true,
        data: { tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, currency: tenant.currency } },
      });
    } catch (err) {
      console.error("Error creating tenant:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to create tenant" },
      });
    }
  }
);

// GET /api/tenants - list all tenants (or user's tenants)
router.get(
  "/",
  tenantRateLimit,
  async (_req: Request, res: Response) => {
    try {
      const tenants = await prisma.tenant.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          currency: true,
          _count: {
            select: {
              memberships: {
                where: { status: "ACTIVE" },
              },
            },
          },
        },
        orderBy: { name: "asc" },
      });

      res.json({
        success: true,
        data: tenants,
      });
    } catch (err) {
      console.error("Error fetching tenants:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to fetch tenants" },
      });
    }
  }
);

// GET /api/tenants/:tenantId/members - list members of a tenant
router.get(
  "/:tenantId/members",
  tenantRateLimit,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.params.tenantId;
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

      const members = await prisma.membership.findMany({
        where: { tenantId, status: "ACTIVE" },
        select: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          role: true,
        },
        orderBy: { role: "asc" },
      });

      res.json({
        success: true,
        data: members,
      });
    } catch (err) {
      console.error("Error fetching members:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to fetch members" },
      });
    }
  }
);

export default router;