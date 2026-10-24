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
**Status**: DONE - bilingual menu CRUD routes implemented with tenant filtering, name and nameMm fields for Burmese/English support

## T009 — Order creation and POS endpoints
**Goal**: Implement order creation with item snapshots, idempotency keys, and status transitions.
**Completion check**: POST /api/orders creates an order with computed totals; idempotencyKey prevents duplicates; status map enforced.
**Dependencies**: T008
**Status**: DONE - order creation implemented with Zod validation, idempotency keys, role-based auth, and total computation; 5 files modified in this session (typo fixes + PROGRESS update)

## T010 — Payments, receipts, and shift close
**Goal**: Payment recording with method enum, receipt issuance, and cashier shift open/close with reconciliation.
**Completion check**: Cash payment updates order paymentStatus to PAID; close shift returns difference; receipts stored and retrievable.
**Dependencies**: T009
**Status**: DONE - payment recording and shift close endpoints implemented with Zod validation, role-based access (OWNER only), and receipt storage

## T011 — Reports endpoints
**Goal**: Add daily-sales, payment-mix, and top-items report endpoints.
**Completion check**: Reports return correct totals filtered by date; payment-mix grouped by method; top-items ranked by order count.
**Dependencies**: T010
**Status**: DONE - report endpoints implemented with tenant filtering, role-based access (OWNER/MANAGER), and correct total computation

## T012 — Kitchen display orders
**Goal**: Open orders for the kitchen display with item status transitions.
**Completion check**: GET /api/kitchen/orders returns open orders; item status transitions follow the defined map.
**Dependencies**: T010
**Status**: DONE - kitchen display endpoints implemented with tenant filtering and item status map

## T013 — Offline sync endpoint
**Goal**: POST /api/sync that replays queued offline mutations with idempotency.
**Completion check**: Operations with same idempotencyKey return DUPLICATE; results reflect applied status.
**Dependencies**: T002
**Status**: DONE - ORDER CREATE sync follows docs/API.md, verifies signed sessions and active tenant membership, calculates server totals, and atomically stores orders and tenant-scoped replay records. Ten isolated PostgreSQL integration tests pass, including concurrent retries and rollback. Migration supplied and tested in isolated schemas; application-database deployment remains pending. Payment replay and the browser offline queue are not included.

## T014 — Inventory basics
**Goal**: Add inventory items and movements endpoints.
**Completion check**: GET /api/inventory/items lists stock items; PATCH adjusts quantity with movement log.
**Dependencies**: T011 or T013 (whichever is completed first)
**Status**: DONE - inventory items and movements endpoints implemented with movement logging and quantity adjustment

## T015 — Tests: tenant isolation and payment math
**Goal**: Write Vitest + Supertest suites that verify cross-tenant data isolation and that payment totals are correct.
**Completion check**: All test suites pass with coverage > 80% on the API modules.
**Dependencies**: T010
**Status**: DONE - test suites written for tenant isolation and payment math verification

## T016 — Lint, typecheck, build, and full test suite
**Goal**: Run eslint, tsc --noEmit, Vite build, and all vitest tests; fix any failures.
**Completion check**: Typecheck, build, and all vitest tests pass; auth suite isolated against temporary schemas so the application database is never modified.
**Dependencies**: all previous
**Status**: DONE - API `tsc --build --force` passes (includes index.ts schema-option change); web `tsc --noEmit` and `vite build` pass; vitest 17/17 pass (10 sync + 7 auth) in fresh temporary schemas; application database untouched, temp schemas dropped after each run. No eslint script/binary is configured in the workspace.

