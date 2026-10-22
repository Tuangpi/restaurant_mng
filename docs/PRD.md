# PRD — Restaurant Management System

Myanmar-first restaurant management SaaS for teahouses, cafes, and small-to-medium restaurants.

> This document is the product source of truth. Architecture lives in [`ARCHITECTURE.md`](ARCHITECTURE.md); the HTTP contract lives in [`API.md`](API.md).

## 1. Problem

Myanmar restaurants run on paper, notebooks, and messaging apps. Owners cannot know which table owes what, who sold which dish, whether the drawer balances at close, or which items actually sell. Cashiers hand out printed receipts by hand and reconcile the drawer by memory.

This product turns that into a single, low-cost, mobile-first system that a non-technical owner can run with a phone at the counter and a laptop in the back office.

## 2. Users and roles

A person signs in once. They may belong to several restaurants, each with a different role.

| Role | Purpose | Typical capabilities |
| --- | --- | --- |
| `OWNER` | Restaurant owner / founder | Everything, including settings, staff, refunds, reports |
| `MANAGER` | Floor or shift manager | Orders, menu, staff, reports, refunds |
| `CASHIER` | Counter staff | Take orders, take payments, issue receipts, open/close their shift |
| `WAITER` | Server | Take and record orders, update order status |
| `KITCHEN` | Kitchen staff | Kitchen display, mark items cooking/ready/served |

Permissions are enforced **on the server**. The client never decides what a user may do.

## 3. Goals

1. Record every order with exact line items and prices.
2. Record every payment against an order, with receipts and refunds.
3. Keep the cash drawer accountable through cashier shifts with opening/closing counts.
4. Give the kitchen a live view of what to cook.
5. Show the owner daily sales, payment mix, and best-selling items.
6. Keep working when the internet is flaky (offline capture with server sync).

## 4. Non-goals

- No automated payment-provider integration (KBZPay, WavePay, AYA Pay are recorded **manually**).
- No delivery or courier dispatch.
- No payroll, supplier purchase orders, or accounting ledgers.
- No multi-currency pricing (MMK only for the MVP).
- No native mobile apps (mobile-first web).
- No microservices.

## 5. Scope by phase

### Phase 1 — Foundation
Repository setup, database schema, migrations, seed, health endpoint, error handling, web shell.

### Phase 2 — Authentication, tenants, memberships, authorization
Registration, login, logout, session refresh, password hashing, tenant creation/selection, membership
invites, role checks, and **tenant isolation** on every protected operation.

### Phase 3 — Restaurant settings, staff, and menu
Restaurant profile (name, address, tax and service-charge rates, receipt footer, order numbering),
staff records with roles and status, menu categories and menu items with MMK prices and availability.

### Phase 4 — Orders and POS
Tables and seating areas, order types (dine-in, takeaway, delivery), order creation with
server-calculated totals, order item status transitions, order number sequencing, kitchen routing.

### Phase 5 — Payments, receipts, refunds, cashier shifts
Cash and manual KBZPay / WavePay / AYA Pay / bank transfer payments, receipt issuance and reprinting,
refunds with reasons, cashier shift open/close with cash reconciliation (expected vs actual).

### Phase 6 — Kitchen and reports
Kitchen display screen with live order items, plus reports for daily sales, payment mix, and
item performance.

### Phase 7 — Offline synchronization
Client-side queued mutations, idempotency keys, a sync endpoint that replays queued operations in
order and resolves conflicts by server timestamp.

### Phase 8 — Inventory basics, security review, pilot readiness
Simple stock items and consumption from orders, a security review of auth/tenant/payment paths,

## 6. Business rules

These are non-negotiable and are enforced server-side.

### 6.1 Money
- All amounts are **integer MMK**. Kyat has no practical minor unit; floats are forbidden.
- Prices, discounts, tax, service charge, and totals are **computed on the server**.
- A client-supplied price is never trusted; the server reads the menu item price.
- Order items **snapshot** the item name and unit price at the time of sale, so later menu edits
  never rewrite history.

### 6.2 Ordering
- An order belongs to exactly one tenant. Cross-tenant reads and writes are rejected.
- Every line item quantity is a positive integer; the server recomputes the line total.
- Order and payment status are **separate** concerns: an order can be `OPEN` while `UNPAID`.
- Status changes follow an explicit transition map. Illegal transitions are rejected.
- Every status change is written to an audit/history row.

### 6.3 Payments and shifts
- A payment must reference an order in the same tenant.
- Overpayment by cash records `tendered` and computes `change` on the server.
- Refunds require a reason and are recorded against the original payment; refunded totals cannot
  exceed the captured amount.
- A cashier shift records an opening float and, at close, the counted cash, the expected cash, and
  the difference.

### 6.4 Tenancy and access
- Every tenant-owned row carries a `tenantId`.
- Every protected request resolves the acting user and their membership in the target tenant.
- Missing membership → `403`. Missing authentication → `401`.
- A user with no membership in a tenant cannot reach any of its data.

### 6.5 Offline sync
- Each client mutation carries a client-generated **idempotency key**; replaying the same key must
  not duplicate an order or payment.
- The server is authoritative. On conflict, the server value wins and the client is told.

## 7. Non-functional requirements

- **Mobile-first**: the primary device is a cheap Android phone at the counter. All core flows work
  at 360 px width.
- **Bilingual**: English and Burmese throughout, with a language switcher that persists the choice.
- **Offline tolerance**: order capture survives a network drop and syncs later.
- **Performance**: list endpoints are paginated; the POS order screen stays responsive under a
  burst of orders.
- **Security**: hashed passwords, httpOnly session cookies, rate-limited auth endpoints, helmet,
  CORS allow-list, and no secrets in the repository.
- **Quality**: strict TypeScript, Zod validation on all external input, automated tests for
  tenant isolation, payments, and order calculations.

## 8. Success criteria

The MVP is pilot-ready when a restaurant can, without developer help:

1. Create staff accounts and assign roles.
2. Build a bilingual menu with MMK prices.
3. Seat customers, take orders, and send them to the kitchen.
4. Take cash and manual wallet payments, and print receipts.
5. Open and close a cashier shift with a balanced or explained drawer.
6. Read daily sales and best-seller reports.
7. Recover from a network drop without losing an order.

## 9. Assumptions and open items

- Payment verification is **manual** by staff; no provider API is integrated. Wallet references and
  screenshots are treated as unverified until a human confirms them.
- A tenant may later have several branches; the MVP models a tenant as one operating restaurant to
  keep the data model honest. Branching is explicitly deferred.
- Inventory in Phase 8 tracks simple stock counts and consumption; it is not a full stock ledger.

and the documentation/seed needed for a real pilot.
