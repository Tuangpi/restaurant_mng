import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import app from '../src/index.ts'

describe('Auth Routes', () => {
  beforeEach(async () => {
    // Clear database state between tests for test isolation
    const { PrismaClient } = require('@prisma/client')
    const { PrismaPg } = require('@prisma/adapter-pg')
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
    const prisma = new PrismaClient({ adapter })
    await prisma.user.deleteMany({})
    await prisma.$disconnect()
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