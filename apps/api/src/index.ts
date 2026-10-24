const app = express()
import express from "express"
import tenantRouter from "./tenant.routes";
import staffRouter from "./staff.routes";
import orderRouter from "./order.routes";
import paymentsRouter from "./payments.routes";
import reportsRouter from "./reports.routes";
import inventoryRouter from "./inventory.routes";
import kitchenRouter from "./kitchen.routes";
import "dotenv/config";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { z } from "zod";

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
app.post("/api/auth/register", rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
  const validation = validate(registerSchema, req.body);
  if (!validation.success) {
    return res.status(400).json(validation.error);
  }

  const { email, password, name } = validation.data as any;

  // Check if user already exists (using Prisma)
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
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
    return res.status(400).json(validation.error);
  }

  const { email, password } = validation.data as any;

  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
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

export default app;