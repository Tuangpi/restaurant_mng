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
const schema = `inv_test_${randomUUID().replaceAll("-", "")}`;
const admin = new Client({ connectionString: originalUrl });
let prisma: PrismaClient;
const app = express();
app.use(express.json());
let tenantId: string;
let otherTenantId: string;
let userId: string;
let cookie: string;
let itemId: string;

beforeAll(async () => {
  await admin.connect();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await admin.query(`SET search_path TO "${schema}"`);
  for (const migration of ["20261023064949", "20261024120640_add_tenant_tax_service_charge_rate", "20261024163000_sync_operations", "20261024170000_sync_operation_status"]) {
    await admin.query(await readFile(new URL(`../prisma/migrations/${migration}/migration.sql`, import.meta.url), "utf8"));
  }
  const url = new URL(originalUrl!);
  url.searchParams.set("schema", schema);
  process.env.DATABASE_URL = url.toString();
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }, { schema }) });
  const { default: router } = await import("../src/inventory.routes.ts");
  app.use("/api/inventory", router);
  const user = await prisma.user.create({ data: { email: "inv@example.test", name: "Inv tester", passwordHash: "unused" } });
  userId = user.id;
  const tenant = await prisma.tenant.create({ data: { name: "Inv test", slug: "inv-test" } });
  const other = await prisma.tenant.create({ data: { name: "Other", slug: "other" } });
  tenantId = tenant.id;
  otherTenantId = other.id;
  await prisma.membership.create({ data: { userId, tenantId, role: "OWNER", status: "ACTIVE" } });
  await prisma.membership.create({ data: { userId, tenantId: otherTenantId, role: "OWNER", status: "ACTIVE" } });
  cookie = `access_token=${jwt.sign({ userId }, process.env.ACCESS_TOKEN_SECRET || "restaurant-mng-access-secret", { expiresIn: "15m" })}`;
}, 20000);

afterAll(async () => {
  await prisma?.$disconnect();
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.end();
  if (originalUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalUrl;
});

describe("Inventory (isolated PostgreSQL schema)", () => {
  it("requires session and tenant header", async () => {
    expect((await request(app).get("/api/inventory")).status).toBe(401);
    expect((await request(app).get("/api/inventory").set("Cookie", cookie)).status).toBe(400);
  });

  it("creates an item as owner", async () => {
    const res = await request(app)
      .post("/api/inventory")
      .set("Cookie", cookie)
      .set("X-Tenant-Id", tenantId)
      .send({ name: "Rice", unit: "kg", quantityOnHand: 10, reorderLevel: 2 });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe("Rice");
    itemId = res.body.data.id;
  });

  it("validates payload", async () => {
    const res = await request(app)
      .post("/api/inventory")
      .set("Cookie", cookie)
      .set("X-Tenant-Id", tenantId)
      .send({ unit: "kg" });
    expect(res.status).toBe(400);
  });

  it("lists items for cashier", async () => {
    await prisma.membership.update({ where: { tenantId_userId: { tenantId, userId } }, data: { role: "CASHIER" } });
    const res = await request(app).get("/api/inventory").set("Cookie", cookie).set("X-Tenant-Id", tenantId);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(1);
  });

  it("denies create/update for cashier", async () => {
    const createRes = await request(app)
      .post("/api/inventory")
      .set("Cookie", cookie)
      .set("X-Tenant-Id", tenantId)
      .send({ name: "Tea" });
    expect(createRes.status).toBe(403);

    const updateRes = await request(app)
      .put(`/api/inventory/${itemId}`)
      .set("Cookie", cookie)
      .set("X-Tenant-Id", tenantId)
      .send({ quantityOnHand: 5 });
    expect(updateRes.status).toBe(403);
  });

  it("allows owner to update and enforces tenant isolation", async () => {
    await prisma.membership.update({ where: { tenantId_userId: { tenantId, userId } }, data: { role: "OWNER" } });
    const updateRes = await request(app)
      .put(`/api/inventory/${itemId}`)
      .set("Cookie", cookie)
      .set("X-Tenant-Id", tenantId)
      .send({ quantityOnHand: 5 });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.quantityOnHand).toBe(5);

    const otherRes = await request(app)
      .put(`/api/inventory/${itemId}`)
      .set("Cookie", cookie)
      .set("X-Tenant-Id", otherTenantId)
      .send({ quantityOnHand: 1 });
    expect(otherRes.status).toBe(404);
  });
});
