# Restaurant Management System — Project Tracking

Status: managed project. Task list in [`TASKS.md`](TASKS.md). Session state in [`PROGRESS.md`](PROGRESS.md).

> This file is the project-level index. It does not restate the spec; `docs/` remains the source of
> truth for requirements and architecture.

## Goal

Build a Myanmar-first, mobile-first restaurant management SaaS that lets a teahouse, cafe, or small
restaurant run orders, payments, receipts, cashier shifts, kitchen display, and reports from one
system, without developer help.

## Reference documents

| File | Purpose |
| --- | --- |
| [`docs/PRD.md`](docs/PRD.md) | Users, roles, phased scope, business rules, success criteria |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Stack, structure, data model, engineering rules |
| [`docs/API.md`](docs/API.md) | REST contract, response envelope, error codes, endpoints per phase |

## Scope

### In scope (MVP)

- Multi-tenant restaurant management with a `Tenant` + `Membership` access model.
- Roles: `OWNER`, `MANAGER`, `CASHIER`, `WAITER`, `KITCHEN`.
- Restaurant settings, staff records, bilingual menu categories and items.
- Tables, order types (dine-in, takeaway, delivery), server-calculated order totals.
- Cash and manual KBZPay / WavePay / AYA Pay / bank-transfer payments, receipts, refunds.
- Cashier shifts with opening float and close-out reconciliation.
- Kitchen display and daily sales / payment mix / top-item reports.
- Offline capture with idempotent server sync.
- English and Burmese, mobile-first, MMK currency.

### Out of scope (MVP)

- Automated payment-provider integration, webhooks, settlement.
- Delivery/courier dispatch, payroll, supplier purchasing, accounting ledgers.
- Multi-currency pricing, native mobile apps, microservices.

## Success criteria

A restaurant can, without developer help: create staff and roles, build a bilingual menu with MMK
prices, seat customers, take orders, send them to the kitchen, take cash and manual wallet
payments, print receipts, open and close a balanced cashier shift, read daily sales and
best-seller reports, and recover from a network drop without losing an order.

## Tech stack

- **Monorepo**: npm workspaces — `apps/web`, `apps/api`, `packages/shared`.
- **Frontend**: React 19, TypeScript, Vite 7, React Router 7, TanStack Query 5, Tailwind CSS 4,
  shadcn/ui.
- **Backend**: Node.js, Express 5, TypeScript (ESM).
- **Database**: PostgreSQL 18, Prisma 7 (`7.10.1`) with the `@prisma/adapter-pg` driver adapter.
- **Validation**: Zod 4, with schemas shared through `packages/shared`.
- **Auth**: httpOnly session cookies (access JWT + rotating refresh token).
- **Tests**: Vitest 5, Supertest 7, Testing Library; Playwright in Phase 8.

Architecture style: modular monolith, React SPA + Express API.


## Milestones (reconciled with TASKS.md)

The working task list in [`TASKS.md`](TASKS.md) uses a condensed T001–T017 numbering that supersedes the original T001–T032 eight-phase map below. Task IDs are preserved and not renumbered.

| TASKS.md task | Goal | Closest PRD phase |
| --- | --- | --- |
| T001–T004 | Monorepo, Prisma schema/seed, health endpoint, error handling, web shell | Phase 1 |
| T005–T008 | Auth, tenants, memberships, staff, menu CRUD | Phase 2–3 |
| T009–T012 | Orders, payments, reports, kitchen | Phase 4–6 |
| T013 | Offline sync — server ORDER CREATE only | Phase 7 (partial) |
| T014 | Inventory basics | Phase 8 |
| T015 | Test suites (tenant isolation, payment math) | — |
| T016 | Typecheck, build, full vitest suite | — |
| T017 | Reconciliation + MVP audit (this session) | — |

Original eight-phase map (T001–T032), retained for reference but no longer the working plan:
- Phase 1 Foundation: T001–T004 · Phase 2 Auth/tenants/memberships/authorization: T005–T008 · Phase 3 Settings/staff/menu: T009–T012 · Phase 4 Orders/POS: T013–T017 · Phase 5 Payments/receipts/refunds/shifts: T018–T022 · Phase 6 Kitchen/reports: T023–T025 · Phase 7 Offline sync: T026–T028 · Phase 8 Inventory/security/pilot: T029–T032.

Do not begin a phase until the current phase works and its checks pass.

## MVP audit vs PRD §8 success criteria

Pilot-ready = a restaurant can, without developer help, do all seven items. Evidence basis: T016 verified checks (typecheck/build/tests) plus this session's file/doc audit. Items claimed DONE in `TASKS.md` but not re-verified here are marked "claimed."

