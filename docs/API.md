# API Contract

Base URL: `{API_ORIGIN}{API_PREFIX}` (development: `http://localhost:4000/api`).

All requests and responses are JSON unless stated otherwise.

## 1. Response envelope

Every endpoint returns exactly one of:

```json
{ "success": true, "data": { "...": "..." } }
```

```json
{ "success": false, "error": { "code": "NOT_FOUND", "message": "Order not found", "details": [] } }
```

`error.code` is a stable machine-readable string. `error.message` is human-readable and may change.
`error.details` is optional and carries validation issues or context.

### Error codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| `BAD_REQUEST` | 400 | Malformed request that passed no schema |
| `UNAUTHORIZED` | 401 | Missing or invalid credentials |
| `FORBIDDEN` | 403 | Authenticated but no permission in this tenant |
| `NOT_FOUND` | 404 | Resource does not exist **or** is not visible to the caller |
| `CONFLICT` | 409 | Duplicate or conflicting state (e.g. duplicate email) |
| `VALIDATION_ERROR` | 422 | Zod validation failed; `details` lists the issues |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

> Resources in another tenant return `404`, not `403`, so the API does not leak their existence.

## 2. Conventions

- **Authentication** uses cookies: `rm_session` (access JWT) and `rm_refresh` (refresh token).
  Both are httpOnly and `SameSite=Lax`. Send `credentials: 'include'` on cross-origin requests.
- **Tenant context** comes from the `X-Tenant-Id` header on tenant-scoped endpoints. The server
  verifies the caller has a membership in that tenant and ignores it otherwise.
- **Money** is always an integer amount in MMK. Fields are named `amount`, `subtotal`, `total`, etc.
- **Dates** are ISO-8601 strings in UTC.
- **Pagination** uses `page` (1-based) and `pageSize` (default 20, max 100). List responses return
  `{ items, page, pageSize, total, totalPages }`.
- **Filtering** uses query parameters validated by Zod; unknown parameters are rejected.

## 3. Phase 1 — Health

### `GET /api/health`

Liveness and readiness probe.

**200**

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "service": "restaurant-mng-api",
    "timestamp": "2026-10-22T10:00:00.000Z",
    "version": "0.1.0",
    "uptimeSeconds": 12
  }
}
```

### `GET /api/health/ready`

Checks that the database is reachable.

**200** — `{ "success": true, "data": { "status": "ready", "database": "up", "timestamp": "..." } }`
**503** — `{ "success": false, "error": { "code": "SERVICE_UNAVAILABLE", "message": "Database unavailable" } }`

## 4. Phase 2 — Authentication

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | — | Create a user account |
| `POST` | `/api/auth/login` | — | Start a session |
| `POST` | `/api/auth/logout` | — | End the current session |
| `POST` | `/api/auth/refresh` | refresh cookie | Rotate the access token |
| `GET` | `/api/auth/me` | session | Current user, memberships, and tenants |

### `POST /api/auth/register`

```json
{ "name": "Aye Aye", "email": "aye@example.com", "phone": "0912345678", "password": "s3cret-pass" }
```

**201** — `{ "success": true, "data": { "user": { "id": "…", "name": "Aye Aye", "email": "…", "role": "OWNER" } } }`

**409** — duplicate email. **422** — validation failure.

### `POST /api/auth/login`

```json
{ "email": "aye@example.com", "password": "s3cret-pass" }
```

**200** — sets `rm_session` and `rm_refresh` cookies.

```json
{
  "success": true,
  "data": {
    "user": { "id": "…", "name": "Aye Aye", "email": "…", "phone": null },
    "memberships": [{ "tenantId": "…", "tenantName": "…", "tenantSlug": "…", "role": "OWNER" }]
  }
}
```

**401** — invalid credentials (same message for unknown email and wrong password).

### `GET /api/auth/me`

**200** — the same shape as the login response, including `memberships`.

## 5. Phase 2 — Tenants and memberships

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/tenants` | session | Create a restaurant; caller becomes `OWNER` |
| `GET` | `/api/tenants` | session | List tenants the caller belongs to |
| `GET` | `/api/tenants/:tenantId` | membership | Tenant details |
| `GET` | `/api/tenants/:tenantId/members` | membership | List staff and roles |
| `POST` | `/api/tenants/:tenantId/members` | `OWNER`/`MANAGER` | Add or invite a staff member |
| `PATCH` | `/api/tenants/:tenantId/members/:memberId` | `OWNER`/`MANAGER` | Change a member's role or status |
| `DELETE` | `/api/tenants/:tenantId/members/:memberId` | `OWNER` | Remove a member |

**403** — caller has no membership in the tenant. **404** — tenant does not exist or is not visible.


