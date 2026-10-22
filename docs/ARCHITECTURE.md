# Architecture

## 1. Technology stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Monorepo | npm workspaces | `apps/*`, `packages/*`. No build orchestrator. |
| Language | TypeScript 5.9, `strict` | `noUncheckedIndexedAccess` and similar strict flags in every package |
| Frontend | React 19 + Vite 7 | Mobile-first, React Router 7, TanStack Query 5 |
| UI | Tailwind CSS 4 + shadcn/ui | Radix primitives, `lucide-react` icons |
| Backend | Node.js + Express 5 (TypeScript) | ESM, `NodeNext` module resolution |
| Database | PostgreSQL 18 | Local dev cluster; dedicated `restaurant_mng` role and databases |
| ORM | Prisma 7 (`7.10.1`) | Pinned. Driver adapter (`@prisma/adapter-pg` + `pg`) |
| Validation | Zod 4 | Shared schemas in `packages/shared`, used by both API and web |
| Auth | Session cookie (httpOnly, SameSite=Lax) + `jose` JWT | Rotating refresh token stored hashed server-side |
| Password hashing | `bcryptjs` | Pure JS — no native build step required |
| Tests | Vitest 5, Supertest 7, Testing Library | Playwright reserved for end-to-end in Phase 8 |
| Lint/format | ESLint 9 (flat config), Prettier 3 | `typescript-eslint` strict preset |

### Version pinning

`prisma` is pinned to `7.10.1`. The `latest` npm tag currently points at an `8.0.0-rc` prerelease,
which is not used for production work.

## 2. Architecture style

A **modular monolith** with a separate React frontend and Express API, in one TypeScript monorepo.

```
restaurant_mng/
├── apps/
│   ├── web/                  # React 19 + Vite SPA
│   │   └── src/{app,components,features,pages,hooks,lib,i18n}
│   └── api/                  # Express 5 API
│       └── src/{config,lib,middleware,modules,db}
├── packages/
│   └── shared/               # shared types, constants, Zod schemas
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── docs/
├── PROJECT.md
├── TASKS.md
└── PROGRESS.md
```

Backend modules are organised by business domain:

`health` · `auth` · `tenants` · `members` · `settings` · `staff` · `menu` · `tables` ·
`orders` · `payments` · `receipts` · `refunds` · `shifts` · `kitchen` · `reports` · `sync` ·
`inventory`

Each module owns its routes, service, and (when useful) repository. Modules never reach into
another module's tables directly except through shared services.

## 3. Data model

All primary keys are UUIDs. All money columns are integer MMK. All timestamps are `timestamptz`.

### 3.1 Identity and tenancy

| Model | Purpose | Key columns |
| --- | --- | --- |
| `User` | Global login identity | `email` (unique), `phone`, `passwordHash`, `name`, `status` |
| `Tenant` | The restaurant business — the isolation boundary | `name`, `slug` (unique), `status`, `currency` |
| `Membership` | A user's role inside a tenant | `tenantId`, `userId`, `role`, `status`, `employeeCode`; unique(`tenantId`,`userId`) |
| `Session` | Refresh-token session | `userId`, `tokenHash`, `expiresAt`, `revokedAt` |
| `TenantSettings` | Restaurant profile and rates | 1:1 with `Tenant`; `taxRateBps`, `serviceChargeRateBps`, `receiptFooter`, `orderPrefix` |

### 3.2 Menu

| Model | Purpose | Key columns |
| --- | --- | --- |
| `MenuCategory` | Menu grouping | `tenantId`, `name`, `nameMm`, `sortOrder`, `isActive` |
| `MenuItem` | Sellable dish | `tenantId`, `categoryId`, `name`, `nameMm`, `price`, `costPrice`, `isActive`, `isAvailable` |

### 3.3 Floor and orders

| Model | Purpose | Key columns |
| --- | --- | --- |
| `Table` | Seating | `tenantId`, `name`, `code`, `area`, `seats`, `status` |

### 3.5 Kitchen, sync, inventory

| Model | Purpose | Key columns |
| --- | --- | --- |
| `InventoryItem` | Tracked stock | `tenantId`, `menuItemId`, `name`, `unit`, `quantityOnHand`, `reorderLevel` |
| `InventoryMovement` | Stock change log | `tenantId`, `inventoryItemId`, `type`, `quantity`, `reason`, `orderId` |
| `SyncOperation` | Replayable offline mutation | `tenantId`, `clientId`, `idempotencyKey` (unique per tenant), `entity`, `operation`, `payload`, `status` |

### 3.6 Tenancy rules

- Every tenant-owned model has a non-null `tenantId` with an index.
- Composite unique constraints that are tenant-scoped are declared as `@@unique([tenantId, ...])`.
- All tenant reads are filtered by `tenantId` derived **server-side** from the authenticated
  membership — never from a client-supplied parameter.

## 4. API architecture

- REST over JSON under a versioned prefix (`/api`).
- Every response uses one envelope: `{ success: true, data }` or `{ success: false, error }`.
- Errors carry a stable machine code (`NOT_FOUND`, `VALIDATION_ERROR`, `FORBIDDEN`, …), a human
  message, and optional `details`.
- Request bodies, query strings, and path params are validated with Zod schemas from
  `packages/shared`, so the web app validates with the same definitions.
