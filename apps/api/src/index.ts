import "dotenv/config";
import express, { Express, Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import authRouter from "./auth.routes";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  ...(process.env.NODE_ENV !== "production" && {
    log: ["query", "info", "warn", "error"],
  }),
});

const app: Express = express();
const port = process.env.PORT || 4000;

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "10kb" }));

// Auth routes
app.use("/api/auth", authRouter);

// Health endpoints
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      status: "ok",
      service: "restaurant-mng-api",
      timestamp: new Date().toISOString(),
      version: "0.1.0",
      uptimeSeconds: Math.floor(process.uptime()),
    },
  });
});

app.get("/api/health/ready", async (_req: Request, res: Response) => {
  try {
    await prisma.$executeRaw`SELECT 1`;
    res.json({
      success: true,
      data: {
        status: "ready",
        database: "up",
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(503).json({
      success: false,
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Database unavailable",
      },
    });
  }
});

// Global error handler
app.use(
  (err: any, _req: Request, _res: Response, _next: NextFunction) => {
    console.error("Unhandled error:", err);
    _res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
      },
    });
  }
);

app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});