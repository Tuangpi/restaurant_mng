import express from "express";
import dotenv from "dotenv";
dotenv.config();
import helmet from "helmet";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { z } from "zod";

const app = express();

app.use(express.json());

// Security middleware
app.use(helmet());
app.use(
  helmet.crossOriginResourcePolicy({ policy: "same-origin" })
);
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  })
);
// Rate limit all API routes (overridden by per-route limits)
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Tenant routes
app.use("/api/tenants", tenantRouter);
// Staff routes
app.use("/api/staff", staffRouter)

// Order routes
app.use("/api/orders", orderRouter)

// Payment and shift routes
app.use("/api/payments", paymentsRouter)

// Reports routes
app.use("/api/reports", reportsRouter)

// Inventory routes
app.use("/api/inventory", inventoryRouter)

// Kitchen display routes
app.use("/api/kitchen", kitchenRouter);
// Settings routes
app.use("/api/settings", settingsRouter);

// Tables routes
app.use("/api/tables", tablesRouter);

// Receipt route
app.use("/api/receipts", receiptsRouter);

// Refund route
app.use("/api/refunds", refundsRouter);

// Shift routes
app.use("/api/shifts", shiftsRouter);


import syncRouter from "./sync.routes.ts";
app.use("/api/sync", syncRouter);

// Auth routes
//
//

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});
app.get("/api/health/ready", (_req, res) => {
  res.json({ ready: true });
});

// Validate function
function validate(schema: z.ZodSchema, data: unknown) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.format();
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Validation failed", details: errors } };
  }
  return { success: true, data: result.data };
}

// Register schemas
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Health check routes
// POST /api/auth/register
import tenantRouter from './tenant.routes.ts';
import staffRouter from './staff.routes.ts';
import orderRouter from './order.routes.ts';
import paymentsRouter from './payments.routes.ts';
import reportsRouter from './reports.routes.ts';
import inventoryRouter from './inventory.routes.ts';
import kitchenRouter from './kitchen.routes.ts';
import settingsRouter from './settings.routes.ts';
import tablesRouter from './tables.routes.ts';
import receiptsRouter from './receipts.routes.ts';
import refundsRouter from './refunds.routes.ts';
import shiftsRouter from './shifts.routes.ts';
app.post("/api/auth/register", rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
  const validation = validate(registerSchema, req.body);
  if (!validation.success) {
    return res.status(400).json({ success: false, error: validation.error });
  }

  const { email, password, name } = validation.data as any;

  // Check if user already exists (using Prisma)
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL }, {
    schema: process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).searchParams.get("schema") ?? "public" : "public",
  });
  const prisma = new PrismaClient({ adapter, log: process.env.NODE_ENV !== "production" ? ["query", "info", "warn", "error"] : [] });

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return res.status(409).json({ success: false, error: { code: "USER_EXISTS", message: "User with this email already exists." } });
  }

  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  const user = await prisma.user.create({ data: { email, passwordHash, name, status: "ACTIVE" } });

  const accessToken = jwt.sign({ userId: user.id, email: user.email }, process.env.ACCESS_TOKEN_SECRET || "restaurant-mng-access-secret", { expiresIn: "15m" });

  res.cookie("access_token", accessToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 15 * 60 * 1000 });

  res.json({ success: true, data: { user: { id: user.id, email: user.email, name: user.name } } });
});

// POST /api/auth/login
app.post("/api/auth/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
  const validation = validate(loginSchema, req.body);
  if (!validation.success) {
    return res.status(400).json({ success: false, error: validation.error });
  }

  const { email, password } = validation.data as any;

  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL }, {
    schema: process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).searchParams.get("schema") ?? "public" : "public",
  });
  const prisma = new PrismaClient({ adapter, log: process.env.NODE_ENV !== "production" ? ["query", "info", "warn", "error"] : [] });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ success: false, error: { code: "AUTHENTICATION_ERROR", message: "Invalid email or password." } });
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return res.status(401).json({ success: false, error: { code: "AUTHENTICATION_ERROR", message: "Invalid email or password." } });
  }

  const accessToken = jwt.sign({ userId: user.id, email: user.email }, process.env.ACCESS_TOKEN_SECRET || "restaurant-mng-access-secret", { expiresIn: "15m" });

  res.cookie("access_token", accessToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 15 * 60 * 1000 });

  res.json({ success: true, data: { user: { id: user.id, email: user.email, name: user.name } } });
});

// POST /api/auth/logout
app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("access_token", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" });
  res.json({ success: true, data: { message: "Logged out successfully." } });
});

