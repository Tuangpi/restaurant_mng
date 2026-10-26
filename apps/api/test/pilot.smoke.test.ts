import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { config } from "dotenv";
import { Client } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const envPath = new URL("../.env", import.meta.url);
const parsed = config({ path: envPath, override: true }).parsed ?? {};
const originalUrl = (parsed.DATABASE_URL ?? process.env.DATABASE_URL)!;
const schema = `pilot_test_${randomUUID().replaceAll("-", "")}`;
const admin = new Client({ connectionString: originalUrl });
let prisma: PrismaClient;
const app = express();
app.use(express.json());
let tenantId: string;
let userId: string;
let cookie: string;

beforeAll(async () => {
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await admin.query(`SET search_path TO "${schema}"`);
  for (const migration of [
    "20261023064949",
    "20261024120640_add_tenant_tax_service_charge_rate",
    "20261026120000_pilot_feature_flags",
  ]) {
    await admin.query(
      await readFile(
        new URL(`../prisma/migrations/${migration}/migration.sql`, import.meta.url),
        "utf8"
      )
    );
  }
  const url = new URL(originalUrl!);
  url.searchParams.set("schema", schema);
  process.env.DATABASE_URL = url.toString();
  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.toString() }, { schema }),
  });
  const { default: router } = await import("../src/pilot.routes.ts");
  app.use("/api/pilot", router);
  const user = await prisma.user.create({
    data: { email: "pilot@example.test", name: "Pilot tester", passwordHash: "unused" },
  });
  userId = user.id;
  const tenant = await prisma.tenant.create({ data: { name: "Pilot test", slug: "pilot-test" } });
  tenantId = tenant.id;
  await prisma.membership.create({ data: { userId, tenantId, role: "OWNER", status: "ACTIVE" } });
  cookie = `access_token=${jwt.sign(
    { userId },
    process.env.ACCESS_TOKEN_SECRET || "restaurant-mng-access-secret",
    { expiresIn: "15m" }
  )}`;
}, 20000);

afterAll(async () => {
  await prisma?.$disconnect();
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.end();
  if (originalUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalUrl;
});

describe("Pilot (isolated PostgreSQL schema)", () => {
  it("requires session and tenant header", async () => {
    expect((await request(app).post("/api/pilot/feature-flag")).status).toBe(401);
    expect(
      (await request(app)
        .post("/api/pilot/feature-flag")
        .set("Cookie", cookie)
        .send({ flag: "analytics", enabled: true })).status
    ).toBe(400);
  });

  it("toggles and retrieves feature flags", async () => {
    const toggleRes = await request(app)
      .post("/api/pilot/feature-flag")
      .set("Cookie", cookie)
      .set("X-Tenant-Id", tenantId)
      .send({ flag: "analytics", enabled: true });
    expect(toggleRes.status).toBe(200);
    expect(toggleRes.body.data.setting.enabled).toBe(true);

    const getRes = await request(app)
      .get(`/api/pilot/flags/${userId}`)
      .set("X-Tenant-Id", tenantId);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.flags).toEqual(
      expect.arrayContaining([expect.objectContaining({ flag: "analytics", enabled: true })])
    );
  });
});
