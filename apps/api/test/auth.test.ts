import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { config } from 'dotenv'
import { Client } from 'pg'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import app from '../src/index.ts'

// Never clean up the application database; run against an isolated temporary schema.
// Force the app .env (postgres superuser, allowed to create temp schemas) over any
// ambient vitest-loaded root .env so behavior is deterministic.
const envPath = new URL('../.env', import.meta.url)
const parsed = config({ path: envPath, override: true }).parsed ?? {}
const originalUrl = (parsed.DATABASE_URL ?? process.env.DATABASE_URL)!
const schema = `auth_test_${randomUUID().replaceAll("-", "")}`
const admin = new Client({ connectionString: originalUrl })
let prisma: PrismaClient

beforeAll(async () => {
  await admin.connect()
  await admin.query(`CREATE SCHEMA "${schema}"`)
  await admin.query(`SET search_path TO "${schema}"`)
  for (const migration of [
    "20261023064949",
    "20261024120640_add_tenant_tax_service_charge_rate",
    "20261024163000_sync_operations",
  ]) {
    await admin.query(await readFile(new URL(`../prisma/migrations/${migration}/migration.sql`, import.meta.url), "utf8"))
  }
  const url = new URL(originalUrl!)
  url.searchParams.set("schema", schema)
  process.env.DATABASE_URL = url.toString()
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }, { schema }) })
}, 20000)

afterAll(async () => {
  await prisma?.$disconnect()
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
  await admin.end()
  if (originalUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = originalUrl
})

describe('Auth Routes (isolated PostgreSQL schema)', () => {
  beforeEach(async () => {
    // Clear database state between tests for test isolation (isolated schema only)
    await prisma.user.deleteMany({})
  })

  describe('POST /api/auth/register', () => {
    it('should register a new user with valid data', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User',
        })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.user).toBeDefined()
      expect(response.body.data.user.email).toBe('test@example.com')
      expect(response.body.data.user.name).toBe('Test User')
    })

    it('should return VALIDATION_ERROR for invalid email', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'invalid',
          password: 'password123',
          name: 'Test User',
        })

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('should return USER_EXISTS if email already registered', async () => {
      // First register
      await request(app).post('/api/auth/register').send({
        email: 'duplicate@example.com',
        password: 'password123',
        name: 'Test User',
      })
      // Try to register again
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'password123',
          name: 'Test User',
        })

      expect(response.status).toBe(409)
      expect(response.body.success).toBe(false)
      expect(response.body.error.code).toBe('USER_EXISTS')
    })
  })

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Register a test user before login
      await request(app).post('/api/auth/register').send({
        email: 'login@example.com',
        password: 'password123',
        name: 'Login User',
      })
    })

    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'password123',
        })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.user).toBeDefined()
      expect(response.headers['set-cookie']).toBeDefined()
    })

    it('should return AUTHENTICATION_ERROR for invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'wrongpassword',
        })

      expect(response.status).toBe(401)
      expect(response.body.success).toBe(false)
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR')
    })

    it('should return AUTHENTICATION_ERROR for non-existent user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123',
        })

      expect(response.status).toBe(401)
      expect(response.body.success).toBe(false)
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR')
    })
  })

  describe('POST /api/auth/logout', () => {
    it('should clear the access_token cookie', async () => {
      const response = await request(app).post('/api/auth/logout')

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      // Cookie should be cleared
      expect(response.headers['set-cookie']?.[0]).toContain('access_token=;')
    })
  })
})