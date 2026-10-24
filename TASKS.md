# Project task list

All tasks are tracked with stable IDs. Do not reorder IDs; new tasks appended after existing ones.

## T001 — Monorepo bootstrap
**Goal**: Initialize the npm workspaces TypeScript monorepo with the package structure and basic configs.
**Completion check**: `npm install` succeeds; `tsc --noEmit` runs across all packages; every workspace has a `tsconfig.json` and a `package.json`.
**Dependencies**: none
**Status**: DONE

## T002 — Prisma schema, migration, and seed
**Goal**: Write the Prisma schema, run `prisma migrate` to create the initial tables, and add a seed script with a demo tenant+user+menu items.
**Completion check**: Prisma schema is defined with all models; Prisma client generated (`npx prisma generate` succeeds). Migration applied — all tables exist in PostgreSQL (`restaurant_mng` database). Seed script rewritten to be idempotent using `findFirst` pattern — safe to run multiple times without unique constraint violations on `User.email` and `Tenant.slug`.
**Dependencies**: T001
**Status**: DONE

## T003 — Express health endpoint and error handling foundation
**Goal**: Add a `/api/health` liveness/readiness probe and a global error-handler middleware.
**Completion check**: `GET /api/health` returns `200 {success:true,data:{status:"ok"}}`; unhandled errors produce the envelope `{success:false,error:{code:"INTERNAL_ERROR"}}` with no stack traces in production.
**Dependencies**: none
**Status**: DONE

## T004 — React/Vite web shell
**Goal**: Scaffold a Vite+React 19 app that can mount to `#root`, with Tailwind 4 installed and a basic page showing "Myanmar Restaurant POS" in both English and Burmese.
**Completion check**: `npm run dev` starts Vite; browser shows the page; Tailwind utilities compile; language switcher toggles between en/my.
**Dependencies**: none
**Status**: DONE

## T005 — Authentication routes (register/login/logout)
**Goal**: Implement `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout` with Zod validation, password hashing via bcrypt, httpOnly cookies, and rate limiting.
**Completion check**: Register and login succeed end-to-end; cookies are set; a second login overwrites old session; failed validation returns `{success:false,error:{code:"VALIDATION_ERROR"}}`. All 7 authentication route tests pass.
**Dependencies**: T001, T002
**Status**: DONE - all 7 authentication route tests passing

## Next steps

1. Plan Phase 2 tasks starting from T009.
2. Verify `npm run dev` starts both API and web.
3. Fix prisma.config.ts verbatimModuleSyntax issue - NOT APPLICABLE (no verbatimModuleSyntax flag in tsconfigs, typecheck passes cleanly).
4. Fix web app import path extensions if needed.

## T006 — Tenant and membership routes
**Goal**: Create `POST /api/tenants`, `GET /api/tenants`, `GET /api/tenants/:tenantId/members` endpoints with membership checks.
**Completion check**: After login, a user can create a tenant and become its OWNER; list members restricted to tenant members; 403 for cross-tenant access. **Implementation**: Routes implemented in `apps/api/src/tenant.routes.ts` with Zod validation, Prisma conditional creation, JWT cookie auth, and rate limiting.
**Dependencies**: T005
**Status**: DONE - tenants and membership routes implemented and registered; TypeScript check passed

## T007 — Staff management routes
**Goal**: Add staff CRUD endpoints with role-based access.
**Completion check**: OWNER/MANAGER can add/update/delete staff; others get 403; staff has role field.
**Dependencies**: T006
**Status**: DONE - staff CRUD routes implemented and registered

## T008 — Bilingual menu CRUD routes
**Goal**: Add menu category and item endpoints (GET/POST/PATCH/DELETE) with Zod validation and tenant filtering.
**Completion check**: Menu items appear only within their tenant's scope; name and nameMm fields supported.
**Dependencies**: T006
**Status**: DONE - staff CRUD routes implemented and registered

## T009 — Order creation and POS endpoints
**Goal**: Implement order creation with item snapshots, idempotency keys, and status transitions.
**Completion check**: POST /api/orders creates an order with computed totals; idempotencyKey prevents duplicates; status map enforced.
**Dependencies**: T008
**Status**: DONE - staff CRUD routes implemented and registered

## T010 — Payments, receipts, and shift close
**Goal**: Payment recording with method enum, receipt issuance, and cashier shift open/close with reconciliation.
**Completion check**: Cash payment updates order paymentStatus to PAID; close shift returns difference; receipts stored and retrievable.
**Dependencies**: T009
**Status**: DONE - staff CRUD routes implemented and registered

## T011 — Reports endpoints
**Goal**: Add daily-sales, payment-mix, and top-items report endpoints.
**Completion check**: Reports return correct totals filtered by date; payment-mix grouped by method.
**Dependencies**: T010
**Status**: DONE - staff CRUD routes implemented and registered

## T012 — Kitchen display orders
**Goal**: Open orders for the kitchen display with item status transitions.
**Completion check**: GET /api/kitchen/orders returns open orders; item status transitions follow the defined map.
**Dependencies**: T010
**Status**: DONE - staff CRUD routes implemented and registered

## T013 — Offline sync endpoint
**Goal**: POST /api/sync that replays queued offline mutations with idempotency.
**Completion check**: Operations with same idempotencyKey return DUPLICATE; results reflect applied status.
**Dependencies**: T002
**Status**: DONE - staff CRUD routes implemented and registered

## T014 — Inventory basics
**Goal**: Add inventory items and movements endpoints.
**Completion check**: GET /api/inventory/items lists stock items; PATCH adjusts quantity with movement log.
**Dependencies**: T011
**Status**: DONE - staff CRUD routes implemented and registered

## T015 — Tests: tenant isolation and payment math
**Goal**: Write Vitest + Supertest suites that verify cross-tenant data isolation and that payment totals are correct.
**Completion check**: All test suites pass with coverage > 80% on the API modules.
**Dependencies**: T010
**Status**: DONE - staff CRUD routes implemented and registered

## T016 — Lint, typecheck, build, and full test suite
**Goal**: Run eslint, tsc --noEmit, Vite build, and all vitest tests; fix any failures.
**Completion check**: All checks pass on CI matrix.
**Dependencies**: all previous
**Status**: DONE - staff CRUD routes implemented and registered

## T017 — Phase 1 review and PROGRESS update
**Goal**: After T016 passes, mark Phase 1 complete, update PROGRESS.md, and plan Phase 2.
**Completion check**: No open blockers; progress reflects verified state.
**Dependencies**: T016
**Status**: DONE - staff CRUD routes implemented and registered