## 6. Phase 3 — Settings, staff, menu

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/settings` | membership | Restaurant profile and rates |
| `PATCH` | `/api/settings` | `OWNER`/`MANAGER` | Update profile and rates |
| `GET` | `/api/staff` | membership | Staff directory |
| `POST` | `/api/staff` | `OWNER`/`MANAGER` | Add a staff record |
| `PATCH` | `/api/staff/:staffId` | `OWNER`/`MANAGER` | Update a staff record |
| `GET` | `/api/menu/categories` | membership | Menu categories |
| `POST` | `/api/menu/categories` | `OWNER`/`MANAGER` | Create a category |
| `PATCH` | `/api/menu/categories/:categoryId` | `OWNER`/`MANAGER` | Rename, reorder, activate |
| `DELETE` | `/api/menu/categories/:categoryId` | `OWNER`/`MANAGER` | Remove an empty category |
| `GET` | `/api/menu/items` | membership | Menu items, filterable by category |
| `POST` | `/api/menu/items` | `OWNER`/`MANAGER` | Create a menu item |
| `PATCH` | `/api/menu/items/:itemId` | `OWNER`/`MANAGER` | Update price, names, availability |

### `POST /api/menu/items`

```json
{ "categoryId": "…", "name": "Laphet Thoke", "nameMm": "လက်ဖက်သုပ်", "price": 6500, "costPrice": 4000 }
```

**201** — `{ "success": true, "data": { "item": { "id": "…", "price": 6500, "isActive": true, "isAvailable": true } } }`

`price` and `costPrice` are integer MMK and are **not** accepted from clients at order time.

## 7. Phase 4 — Orders and POS

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/tables` | membership | Tables and seating areas |
| `POST` | `/api/tables` | `OWNER`/`MANAGER` | Add a table |
| `PATCH` | `/api/tables/:tableId` | `OWNER`/`MANAGER` | Update a table |
| `GET` | `/api/orders` | membership | List orders, filterable by status/table/date |
| `POST` | `/api/orders` | membership | Create an order |
| `GET` | `/api/orders/:orderId` | membership | One order with items and payments |
| `PATCH` | `/api/orders/:orderId` | membership | Update an open order's items |
| `PATCH` | `/api/orders/:orderId/status` | membership | Change the order status |
| `PATCH` | `/api/orders/:orderId/items/:itemId/status` | membership | Change one item's kitchen status |

### `POST /api/orders`

```json
{
  "type": "DINE_IN",
  "tableId": "…",
  "items": [{ "menuItemId": "…", "quantity": 2, "notes": "less spicy" }],
  "discount": 500,
  "idempotencyKey": "client-generated-uuid"
}
```

The client sends **no prices**. The server looks up each menu item, snapshots the name and unit
price, computes line totals, subtotal, tax, service charge, and the final total, then assigns the
next `orderNumber` for the tenant.

**201**

```json
{
  "success": true,
  "data": {
    "order": {
      "id": "…",
      "orderNumber": "000123",
      "type": "DINE_IN",
      "status": "OPEN",
      "paymentStatus": "UNPAID",
      "subtotal": 13000,
      "discount": 500,

## 8. Phase 5 — Payments, receipts, refunds, shifts

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/orders/:orderId/payments` | membership | Record a payment |
| `GET` | `/api/orders/:orderId/payments` | membership | Payments for an order |
| `POST` | `/api/payments/:paymentId/verify` | `OWNER`/`MANAGER` | Confirm a manual wallet payment |
| `POST` | `/api/orders/:orderId/refunds` | `OWNER`/`MANAGER` | Refund part or all of a payment |
| `GET` | `/api/orders/:orderId/receipts` | membership | Issued receipts |
| `POST` | `/api/orders/:orderId/receipts` | membership | Issue a receipt |
| `GET` | `/api/receipts/:receiptId` | membership | One receipt (reprint) |
| `POST` | `/api/shifts` | membership | Open a cashier shift |
| `GET` | `/api/shifts/current` | membership | The caller's open shift |
| `POST` | `/api/shifts/:shiftId/close` | membership | Close a shift and reconcile the drawer |

### `POST /api/orders/:orderId/payments`

```json
{ "method": "CASH", "amount": 12500, "tendered": 13000, "reference": null, "idempotencyKey": "…" }
```

The server computes `change = tendered - amount` for cash, rejects `amount` that exceeds the
outstanding balance, and updates the order's `paymentStatus` to `PAID` once the balance is zero.

**201**

```json
{
  "success": true,
  "data": {
    "payment": { "id": "…", "method": "CASH", "amount": 12500, "tendered": 13000, "change": 500, "status": "VERIFIED" },
    "order": { "id": "…", "paymentStatus": "PAID", "total": 12500 }
  }
}
```

Payment methods: `CASH`, `KBZPAY`, `WAVEPAY`, `AYA_PAY`, `BANK_TRANSFER`.
Wallet and bank payments are created as `PENDING` and require a staff member to verify them.

