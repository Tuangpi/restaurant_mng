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

// Never use the existing auth suite's deleteMany cleanup against application data.
// Force the app .env (postgres superuser, allowed to create temp schemas) over any
// ambient vitest-loaded root .env so behavior is deterministic.
const envPath = new URL("../.env", import.meta.url);
const parsed = config({ path: envPath, override: true }).parsed ?? {};
const originalUrl = (parsed.DATABASE_URL ?? process.env.DATABASE_URL)!;
const schema = `sync_test_${randomUUID().replaceAll("-", "")}`;
const admin = new Client({ connectionString: originalUrl });
let prisma: PrismaClient;
const app = express();
app.use(express.json());
let tenantId: string;
let otherTenantId: string;
let userId: string;
let menuItemId: string;
let otherMenuItemId: string;
let otherTableId: string;
let cookie: string;

beforeAll(async () => {
  await admin.connect()
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await admin.query(`SET search_path TO "${schema}"`);
  for (const migration of ["20261023064949", "20261024120640_add_tenant_tax_service_charge_rate", "20261024163000_sync_operations", "20261024170000_sync_operation_status"]) {
    await admin.query(await readFile(new URL(`../prisma/migrations/${migration}/migration.sql`, import.meta.url), "utf8"));
  }
  const url = new URL(originalUrl!);
  url.searchParams.set("schema", schema);
  process.env.DATABASE_URL = url.toString();
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }, { schema }) });
  const { default: router } = await import("../src/sync.routes.ts");
  app.use("/api/sync", router);
  const user = await prisma.user.create({ data: { email: "sync@example.test", name: "Sync tester", passwordHash: "unused" } });
  userId = user.id;
  const tenant = await prisma.tenant.create({ data: { name: "Sync test", slug: "sync-test" } });
  const other = await prisma.tenant.create({ data: { name: "Other", slug: "other" } });
  tenantId = tenant.id;
  otherTenantId = other.id;
  await prisma.membership.create({ data: { userId, tenantId, role: "CASHIER" } });
  menuItemId = (await prisma.menuItem.create({ data: { tenantId, name: "Tea", price: 1500 } })).id;
  otherMenuItemId = (await prisma.menuItem.create({ data: { tenantId: otherTenantId, name: "Other tea", price: 100 } })).id;
  otherTableId = (await prisma.table.create({ data: { tenantId: otherTenantId, name: "Other table", seats: 2 } })).id;
  cookie = `access_token=${jwt.sign({ userId }, process.env.ACCESS_TOKEN_SECRET || "restaurant-mng-access-secret", { expiresIn: "15m" })}`;
}, 20000);

