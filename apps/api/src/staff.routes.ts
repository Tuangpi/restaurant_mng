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

// Rate limiter for staff routes
const staffRateLimit = rateLimit({
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

// Helper: check if user has OWNER or MANAGER role
async function hasStaffAuth(userId: string, tenantId: string, req: Request): Promise<boolean> {
  const userIdFromToken = getUserFromToken(req);
  if (!userIdFromToken) return false;

  const membership = await prisma.membership.findFirst({
    where: { tenantId, userId: userIdFromToken },
  });

  if (!membership) return false;

  return membership.role === "OWNER" || membership.role === "MANAGER";
}

// GET /api/tenants/:tenantId/members - list members (staff) of a tenant
router.get(
  "/:tenantId/members",
  staffRateLimit,
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

      // Check if user has OWNER or MANAGER role
      if (membership.role !== "OWNER" && membership.role !== "MANAGER") {
        return res.status(403).json({
          success: false,
          error: { code: "ACCESS_DENIED", message: "Only OWNER/MANAGER can view staff." },
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

// POST /api/tenants/:tenantId/members - add a staff member
router.post(
  "/:tenantId/members",
  staffRateLimit,
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

      // Check if user has OWNER or MANAGER role
      const authMembership = await prisma.membership.findFirst({
        where: { tenantId, userId },
      });

      if (!authMembership || (authMembership.role !== "OWNER" && authMembership.role !== "MANAGER")) {
        return res.status(403).json({
          success: false,
          error: { code: "ACCESS_DENIED", message: "Only OWNER/MANAGER can add staff." },
        });
      }

      const addMemberSchema = z.object({
        email: z.string().email(),
        role: z.enum(["OWNER", "MANAGER", "CASHIER", "WAITER", "KITCHEN"]).optional().default("CASHIER"),
      });

      const validation = addMemberSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Validation failed" },
        });
      }

      const { email, role } = validation.data;

      // Check if user with this email already exists
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (!existingUser) {
        return res.status(404).json({
          success: false,
          error: { code: "USER_NOT_FOUND", message: "User with this email not found." },
        });
      }

      // Check if user is already a member of this tenant
      const existingMembership = await prisma.membership.findFirst({
        where: { tenantId, userId: existingUser.id },
      });
      if (existingMembership) {
        return res.status(409).json({
          success: false,
          error: { code: "MEMBER_EXISTS", message: "User is already a member of this tenant." },
        });
      }

      // Create membership record
      const membership = await prisma.membership.create({
        data: {
          tenantId,
          userId: existingUser.id,
          role,
          status: "ACTIVE",
        },
      });

      res.status(201).json({
        success: true,
        data: {
          membership: {
            id: membership.id,
            role: membership.role,
            status: membership.status,
            user: { id: existingUser.id, email: existingUser.email, name: existingUser.name },
          },
        },
      });
    } catch (err) {
      console.error("Error adding staff member:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to add staff member" },
      });
    }
  }
);

// PATCH /api/tenants/:tenantId/members/:memberId - change member role or status
router.patch(
  "/:tenantId/members/:memberId",
  staffRateLimit,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.params.tenantId;
      const memberId = req.params.memberId;
      const userId = getUserFromToken(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: { code: "AUTHENTICATION_ERROR", message: "Unauthorized" },
        });
      }

      // Check if user has OWNER or MANAGER role
      const authMembership = await prisma.membership.findFirst({
        where: { tenantId, userId },
      });

      if (!authMembership || (authMembership.role !== "OWNER" && authMembership.role !== "MANAGER")) {
        return res.status(403).json({
          success: false,
          error: { code: "ACCESS_DENIED", message: "Only OWNER/MANAGER can update staff." },
        });
      }

      const updateMemberSchema = z.object({
        role: z.enum(["OWNER", "MANAGER", "CASHIER", "WAITER", "KITCHEN"]).optional(),
        status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
      });

      const validation = updateMemberSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: { code: "VALIDATION_ERROR", message: "Validation failed" },
        });
      }

      const { role, status } = validation.data;

      // Update membership
      const updateData: any = {};
      if (role) updateData.role = role;
      if (status) updateData.status = status;

      const membership = await prisma.membership.update({
        where: { tenantId_userId: { tenantId, userId: memberId } },
        data: updateData,
        select: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          role: true,
          status: true,
        },
      });

      res.json({
        success: true,
        data: {
          membership: {
            id: membership.id,
            role: membership.role,
            status: membership.status,
            user: { id: membership.user.id, email: membership.user.email, name: membership.user.name },
          },
        },
      });
    } catch (err) {
      console.error("Error updating staff member:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to update staff member" },
      });
    }
  }
);

// DELETE /api/tenants/:tenantId/members/:memberId - remove a member
router.delete(
  "/:tenantId/members/:memberId",
  staffRateLimit,
  async (req: Request, res: Response) => {
    try {
      const tenantId = req.params.tenantId;
      const memberId = req.params.memberId;
      const userId = getUserFromToken(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: { code: "AUTHENTICATION_ERROR", message: "Unauthorized" },
        });
      }

      // Check if user has OWNER role (only OWNER can remove members)
      const authMembership = await prisma.membership.findFirst({
        where: { tenantId, userId },
      });

      if (!authMembership || authMembership.role !== "OWNER") {
        return res.status(403).json({
          success: false,
          error: { code: "ACCESS_DENIED", message: "Only OWNER can remove staff." },
        });
      }

      // Delete membership
      await prisma.membership.delete({
        where: { tenantId_userId: { tenantId, userId: memberId } },
      });

      res.json({
        success: true,
        data: { message: "Staff member removed successfully." },
      });
    } catch (err) {
      console.error("Error removing staff member:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to remove staff member" },
      });
    }
  }
);

export default router;
