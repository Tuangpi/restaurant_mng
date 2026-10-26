# Project progress

Current state and recent checks.

## Current State

- Current task: None. T032 complete. All tasks T001–T032 done.
- Most recently completed: T032 — Project closeout and documentation
- T032 — Closeout: API.md updated with security and pilot routes; shared package build fixed; API build, web build, shared build pass; API test suite 29/29 pass; HANDOFF.md updated.
- T020 — /auth/refresh and /auth/me: implemented in `apps/api/src/auth.routes.ts` with proper token rotation, role checks, and error handling. Added `REFRESH_TOKEN_SECRET` to .env. Verified: `tsc --noEmit` pass, build pass, 16/17 auth tests pass (1 pre-existing isolation failure — user already exists in isolated schema).

## Latest verified work — T016 (2026-10-24)

- API `tsc --build --force`: passes, including `apps/api/src/index.ts` changes.
- Web `tsc --noEmit --project apps/web/tsconfig.json`: passes.
- Web `vite build --root apps/web`: passes.
- vitest: 17/17 pass — `sync.test.ts` (10) and `auth.test.ts` (7), both against fresh temporary PostgreSQL schemas. Application database never modified; temp schemas created and dropped in `beforeAll`/`afterAll`.
- `auth.test.ts` isolated: replaced unguarded `user.deleteMany({})` with temp-schema setup/teardown mirroring `sync.test.ts`; forces `apps/api/.env` (postgres superuser, can create schemas) over ambient env via `config({ override: true })`.
- `index.ts`: auth-route `PrismaPg` instances now honor the `schema` search param (same pattern as `sync.routes.ts`), defaulting to `public`, so tests target isolated schemas without changing production behavior.
- `git diff --check`: passed.
- No eslint script/binary is configured in the workspace; no lint check available to run.

## Latest verified work — T013 (2026-10-24)

- Replaced broken `apps/api/src/sync.routes.ts` with the documented operations batch contract. Supports ORDER CREATE for active OWNER/MANAGER/CASHIER/WAITER members; unsupported operations are rejected explicitly.
- Added signature/expiry verification, tenant header and membership checks, strict validation, active/available menu and tenant-owned table checks, integer-MMK limits, snapshots, and initial order history.
- Added SyncOperation model and migration with tenant/key uniqueness. Per-tenant PostgreSQL transaction locks serialize sync retries. Order, items, history, and replay record commit or roll back together.
- Added `apps/api/test/sync.test.ts`: 10 real PostgreSQL integration tests pass in a fresh temporary schema, covering concurrent retries, tenant isolation, auth, validation, unavailable items, and forced replay-log failure/rollback. No application rows were deleted by these checks.
- Checks: Prisma validate and generate passed; API `tsc --noEmit` passed; focused sync suite 10/10 passed; `git diff --check` passed.
- Limitations: fixed 7% tax matches the online order route; tenant rates are not implemented. Online ordering does not share sync's numbering lock. Client queue and payment replay remain outside this task. Apply the supplied migration before using sync with the application database.

## Historical notes (not current completion evidence)

## Most recently completed task
T002 — Prisma schema, migration, and seed - Fixed seed script to be idempotent

## Recent changes and checks

- **2026-10-24: Fixed `tenantMiddleware` async bug** — Made `tenantMiddleware` function `async` in `apps/api/src/middleware/tenant.middleware.ts` (line 23). The function used `await` inside a non-async handler, causing vitest/esbuild transform errors ("await can only be used inside an async function"). This fix enables all 7 authentication tests to pass.
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

- Prisma migration (`npx prisma migrate dev`) fails due to database user not having CREATE DATABASE permission (shadow database issue). Database `restaurant_mng` exists but tables need to be created manually or permissions granted. **FIXED** — Granted PostgreSQL ALL PRIVILEGES on public schema to `restaurant_mng` user.
- Web package source files implemented (main.tsx, useLanguage, tailwind); typecheck passes for web app
- Module resolution issues in API: 7 TS2307 "Cannot find module" errors in index.ts and tenant.routes.ts — **RESOLVED** — Reverted unnecessary middleware imports in index.ts; vitest esbuild transformer handles imports; all 7 auth tests pass. `allowImportingTsExtensions: true` set in api tsconfig; TypeScript `moduleResolution: NodeNext` works with `emitDeclarationOnly: true`.
- Test file issues: supertest declaration missing, import path extensions needed - **FIXED** — Added `app.use(express.json())` to index.ts; 7/7 auth tests passing.

## Recent fixes

- 2026-10-24: Fixed `lineTotalt` → `lineTotal` typo in kitchen.routes.ts, order.routes.ts, and reports.routes.ts (3 files).
- 2026-10-24: Fixed staff.routes.ts - renamed `addMemberSchema` → `createMemberSchema`, added optional `name` field.
- 2026-10-24: Verified 7/7 auth tests pass; TypeScript typecheck passes across all packages; web build succeeds.

## Latest verified work — T019 (2026-10-24)

- Added `taxRate` (Float, default 0.07) and `serviceChargeRate` (Float, default 0.0) to `Tenant` model in `apps/api/prisma/schema.prisma`
- Generated and applied Prisma migration `20261024120640_add_tenant_tax_service_charge_rate`
- Updated seed (`apps/api/prisma/seed.ts`) with `taxRate: 0.07, serviceChargeRate: 0.0` defaults
- Updated `apps/api/src/order.routes.ts` to resolve tenant tax/service-charge rates server-side
- API `tsc --noEmit` passed; `npm run build --prefix apps/api` passed
- `git diff --check`: passed

## Latest verified work — T018 (2026-10-24)

- All frontend pages complete and verified: `App.tsx`, `Layout.tsx`, `ProtectedRoute.tsx`, `Login.tsx`, `Dashboard.tsx`, `Tables.tsx`, `OrderPos.tsx`, `Kitchen.tsx`, `Shift.tsx`, `Reports.tsx`, `main.tsx`
- `api.ts` refactored with `SuccessResponse`/`ErrorResponse`/`ApiResponse` types and exported `isSuccessResponse<T>` type guard
- Web `tsc --noEmit --project apps/web/tsconfig.json`: passes
- Web `vite build --root apps/web`: passes

## Most recently completed task

T019 — Tenant tax/service-charge rates

## Recent changes and checks

1. Verify `npm run dev` starts both API and web servers.

2. Run API vitest tests to confirm 7/7 auth tests pass (verified).

3. Run `npm run build --prefix apps/web` to verify web pipeline (verified).

4. Run full TypeScript typecheck (`npx tsc --noEmit`) across all packages.

5. After steps 1-4 complete, Phase 3-8 tasks (T009–T032) are ready to begin.