# Project progress

Current state and recent checks.

## Current task
T001 — Monorepo bootstrap (COMPLETED)

## Most recently completed task
T001 — Monorepo bootstrap

## Recent changes and checks

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
- `apps/api/src/index.ts`: Created with helmet, CORS, body parsers, health endpoints (/api/health, /api/health/ready), and error-handler middleware
- Prisma client generated successfully (`npx prisma generate`)
- `npx tsc --noEmit --project apps/api/tsconfig.json`: Passes with no errors

## Known issues

- Prisma migration (`npx prisma migrate dev`) fails due to database user not having CREATE DATABASE permission (shadow database issue). Database `restaurant_mng` exists but tables need to be created manually or permissions granted.
- Web package has no source files yet - typecheck reports "no inputs" which is expected

## Next steps

1. Set up apps/web Vite + React Router 7 + TanStack Query 5 shell
2. Verify `npm run dev` starts both API and web
3. Run `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`
4. Update PROGRESS.md with verified results