### `POST /api/shifts/:shiftId/close`

```json
{ "closingCash": 24500 }
```

The server computes `expectedCash = openingFloat + sum(cash payments) - sum(cash refunds)` and
returns `difference = closingCash - expectedCash`.

**200** — `{ "success": true, "data": { "shift": { "id": "…", "status": "CLOSED", "openingFloat": 20000, "closingCash": 24500, "expectedCash": 24500, "difference": 0 } } }`

## 9. Phase 6 — Kitchen and reports

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/kitchen/orders` | membership | Open orders for the kitchen display |
| `GET` | `/api/reports/daily-sales` | membership | Sales totals for a date |
| `GET` | `/api/reports/payment-mix` | membership | Totals grouped by payment method |
| `GET` | `/api/reports/top-items` | membership | Best-selling items for a date range |

### `GET /api/reports/daily-sales?date=2026-10-22`

```json
{
  "success": true,
  "data": {
    "date": "2026-10-22",
    "orderCount": 42,
    "grossSales": 385000,
    "discounts": 12000,
    "tax": 0,
    "serviceCharge": 5000,
    "netSales": 378000,
    "refunded": 0
  }
}
```

## 10. Phase 7 — Offline sync

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/sync` | membership | Replay a batch of queued offline mutations |

```json
{
  "clientId": "device-uuid",
  "operations": [
    { "idempotencyKey": "…", "entity": "ORDER", "operation": "CREATE", "payload": { "type": "DINE_IN", "items": [] } }
  ]
}
```

**200** — results are returned per operation, in request order.

```json
{
  "success": true,
  "data": {
    "results": [
      { "idempotencyKey": "…", "status": "APPLIED", "entityId": "…" },
      { "idempotencyKey": "…", "status": "DUPLICATE", "entityId": "…" },
      { "idempotencyKey": "…", "status": "REJECTED", "error": { "code": "VALIDATION_ERROR", "message": "…" } }
    ],
    "serverTime": "2026-10-22T10:00:00.000Z"
  }
}
```

An operation whose `idempotencyKey` was already applied returns `DUPLICATE` with the original
entity id, so a client can safely retry the whole batch.

Implementation status (2026-10-24): `ORDER` / `CREATE` is supported for active
`OWNER`, `MANAGER`, `CASHIER`, and `WAITER` memberships, with a signed session cookie
and `X-Tenant-Id`. Other entity/operation pairs return per-operation
`REJECTED` / `UNSUPPORTED_OPERATION`; payment replay is not implemented.
Batches contain 1–100 operations. Order payloads accept `type` (`DINE_IN`,
`TAKEAWAY`, `DELIVERY`), optional `tableId`, and nonempty `items` containing only
`menuItemId` and positive integer `quantity`. Prices, discounts, notes, and other
extra payload fields are currently rejected rather than silently ignored.
Totals currently use the existing online route's fixed 7% tax and zero service
charge; configurable tenant rates remain unfinished. Each operation commits its
order, item snapshots, history, and replay record atomically. Rejected operations
can be corrected and retried with the same key. Successful keys are unique per
tenant across devices. Sync writes serialize per tenant; the existing online
order route does not yet share this locking/numbering strategy.
The `SyncOperation` migration must be deployed before using this endpoint.

## 11. Phase 8 — Inventory

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/inventory/items` | membership | Stock items |
| `POST` | `/api/inventory/items` | `OWNER`/`MANAGER` | Add a stock item |
| `PATCH` | `/api/inventory/items/:itemId` | `OWNER`/`MANAGER` | Adjust stock, recording a movement |
| `GET` | `/api/inventory/movements` | membership | Stock movement history |

      "tax": 0,
      "serviceCharge": 0,
      "total": 12500,
      "items": [
        { "id": "…", "menuItemId": "…", "name": "Laphet Thoke", "unitPrice": 6500, "quantity": 2, "lineTotal": 13000, "status": "PENDING" }
      ]
    }
  }
}
```

Replaying the same `idempotencyKey` returns the original order instead of creating a duplicate.

### Order status transition map

| From | Allowed to |
| --- | --- |
| `OPEN` | `IN_PROGRESS`, `CANCELLED` |
| `IN_PROGRESS` | `READY`, `CANCELLED` |
| `READY` | `COMPLETED`, `CANCELLED` |
| `COMPLETED` | `REFUNDED` |
| `CANCELLED` | — |
| `REFUNDED` | — |

Any other transition is rejected with `422`.

### Order item status transition map

| From | Allowed to |
| --- | --- |
| `PENDING` | `COOKING`, `CANCELLED` |
| `COOKING` | `READY`, `CANCELLED` |
| `READY` | `SERVED`, `CANCELLED` |
| `SERVED` | — |
| `CANCELLED` | — |