- Auth uses an httpOnly cookie (`rm_session`) holding a short-lived access JWT; a rotating refresh
  token lives in a separate httpOnly cookie and is stored **hashed** in `Session`.
- Middleware order: `helmet` → `cors` → body parsers → `cookieParser` → rate limit → routes →
  `notFoundHandler` → `errorHandler`.
- Prisma access goes through a single client factory in `apps/api/src/db/prisma.ts` so transactions
  and the driver adapter are configured in one place.

## 5. Frontend architecture

- **Routing**: React Router 7 with a protected route group; `/login`, `/select-tenant` public.
- **Server state**: TanStack Query 5. Mutations invalidate the matching query keys.
- **Client state**: React state only for ephemeral UI state (open dialogs, form drafts).
- **Styling**: Tailwind CSS 4 with a shadcn/ui theme in `apps/web/src/styles/index.css`.
- **i18n**: a small typed dictionary module (`en`/`my`) with a persisted `language` preference.
- **API access**: one typed `apiClient` wrapper around `fetch` that handles the response envelope
  and attaches credentials.
- **Forms**: React Hook Form + Zod resolver for client-side validation that mirrors the server.

## 6. Engineering rules

1. **Strict TypeScript** everywhere; `any` is disallowed in source files.
2. **Thin controllers**: routes validate and delegate; services hold business logic.
3. **Server-authoritative money**: never trust a client price, total, role, or tenant id.
4. **Transactions** for order creation, payment capture, refunds, and shift closing.
5. **Zod** on every external input boundary.
6. **Migrations only** for schema changes; seed contains development/demo data only.
7. **Tests** for every important behaviour, especially tenant isolation, payment math, and order
   totals.
8. **No fake implementations**: an unfinished feature is reported as unfinished, never as done.
9. **Secrets** live in environment variables only; `.env.example` documents every variable.

## 7. Environment variables

| Variable | Used by | Default | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | api | `development` | `development` \| `test` \| `production` |
| `PORT` | api | `4000` | API port |
| `API_PREFIX` | api | `/api` | Route prefix |
| `CORS_ORIGIN` | api | `http://localhost:5173` | Comma-separated allowed origins |
| `DATABASE_URL` | api, prisma | — | PostgreSQL connection string |
| `JWT_SECRET` | api | — | Signing secret for access tokens (min 32 chars in production) |
| `JWT_EXPIRES_IN` | api | `15m` | Access-token lifetime |
| `REFRESH_TOKEN_TTL_DAYS` | api | `30` | Refresh-token lifetime |
| `COOKIE_DOMAIN` | api | — | Optional cookie domain |
| `COOKIE_SECURE` | api | `false` | Set `true` in production |
| `UPLOAD_DIR` | api | `./storage/uploads` | Local receipt image storage |
| `MAX_UPLOAD_SIZE_MB` | api | `5` | Upload limit |
| `VITE_API_PROXY_TARGET` | web | `http://localhost:4000` | Dev proxy target |
| `VITE_API_BASE_URL` | web | `/api` | API base URL used by the web client |

## 8. Testing strategy

| Level | Tool | Focus |
| --- | --- | --- |
| Unit | Vitest | Order maths, payment maths, status transition maps, formatting |
| API integration | Vitest + Supertest | Routes, validation, authorization, tenant isolation, transactions |
| Web component | Vitest + Testing Library | Rendering, forms, i18n switching |
| End-to-end | Playwright (Phase 8) | Order → payment → receipt → shift close |

Integration tests run against `restaurant_mng_test`; each suite resets the schema before running.

## 9. Deployment shape

Two deployable units plus one database:

- **API** — Node process behind a reverse proxy (HTTPS terminated there). Serves `/api`.
- **Web** — static build served by a CDN or static host; talks to the API over HTTPS.
- **Database** — managed PostgreSQL 18 with automated backups.

Receipt images live on the API's local disk in development and move to S3-compatible object storage in
production behind the same storage interface.

10. **No new major dependency** without asking first.

| `Order` | A sale | `tenantId`, `orderNumber`, `type`, `tableId`, `status`, `paymentStatus`, `subtotal`, `discount`, `tax`, `serviceCharge`, `total`, `createdById` |
| `OrderItem` | A line on an order | `orderId`, `menuItemId`, `name` (snapshot), `unitPrice` (snapshot), `quantity`, `lineTotal`, `status` |
| `OrderStatusHistory` | Audit of status changes | `orderId`, `fromStatus`, `toStatus`, `changedById`, `note` |

### 3.4 Money movement

| Model | Purpose | Key columns |
| --- | --- | --- |
| `Payment` | Money taken | `tenantId`, `orderId`, `shiftId`, `method`, `amount`, `tendered`, `change`, `reference`, `status`, `verifiedById` |
| `Refund` | Money returned | `tenantId`, `paymentId`, `orderId`, `amount`, `reason`, `method`, `status`, `createdById` |
| `Receipt` | Issued receipt | `tenantId`, `orderId`, `number`, `content` (JSON snapshot), `issuedAt` |
| `CashierShift` | Drawer accountability | `tenantId`, `userId`, `status`, `openingFloat`, `closingCash`, `expectedCash`, `difference` |
