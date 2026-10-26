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
const schema = `sec_test_${randomUUID().replaceAll("-", "")}`;
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
  await admin.query(
    await readFile(
      new URL("../prisma/migrations/20261023064949/migration.sql", import.meta.url),
      "utf8"
    )
  );
  await admin.query(
    await readFile(
      new URL("../prisma/migrations/20261024120640_add_tenant_tax_service_charge_rate/migration.sql", import.meta.url),
      "utf8"
    )
  );
  const url = new URL(originalUrl!);
  url.searchParams.set("schema", schema);
  process.env.DATABASE_URL = url.toString();
  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.toString() }, { schema }),
  });
  const { default: router } = await import("../src/security.routes.ts");
  app.use("/api/security", router);
  const user = await prisma.user.create({
    data: { email: "sec@example.test", name: "Sec tester", passwordHash: "unused" },
  });
  userId = user.id;
  const tenant = await prisma.tenant.create({ data: { name: "Sec test", slug: "sec-test" } });
  tenantId = tenant.id;
  await prisma.membership.create({
    data: { userId, tenantId, role: "OWNER", status: "ACTIVE" },
  });
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

describe("Security (isolated PostgreSQL schema)", () => {
  it("requires session and tenant header", async () => {
    expect((await request(app).post("/api/security/revoke-all")).status).toBe(401);
    expect(
      (await request(app).post("/api/security/revoke-all").set("Cookie", cookie)).status
    ).toBe(400);
  });

  it("revokes active memberships and clears cookie", async () => {
    const res = await request(app)
      .post("/api/security/revoke-all")
      .set("Cookie", cookie)
      .set("X-Tenant-Id", tenantId);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const membership = await prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });
    expect(membership?.status).toBe("REVOKED");
  });
});
