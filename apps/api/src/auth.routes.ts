import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import { z } from "zod";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Initialize PrismaClient with driver adapter for Prisma 7.x
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter, log: process.env.NODE_ENV !== "production" ? ["query", "info", "warn", "error"] : [] });

const router = express.Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function validate(schema: any, data: any) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = result.error.format();
    return { success: false, error: { code: "VALIDATION_ERROR", message: "Validation failed", details: errors } };
  }
  return { success: true, data: result.data };
}

// POST /api/auth/register
router.post("/register", rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false }), async (req: Request, res: Response) => {
  const validation = validate(registerSchema, req.body);
  if (!validation.success) {
    return res.status(400).json({ success: false, error: validation.error });
  }

  const { email, password, name } = validation.data;

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
router.post("/login", rateLimit({ windowMs: 15 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false }), async (req: Request, res: Response) => {
  const validation = validate(loginSchema, req.body);
  if (!validation.success) {
    return res.status(400).json({ success: false, error: validation.error });
  }

  const { email, password } = validation.data;

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
router.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie("access_token", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" });
  res.json({ success: true, data: { message: "Logged out successfully." } });
});

export default router;