| # | PRD success criterion | Status | Evidence / gap |
|---|---|---|---|
| 1 | Create staff accounts and assign roles | Claimed | T007 staff CRUD routes implemented/registered; not re-run this session |
| 2 | Build bilingual menu with MMK prices | Claimed | T008 menu CRUD implemented; not re-run this session |
| 3 | Seat customers, take orders, send to kitchen | Claimed | T009 orders + T012 kitchen claimed; not re-run this session |
| 4 | Take cash/manual wallet payments, print receipts | Claimed (unverified) | T010 claimed; no `receipts.routes.ts` or `shifts.routes.ts` file exists — verify where shift/receipt logic lives |
| 5 | Open/close cashier shift, balanced/explained drawer | Claimed (unverified) | T010 claimed; no `shifts.routes.ts` file exists |
| 6 | Read daily sales and best-seller reports | Claimed | T011 reports claimed; not re-run this session |
| 7 | Recover from network drop without losing an order | Partial | Server ORDER CREATE sync done (T013, 10 tests). **Missing:** browser offline capture queue, payment replay, sync migration not yet applied to application database |

**Additional gaps found this session:**
- Frontend is a shell: `apps/web/src/` contains only `hooks/`, `lib/`, `main.tsx` — no pages, components, or i18n (criteria 1–6 need a working frontend).
- Tenant tax/service-charge rates unfinished: `API.md` sync section notes fixed 7% tax, zero service charge; `PRD` Phase 3 requires `TenantSettings` tax/service-charge rates.
- `API.md` Phase 2 lists `/auth/refresh` and `/auth/me`; only register/login/logout exist.
- `ARCHITECTURE.md` module list includes `settings`, `tables`, `receipts`, `refunds`, `shifts` but no route files exist for them.
- No eslint configured; T015 coverage > 80% claim unmeasured (no coverage tooling evident).
- Duplicate auth logic: unused `auth.routes.ts` (no `schema` option) vs fixed inline handlers in `index.ts`.

## Key rules

- Express enforces business rules and authorization; React handles presentation only.
- Calculate all financial values on the server; never trust client-supplied prices, totals, roles,

## Key decisions

| Decision | Choice | Rationale | Date |
| --- | --- | --- | --- |
| Monorepo tooling | npm workspaces, no build orchestrator | Zero extra toolchain to maintain | 2026-10-22 |
| Internal shared package | plain `"*"` version range | npm `workspace:` protocol support is inconsistent across versions | 2026-10-22 |
| Prisma version | pinned to `7.10.1` | The `latest` npm tag points at an `8.0.0-rc` prerelease | 2026-10-22 |
| Prisma driver | `@prisma/adapter-pg` + `pg` | Required by Prisma 7; avoids the Rust query engine | 2026-10-22 |
| Tenancy model | `Tenant` + `Membership` with a `role` enum | A person may work in several restaurants with different roles | 2026-10-22 |
| Tenant context | `X-Tenant-Id` header, verified server-side | One header works for every tenant-scoped route; still checked against membership | 2026-10-22 |
| Money | integer MMK | Kyat has no practical minor unit; avoids float rounding | 2026-10-22 |
| Auth | httpOnly access JWT + rotating refresh token stored hashed | Stateless requests, revocable sessions | 2026-10-22 |
| Password hashing | `bcryptjs` | Pure JS; no native build step | 2026-10-22 |
| Payment verification | manual staff confirmation only | No approved provider integration exists | 2026-10-22 |
| Spec docs | `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/API.md` authored from `tmp.md` | The referenced docs did not exist in the repository | 2026-10-22 |

## Constraints

- Do not implement features outside the MVP without approval.
- Create database migrations and tests alongside features.
- Run type checks, linting, and tests after each phase.
- Never leave core workflows implemented only as mock data.
- Definition of done: a feature is complete only when its UI, API, validation, authorization,
  database changes, error handling, and relevant tests are implemented and verified.

  or tenant ids.
- Store money as integer MMK.
- Snapshot item name and unit price on order items.
- Keep order status separate from payment status.
- Use database transactions for order creation, payment capture, refunds, and shift closing.
- Verify tenant membership on every protected operation; prevent cross-tenant access.
- Validate all external input with Zod; rate-limit auth and public ordering endpoints.
- Never log passwords, tokens, or payment secrets; never commit secrets.
- Treat wallet references and receipts as unverified until a human confirms them.
- Never claim automated wallet integration works unless it is implemented and tested.
