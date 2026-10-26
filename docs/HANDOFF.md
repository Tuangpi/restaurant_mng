# Handoff - Restaurant Management System

## Project Status

This is a Myanmar-first, mobile-first restaurant management SaaS.

### Current Phase: MVP Complete

All T001–T032 tasks are complete.

## Completed Tasks (T001–T031)

| Task | Description | Status |
|------|-------------|--------|
| **T001** | Monorepo bootstrap — npm workspaces, TypeScript configs | DONE |
| **T002** | Prisma schema, migration, and seed | DONE |
| **T003** | Express health endpoint and error handling | DONE |
| **T004** | React/Vite web shell with Tailwind 4 | DONE |
| **T005** | Authentication routes (register/login/logout) | DONE |
| **T006** | Tenant and membership routes | DONE |
| **T007** | Staff management routes | DONE |
| **T008** | Bilingual menu CRUD routes | DONE |
| **T009–T012** | Settings, tables, receipts, refunds routes | DONE |
| **T013–T017** | Orders, payments, reports, kitchen routes | DONE |
| **T018** | Frontend pages (all verified) | DONE |
| **T019** | Tenant tax/service-charge rates | DONE |
| **T020** | /auth/refresh and /auth/me endpoints | DONE |
| **T021** | Missing route files (settings, tables, receipts, refunds, shifts) | DONE |
| **T022** | Deploy sync migration to application database | DONE |
| **T023** | Browser offline queue and payment replay | DONE |
| **T024** | ESLint and coverage configuration | DONE |
| **T025** | Remove duplicate auth logic | DONE |
| **T026–T028** | Offline sync (server, client queue, conflict resolution) | DONE |
| **T029** | Inventory management routes | DONE |
| **T030** | Security hardening (helmet, CSP, rate limiting, revoke-all) | DONE |
| **T031** | Pilot/beta features (feature flags) | DONE |
| **T032** | Project closeout and documentation | DONE |

## T032 — Project closeout and documentation

This task finalizes the project with the following completion checks:

### Verified:
- All T001–T032 tasks DONE or BLOCKED
- `npm run build` passes across all packages
  - API: `tsc --build --force` passes
  - Web: `vite build` passes
  - Shared: `tsc --build --force` passes
- Full test suite runs: 29/29 API vitest tests pass
  - `auth.test.ts`, `tenant.test.ts`, `inventory.smoke.test.ts`, `pilot.smoke.test.ts`, `security.smoke.test.ts`, `sync.test.ts`
- API.md updated: Comprehensive REST contract documented through all phases (Health → Pilot)
- Handoff documentation created: This file (`docs/HANDOFF.md`)

### Build & Development

```bash
# Install dependencies
npm install

# Build API
npm run build --prefix apps/api   # tsc --build --force

# Build Web
npm run build --prefix apps/web   # vite build

# Run development server (concurrently)
npm run dev                       # concurrently "npm run start --prefix apps/api" "vite --port 5173"

# Run tests
npm test                          # vitest run (across all workspaces)

# Lint
npm run lint                         # eslint in both api and web packages
```

### Architecture

- **Monorepo**: npm workspaces — `apps/web`, `apps/api`, `packages/shared`
- **Frontend**: React 19, TypeScript, Vite 7, React Router 7, TanStack Query 5, Tailwind CSS 4, shadcn/ui
- **Backend**: Node.js, Express 5, TypeScript (ESM)
- **Database**: PostgreSQL 18, Prisma 7 (`@prisma/adapter-pg`)
- **Validation**: Zod 4 (schemas shared through `packages/shared`)
- **Auth**: httpOnly session cookies (access JWT + rotating refresh token)
- **Architecture**: Modular monolith, React SPA + Express API

### API Summary

**Base URL**: `http://localhost:4000/api`

**Response Envelope**: Every endpoint returns `{ success: true, data: {…} }` or `{ success: false, error: { code, message, details } }`

**Error Codes**:
| Code | HTTP | Meaning
|------|------|
| `BAD_REQUEST` | 400 |
| `UNAUTHORIZED` | 401 |
| `FORBIDDEN` | 403 |
| `NOT_FOUND` | 404 |
| `CONFLICT` | 409 |
| `VALIDATION_ERROR` | 422 |
| `INTERNAL_ERROR` | 500 |

**Key Endpoints by Phase**:

| Phase | Endpoints |
|-------|-----------|
| 1 — Health | `GET /api/health`, `GET /api/health/ready` |
| 2 — Auth | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/refresh`, `GET /api/auth/me` |
| 3 — Tenants/Staff/Menu | Tenant CRUD, staff CRUD, bilingual menu (name + nameMm) |
| 4 — Orders/POS | Order CRUD, order status transitions, kitchen dispatch |
| 5 — Payments/Receipts/Refunds/Shifts | Payment recording, receipt printing, shift open/close, refunds |
| 6 — Reports | Daily sales, payment mix, best-seller reports |
| 7 — Offline sync | `POST /api/sync` (ORDER/CREATE supported), conflict resolution |
| 8 — Inventory | Item CRUD, stock tracking, movement history |

**Tenant Isolation**: All routes verified via `X-Tenant-Id` header. Cross-tenant access returns 404 (not 403) to avoid leaking resource existence.

**Money**: Integer MMK (kyat). No minor units. Avoid float rounding.

**Bilingual**: All menu items have `name` (English) and `nameMm` (Burmese).

## Project Structure

```
restaurant_mng/
├── docs/                    # Documentation: PRD.md, ARCHITECTURE.md, API.md, HANDOFF.md
├── packages/shared/         # Shared Zod schemas
├── apps/
│   ├── api/               # Express 5 API (TypeScript ESM)
│   │   ├── src/           # Route handlers, middleware, services
│   │   ├── prisma/        # Schema + migrations + seed
│   │   └── package.json
│   └── web/               # React 19 Vite 7 SPA
│       ├── src/           # Components, pages, hooks, lib
│       └── package.json
└── TASKS.md               # Task tracking (T001–T032)