afterAll(async () => {
  await prisma?.$disconnect();
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.end();
  if (originalUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalUrl;
});

function operation(key = randomUUID(), payload: unknown = { type: "DINE_IN", items: [{ menuItemId, quantity: 2 }] }) {
  return { idempotencyKey: key, entity: "ORDER", operation: "CREATE", payload };
}

function sync(operations: unknown[], tenant = tenantId) {
  return request(app).post("/api/sync").set("Cookie", cookie).set("X-Tenant-Id", tenant)
    .send({ clientId: "test-device", operations });
}

describe("Offline sync (isolated PostgreSQL schema)", () => {
  it("requires a signed, unexpired session and tenant header", async () => {
    expect((await request(app).post("/api/sync").send({})).status).toBe(401);
    const forged = jwt.sign({ userId }, "wrong-secret");
    expect((await request(app).post("/api/sync").set("Cookie", `access_token=${forged}`).send({})).status).toBe(401);
    const expired = jwt.sign({ userId }, process.env.ACCESS_TOKEN_SECRET || "restaurant-mng-access-secret", { expiresIn: -1 });
    expect((await request(app).post("/api/sync").set("Cookie", `access_token=${expired}`).send({})).status).toBe(401);
    expect((await request(app).post("/api/sync").set("Cookie", cookie).send({})).status).toBe(400);
  });

  it("denies nonmembers, kitchen staff, and inactive memberships", async () => {
    expect((await sync([operation()], otherTenantId)).status).toBe(403);
    for (const data of [{ role: "KITCHEN" }, { role: "CASHIER", status: "INACTIVE" }]) {
      await prisma.membership.update({ where: { tenantId_userId: { tenantId, userId } }, data });
      expect((await sync([operation()])).status).toBe(403);
    }
    await prisma.membership.update({ where: { tenantId_userId: { tenantId, userId } }, data: { role: "CASHIER", status: "ACTIVE" } });
  });

  it("rejects malformed, empty, oversized, and tenant-overriding batches", async () => {
    expect((await sync([])).status).toBe(400);
    expect((await sync(Array.from({ length: 101 }, () => operation()))).status).toBe(400);
    expect((await sync([{ ...operation(), idempotencyKey: "" }])).status).toBe(400);
    const response = await request(app).post("/api/sync").set("Cookie", cookie).set("X-Tenant-Id", tenantId)
      .send({ clientId: "device", tenantId: otherTenantId, operations: [operation()] });
    expect(response.status).toBe(400);
  });

  it("creates snapshots and totals, and replays the original entity across devices", async () => {
    const op = operation();
    const response = await sync([op, op]);
    expect(response.status).toBe(200);
    const [applied, duplicate] = response.body.data.results;
    expect(applied.status).toBe("APPLIED");
    expect(duplicate).toEqual({ ...applied, status: "DUPLICATE" });
    const order = await prisma.order.findUniqueOrThrow({ where: { id: applied.entityId }, include: { orderItems: true, orderHistory: true } });
    expect(order).toMatchObject({ tenantId, subtotal: 3000, tax: 210, total: 3210, createdById: userId });
    expect(order.orderItems[0]).toMatchObject({ name: "Tea", unitPrice: 1500, quantity: 2, lineTotal: 3000 });
    expect(order.orderHistory).toHaveLength(1);
    expect(Number.isNaN(Date.parse(response.body.data.serverTime))).toBe(false);
    const retry = await request(app).post("/api/sync").set("Cookie", cookie).set("X-Tenant-Id", tenantId)
      .send({ clientId: "another-device", operations: [op] });
    expect(retry.body.data.results[0]).toEqual(duplicate);
  });

  it("returns per-operation failures without partial orders and continues in order", async () => {
    const before = await prisma.order.count();
    const response = await sync([
      operation(undefined, { type: "DINE_IN", items: [{ menuItemId, quantity: 1 }, { menuItemId: otherMenuItemId, quantity: 1 }] }),
      operation(undefined, { type: "DINE_IN", tableId: otherTableId, items: [{ menuItemId, quantity: 1 }] }),
      operation(undefined, { type: "DINE_IN", items: [{ menuItemId, quantity: -1 }] }),
      operation(undefined, { type: "DINE_IN", items: [{ menuItemId, quantity: 1, price: 1 }] }),
      { ...operation(), entity: "PAYMENT" },
      operation(),
    ]);
    expect(response.body.data.results.map((r: { status: string }) => r.status)).toEqual(["REJECTED", "REJECTED", "REJECTED", "REJECTED", "REJECTED", "APPLIED"]);
    expect(response.body.data.results.slice(0, 5).map((r: { error: { code: string } }) => r.error.code))
      .toEqual(["ITEM_NOT_FOUND", "TABLE_NOT_FOUND", "VALIDATION_ERROR", "VALIDATION_ERROR", "UNSUPPORTED_OPERATION"]);
    expect(await prisma.order.count()).toBe(before + 1);
  });

  it("rejects unavailable menu items and permits retry after correction", async () => {
    const op = operation();
    await prisma.menuItem.update({ where: { id: menuItemId }, data: { isAvailable: false } });
    expect((await sync([op])).body.data.results[0].status).toBe("REJECTED");
    await prisma.menuItem.update({ where: { id: menuItemId }, data: { isAvailable: true } });
    expect((await sync([op])).body.data.results[0].status).toBe("APPLIED");
  });

  it("does not duplicate concurrent retries", async () => {
    const op = operation();
    const before = await prisma.order.count();
    const responses = await Promise.all([sync([op]), sync([op])]);
    expect(responses.map((r) => r.body.data.results[0].status).sort()).toEqual(["APPLIED", "DUPLICATE"]);
    expect(await prisma.order.count()).toBe(before + 1);
  });

  it("rolls back orders, items, and history if replay-log persistence fails", async () => {
    const op = operation();
    const before = await Promise.all([prisma.order.count(), prisma.orderItem.count(), prisma.orderStatusHistory.count()]);
    await admin.query(`CREATE FUNCTION fail_sync_log() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test persistence failure'; END $$`);
    await admin.query(`CREATE TRIGGER fail_sync_log BEFORE INSERT ON "SyncOperation" FOR EACH ROW EXECUTE FUNCTION fail_sync_log()`);
    try {
      const response = await sync([op]);
      expect(response.body.data.results[0]).toMatchObject({ status: "REJECTED", error: { code: "INTERNAL_ERROR" } });
      expect(JSON.stringify(response.body)).not.toContain("test persistence failure");
      expect(await Promise.all([prisma.order.count(), prisma.orderItem.count(), prisma.orderStatusHistory.count()])).toEqual(before);
    } finally {
      await admin.query(`DROP TRIGGER fail_sync_log ON "SyncOperation"`);
      await admin.query(`DROP FUNCTION fail_sync_log()`);
    }
    expect((await sync([op])).body.data.results[0].status).toBe("APPLIED");
  });

  it("rejects MMK totals that would overflow database integers", async () => {
    const expensive = await prisma.menuItem.create({ data: { tenantId, name: "Overflow", price: 2147483647 } });
    const response = await sync([operation(undefined, { type: "DINE_IN", items: [{ menuItemId: expensive.id, quantity: 1 }] })]);
    expect(response.body.data.results[0]).toMatchObject({ status: "REJECTED", error: { code: "VALIDATION_ERROR" } });
  });

  it("scopes the same key independently to each authorized tenant", async () => {
    await prisma.membership.create({ data: { tenantId: otherTenantId, userId, role: "WAITER" } });
    const key = randomUUID();
    const first = await sync([operation(key)]);
    const second = await sync([operation(key, { type: "TAKEAWAY", items: [{ menuItemId: otherMenuItemId, quantity: 1 }] })], otherTenantId);
    expect(first.body.data.results[0].status).toBe("APPLIED");
    expect(second.body.data.results[0].status).toBe("APPLIED");
    expect(first.body.data.results[0].entityId).not.toBe(second.body.data.results[0].entityId);
  });

  it("returns queue stats per status", async () => {
    const res = await request(app).get("/api/sync/queue-stats").set("Cookie", cookie).set("X-Tenant-Id", tenantId);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      pending: expect.any(Number),
      applied: expect.any(Number),
      duplicate: expect.any(Number),
      failed: expect.any(Number),
      retentionDays: 30,
    });
  });

  it("counts applied operations in queue stats", async () => {
    const before = await request(app).get("/api/sync/queue-stats").set("Cookie", cookie).set("X-Tenant-Id", tenantId);
    await sync([operation()]);
    const after = await request(app).get("/api/sync/queue-stats").set("Cookie", cookie).set("X-Tenant-Id", tenantId);
    expect(after.body.data.applied).toBeGreaterThanOrEqual(before.body.data.applied + 1);
  });
});