// POST /api/security/revoke-all - Revoke all sessions for a tenant
app.post(
  "/api/security/revoke-all",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
  }),
  async (req, res) => {
    const cookie = req.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith("access_token="))?.slice("access_token=".length);
    let userId: string;
    try {
      const secret = process.env.ACCESS_TOKEN_SECRET || (process.env.NODE_ENV !== "production" ? "restaurant-mng-access-secret" : undefined);
      if (!cookie || !secret) return res.status(401).json({ success: false, error: { code: "AUTHENTICATION_ERROR", message: "Unauthorized" } });
      const payload = jwt.verify(decodeURIComponent(cookie), secret, { algorithms: ["HS256"] });
      if (typeof payload === "string" || typeof payload.userId !== "string" || !payload.userId) throw new Error("Invalid session");
      userId = payload.userId;
    } catch {
      return res.status(401).json({ success: false, error: { code: "AUTHENTICATION_ERROR", message: "Unauthorized" } });
    }

    const tenantId = req.get("X-Tenant-Id");
    if (!tenantId) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "X-Tenant-Id is required." } });

    try {
      // Create Prisma client instance
      const { PrismaClient } = require("@prisma/client");
      const { PrismaPg } = require("@prisma/adapter-pg");
      const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL }, {
        schema: process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).searchParams.get("schema") ?? "public" : "public",
      });
      const prisma = new PrismaClient({ adapter, log: process.env.NODE_ENV !== "production" ? ["query", "info", "warn", "error"] : [] });

      // Clear the user's access token cookie
      res.clearCookie("access_token", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" });

      // Invalidate all memberships for this user/tenant
      await prisma.membership.updateMany({
        where: { tenantId, userId, status: "ACTIVE" },
        data: { status: "REVOKED" },
      });

      return res.json({ success: true, data: { message: "All sessions revoked successfully." } });
    } catch (error) {
      console.error("Security revoke error:", error);
      return res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "Failed to revoke sessions." } });
    }
  }
);

// POST /api/pilot/feature-flag - Toggle a feature flag for a tenant/user
app.post(
  "/api/pilot/feature-flag",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
  }),
  async (req, res) => {
    const cookie = req.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith("access_token="))?.slice("access_token=".length);
    let userId: string;
    try {
      const secret = process.env.ACCESS_TOKEN_SECRET || (process.env.NODE_ENV !== "production" ? "restaurant-mng-access-secret" : undefined);
      if (!cookie || !secret) return res.status(401).json({ success: false, error: { code: "AUTHENTICATION_ERROR", message: "Unauthorized" } });
      const payload = jwt.verify(decodeURIComponent(cookie), secret, { algorithms: ["HS256"] });
      if (typeof payload === "string" || typeof payload.userId !== "string" || !payload.userId) throw new Error("Invalid session");
      userId = payload.userId;
    } catch {
      return res.status(401).json({ success: false, error: { code: "AUTHENTICATION_ERROR", message: "Unauthorized" } });
    }

    const tenantId = req.get("X-Tenant-Id");
    if (!tenantId) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "X-Tenant-Id is required." } });

    const { flag, enabled } = req.body;
    if (!flag) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "flag is required." } });

    try {
      // Create Prisma client instance
      const { PrismaClient } = require("@prisma/client");
      const { PrismaPg } = require("@prisma/adapter-pg");
      const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL }, {
        schema: process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).searchParams.get("schema") ?? "public" : "public",
      });
      const prisma = new PrismaClient({ adapter, log: process.env.NODE_ENV !== "production" ? ["query", "info", "warn", "error"] : [] });

      // Upsert the feature flag setting
      const setting = await prisma.feature_flag.upsert({
        where: { tenantId_flag: { tenantId, flag } },
        update: { enabled, updatedAt: new Date() },
        create: { tenantId, flag, enabled, userId },
      });

      return res.json({ success: true, data: { setting } });
    } catch (error) {
      console.error("Feature flag error:", error);
      return res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "Failed to update feature flag." } });
    }
  }
);

// GET /api/pilot/flags/:userId - Get all feature flags for a user in a tenant
app.get(
  "/api/pilot/flags/:userId",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
  }),
  async (req, res) => {
    const { userId } = req.params;
    const tenantId = req.get("X-Tenant-Id");
    if (!tenantId) return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "X-Tenant-Id is required." } });

    try {
      // Create Prisma client instance
      const { PrismaClient } = require("@prisma/client");
      const { PrismaPg } = require("@prisma/adapter-pg");
      const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL }, {
        schema: process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).searchParams.get("schema") ?? "public" : "public",
      });
      const prisma = new PrismaClient({ adapter, log: process.env.NODE_ENV !== "production" ? ["query", "info", "warn", "error"] : [] });

      const flags = await prisma.feature_flag.findMany({
        where: { tenantId },
        select: { flag: true, enabled: true },
      });

      return res.json({ success: true, data: { flags } });
    } catch (error) {
      console.error("Get feature flags error:", error);
      return res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "Failed to retrieve feature flags." } });
    }
  }
);

export default app;