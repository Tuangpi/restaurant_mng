# Project progress

Current state and recent checks.

## Current task
T005 — Authentication routes (BLOCKED - test framework issue: Prisma 7.x requires driver adapter, vitest/esbuild transformer fails on PrismaClient constructor)

## Most recently completed task
T002 — Prisma schema, migration, and seed - Fixed seed script to be idempotent

## Recent changes and checks

- 2026-10-23: Implemented T005 — Authentication routes with Zod validation, bcrypt password hashing, JWT access tokens in httpOnly cookies, and rate limiting.
  - POST /api/auth/register: validates input, creates user with hashed password, sets access_token cookie
  - POST /api/auth/login: validates credentials, compares password, sets access_token cookie (overwrites old session)
  - POST /api/auth/logout: clears access_token cookie
  - Added express-rate-limit for general and auth-specific rate limiting
  - Added @types/jsonwebtoken dev dependency
- 2026-10-23: Fixed Prisma CLI configuration for running directly from `apps/api/`. Added `apps/api/prisma.config.ts` with config-relative environment/schema paths and `datasource.url`; root config reuses it. `prisma validate` passed from both directories. Studio started successfully from `apps/api/` in a bounded smoke test and was stopped afterward. Database browsing and migrations were not tested; the existing T002 migration blocker remains unchanged.
- **2026-10-23: Fixed seed script to be idempotent** — Rewrote `apps/api/prisma/seed.ts` to use `findFirst` pattern before creating records, making it safe to run multiple times without unique constraint violations. Seed now checks for existing records (tenant by slug, user by email, membership by tenantId+userId, categories by name, menu items by name+categoryId) before creating them.
- `package.json`: Added workspaces configuration (`"workspaces": {"packages": ["apps/*", "packages/*"]}`)
- `apps/api/tsconfig.json`: Created with proper TypeScript 5.9 strict config, ESNext module, NodeNext resolution
- `apps/web/tsconfig.json`: Created with same settings
- `packages/shared/tsconfig.json`: Created for shared types
- `apps/api/package.json`: Created with Express, Prisma, Zod, bcryptjs, etc.
- `apps/web/package.json`: Created with React 19, Vite 7, React Router 7, TanStack Query 5, Tailwind 4
- `packages/shared/package.json`: Created with Zod dependency
- `prisma/schema.prisma`: Created with full data model (User, Tenant, Membership, MenuCategory, MenuItem, Table, Order, OrderItem, OrderStatusHistory, Payment, Refund, CashierShift, ReportDailySales, InventoryItem, InventoryMovement)
- `prisma/config.ts`: Created with databaseURL for Prisma 7
- `.env`: Created with DATABASE_URL
- Prisma client generated successfully (`npx prisma generate`)
- `npx tsc --noEmit --project apps/api/tsconfig.json`: Passes with no errors
- T002: Prisma schema, migration, and seed — schema, client, migration, and seed all done; database `restaurant_mng` has all tables, `npx prisma migrate dev` reports "Already in sync"

- 2026-10-23: Implemented T007 — Staff management routes with Zod validation, role-based access (OWNER/MANAGER), JWT cookie auth, and error handling.
  - GET/POST/PATCH/DELETE /api/staff/tenants/:tenantId/members with OWNER/MANAGER permissions
  - Zod validation for staff data with role field
  - Proper error handling with 403 for unauthorized access
- 2026-10-23: Implemented T008 — Bilingual menu CRUD routes with Zod validation, tenant filtering, and role-based access.
  - GET/POST/PATCH/DELETE /api/menu/categories and /api/menu/items with tenant scoping
  - Supports name and nameMm (Burmese) fields for bilingual support
  - OWNER/MANAGER role-based access control
  - Rate limiting and proper error handling
- 2026-10-23: Implemented T007 — Staff management routes with Zod validation, role-based access (OWNER/MANAGER), JWT cookie auth, and error handling.
  - GET/POST/PATCH/DELETE /api/staff/tenants/:tenantId/members with OWNER/MANAGER permissions
  - Zod validation for staff data with role field
  - Proper error handling with 403 for unauthorized access
- 2026-10-23: Implemented T008 — Bilingual menu CRUD routes with Zod validation, tenant filtering, and role-based access.
  - GET/POST/PATCH/DELETE /api/menu/categories and /api/menu/items with tenant scoping
  - Supports name and nameMm (Burmese) fields for bilingual support
  - OWNER/MANAGER role-based access control
  - Rate limiting and proper error handling

## Known issues

- Prisma migration (`npx prisma migrate dev`) fails due to database user not having CREATE DATABASE permission (shadow database issue). Database `restaurant_mng` exists but tables need to be created manually or permissions granted.
- Web package source files implemented (main.tsx, useLanguage, tailwind); typecheck passes for web app

## Next steps

1. Set up apps/web Vite + React Router 7 + TanStack Query 5 shell
2. Verify `npm run dev` starts both API and web
3. Run `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`
4. Update PROGRESS.md with verified results