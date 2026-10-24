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

// Rate limit for report routes
const reportRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
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
async function hasReportAuth(userId: string, tenantId: string, req: RequestWithTenant): Promise<boolean> {
  const userIdFromToken = getUserFromToken(req);
  if (!userIdFromToken) return false;

  const membership = await prisma.membership.findFirst({
    where: { tenantId, userId: userIdFromToken },
  });

  if (!membership) return false;

  return membership.role === "OWNER" || membership.role === "MANAGER";
}

// GET /api/reports/daily-sales - daily sales report
router.get(
  "/daily-sales",
  reportRateLimit,
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

      const { startDate, endDate } = req.query;

      const where: any = { tenantId };

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate as string);
        if (endDate) where.createdAt.lte = new Date(endDate as string);
      }

      const orders = await prisma.order.findMany({
        where,
        include: {
          orderItems: {
            select: {
              quantity: true,
              unitPrice: true,
            },
          },
          payments: {
            select: {
              amount: true,
              method: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      // Calculate daily sales
      const dailySales = orders.reduce((acc: {revenue: number, itemsSold: number, ordersCount: number}, order: {payments: {amount: number}[]; orderItems: {quantity: number}[]}) => {
        const revenue = order.payments.reduce((pTotal, payment) => pTotal + ((payment.amount || 0) as number), 0);
        const itemsSold = order.orderItems.reduce((iTotal, item) => iTotal + ((item.quantity || 0) as number), 0);
        acc.revenue += revenue;
        acc.itemsSold += itemsSold;
        acc.ordersCount++;
        return acc;
      }, { revenue: 0, itemsSold: 0, ordersCount: 0 });

      res.json({
        success: true,
        data: {
          ...dailySales,
          period: {
            start: startDate || "beginning",
            end: endDate || "present",
          },
        },
      });
    } catch (err) {
      console.error("Error fetching daily sales report:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to fetch daily sales report" },
      });
    }
  }
);

// GET /api/reports/payment-mix - payment method mix report
router.get(
  "/payment-mix",
  reportRateLimit,
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

      const { startDate, endDate } = req.query;

      const where: any = { tenantId };

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate as string);
        if (endDate) where.createdAt.lte = new Date(endDate as string);
      }

      const payments = await prisma.payment.findMany({
        where,
        select: {
          method: true,
          amount: true,
        },
        orderBy: { createdAt: "desc" },
      });

      // Calculate payment mix
      const paymentMethodTotals: any = {};
      let total = 0;

      for (const payment of payments) {
        const method = payment.method || "UNKNOWN";
        if (!paymentMethodTotals[method]) {
          paymentMethodTotals[method] = 0;
        }
        paymentMethodTotals[method] += (payment.amount || 0) as number;
        total += (payment.amount || 0) as number;
      }

      const paymentMix = Object.entries(paymentMethodTotals).map(([method, amount]) => ({
        method,
        amount,
        percentage: total > 0 ? ((amount as number) / (total as number) * 100).toFixed(2) : 0,
      }));

      res.json({
        success: true,
        data: {
          paymentMix,
          total,
          period: {
            start: startDate || "beginning",
            end: endDate || "present",
          },
        },
      });
    } catch (err) {
      console.error("Error fetching payment mix report:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to fetch payment mix report" },
      });
    }
  }
);

// GET /api/reports/top-items - top selling items report
router.get(
  "/top-items",
  reportRateLimit,
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

      const { limit = "10", startDate, endDate } = req.query;

      const where: any = { tenantId };

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate as string);
        if (endDate) where.createdAt.lte = new Date(endDate as string);
      }

      const orderItems = await prisma.orderItem.findMany({
        where: { order: { tenantId } },
        select: {
          name: true,
          unitPrice: true,
          quantity: true,
          lineTotal: true,
        },
        orderBy: { lineTotal: "desc" },
        take: Number(limit),
      });

      // Calculate totals
      let totalRevenue = 0;
      let totalItemsSold = 0;
      for (const item of orderItems) {
        totalRevenue += item.lineTotal || 0;
        totalItemsSold += item.quantity || 0;
      }

      res.json({
        success: true,
        data: {
          topItems: orderItems,
          totalRevenue,
          totalItemsSold,
          limit: Number(limit),
        },
      });
    } catch (err) {
      console.error("Error fetching top items report:", err);
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to fetch top items report" },
      });
    }
  }
);

export default router;