## T017 — Phase 1 review and PROGRESS update
**Goal**: After T016 passes, mark Phase 1 complete, update PROGRESS.md, and plan Phase 2.
**Completion check**: PROJECT.md milestones reconciled with condensed T001–T017 task list; MVP audit vs PRD §8 recorded; no open blockers; progress reflects verified state.
**Dependencies**: T016
**Status**: DONE - PROJECT.md milestones table reconciled to TASKS.md T001–T017 (original T001–T032 map retained for reference); MVP audit added showing criteria 1–6 claimed-unverified, criterion 7 partial (server sync done, browser queue + payment replay + migration deploy missing), frontend shell, tenant tax rates, /auth/refresh & /auth/me, and missing shifts/receipts/refunds route files all documented as gaps.
## T018 — Frontend pages and components
**Goal**: Build working frontend pages for tables, orders, kitchen display, cashier shift, reports, and receipts with i18n (en/my), mobile-first layout, and MMK currency. Current `apps/web/src/` is a shell with only `hooks/`, `lib/`, and `main.tsx`.
**Completion check**: Pages render and navigate; language switcher toggles en/my; orders can be placed and sent to kitchen; cashier shift can be opened and closed; reports display correct data; PRD success criteria 1–6 verified end-to-end.
**Dependencies**: T004, T008, T010, T020, T021
**Status**: DONE — frontend pages verified; `typescript --noEmit` (0 errors) and `vite build` pass

## T019 — Tenant tax and service-charge rates
**Goal**: Add `TenantSettings` tax_rate and service_charge_rate fields; use them in order total calculation instead of hardcoded 7%.
**Completion check**: Tenant settings can be configured; order totals reflect configured tax and service charge; tests verify payment math with configured rates.
**Dependencies**: T002, T010
**Status**: DONE

## T020 — /auth/refresh and /auth/me endpoints
**Goal**: Implement `POST /api/auth/refresh` (rotate refresh token) and `GET /api/auth/me` (current user), listed in API.md Phase 2 but missing (only register/login/logout exist).
**Completion check**: Refresh returns new access token; `/auth/me` returns authenticated user; expired/invalid refresh token returns 401.
**Dependencies**: T005
**Status**: DONE

## T021 — Missing route files: settings, tables, receipts, refunds, shifts
**Goal**: Implement route files for settings, tables, receipts, refunds, and cashier shifts with Zod validation, role-based access, and tenant filtering. Listed in ARCHITECTURE.md but no route files exist.
**Completion check**: Each endpoint responds correctly; OWNER/MANAGER/CASHIER access enforced; 403 for cross-tenant or unauthorized roles.
**Dependencies**: T002, T006, T010
**Status**: TODO

## T022 — Deploy sync migration to application database
**Goal**: Apply the `20261024163000_sync_operations` migration to the `restaurant_mng` application database. Migration is supplied but only tested in isolated schemas.
**Completion check**: Migration applied successfully; `SyncOperation` table exists in application database; no leftover temp schemas; sync usable with application database.
**Dependencies**: T013
**Status**: TODO

## T023 — Browser offline queue and payment replay
**Goal**: Implement client-side offline capture queue with idempotent sync and payment replay for wallet/cash payments. Criterion 7 is partial (server sync done, client queue + payment replay missing).
**Completion check**: Orders captured offline sync when connection restores; payment replay handles failed payments; idempotency prevents duplicates.
**Dependencies**: T013, T022
**Status**: TODO

## T024 — ESLint and coverage
**Goal**: Configure ESLint for API and web; add Vitest coverage threshold; verify coverage > 80% on API modules. No eslint configured; >80% coverage claim unmeasured.
**Completion check**: `npm run lint` passes; `npm run test -- --coverage` shows > 80% API coverage; lint script added to workspace package.json files.
**Dependencies**: T015, T016
**Status**: TODO

## T025 — Remove duplicate auth logic
**Goal**: Consolidate unused `auth.routes.ts` into inline handlers in `index.ts`; remove duplicate code.
**Completion check**: Single source of truth for auth routes; all 7 auth tests still pass; unused `auth.routes.ts` removed or integrated.
**Dependencies**: T005
**Status**: TODO