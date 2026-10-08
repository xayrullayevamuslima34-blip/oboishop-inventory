# OboiShop Inventory: Warehouse & Sales Management System

A full-stack warehouse accounting system I built for a wallpaper store. It covers products, stock in and out with **FIFO batch costing**, a quick-sale **mini-POS** with barcode scanning, customer and supplier balances, a cash box, reports with charts, barcode and label printing, and in-app notifications.

The original system runs in production for a real business. This repository is a cleaned-up portfolio copy without deployment configuration.

![Next.js](https://img.shields.io/badge/Next.js-000000?logo=nextdotjs&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify-000000?logo=fastify&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?logo=prisma&logoColor=white)
![Zod](https://img.shields.io/badge/Zod-3E67B1?logo=zod&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-59_tests-6E9F18?logo=vitest&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-monorepo-F69220?logo=pnpm&logoColor=white)

## Features

- **Products:** images, bulk creation, packaging, purchase and sale prices
- **Stock in / stock out / returns** as documents with a `draft → confirmed → cancelled` lifecycle
- **FIFO batch allocation:** a sale consumes the oldest batches first, so cost of goods and profit are exact
- **Mini-POS:** fast checkout with a barcode scanner and printable receipts
- **Customers and suppliers:** debt and payment ledger, with reconciliation statements
- **Cash box and expenses:** sales are recorded in the cash box automatically
- **Inventory counts** (stock-taking)
- **Reports and dashboard:** sales, profit, stock value, expenses and business indicators, with Recharts graphs and CSV export
- **Barcode and label printing** (JsBarcode)
- **In-app notifications** for low stock and debt limits
- **Global search** (⌘K), audit log, database backup download, multi-currency exchange rates

## Engineering decisions

These are documented in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md):

- **Money is never a float.** Amounts are stored as `BIGINT` and serialized as strings in the API.
- **Concurrency-safe FIFO.** Batches are locked with `SELECT ... FOR UPDATE` inside a transaction. If stock runs short, the whole document is rejected with `409`; partial allocation is never applied.
- **Nothing financial is ever deleted.** Cancelling a document creates compensating entries, and master data uses soft delete with `onDelete: Restrict`.
- **Audit trail.** Every financial create, confirm or cancel is written to `audit_log` in the same DB transaction.
- **Notifications fire on threshold crossings.** An alert is sent only when stock or debt crosses its limit during an operation, so repeated alerts don't become noise.
- **One schema source of truth.** Zod schemas in `packages/shared` validate the API (via `fastify-type-provider-zod`) and type the frontend.

## Tech stack

| Layer | Tools |
|---|---|
| Frontend | Next.js (App Router), React, TanStack Query, Tailwind CSS, Recharts, JsBarcode |
| Backend | Fastify, Prisma, PostgreSQL, JWT, Zod |
| Shared | `@oboishop/shared`: Zod schemas, types, enums, error codes |
| Testing | Vitest: 59 integration tests against a real PostgreSQL database |
| Tooling | pnpm workspaces, Docker Compose |

## Project structure

```
apps/
  api/               # Fastify + Prisma backend
    prisma/          # schema, 16 migrations, seed
    src/routes/      # products, stock-in, stock-out, contragents, cash-box, reports, ...
    src/services/    # business logic (FIFO allocation, ledger, reports, ...)
    src/__tests__/   # integration tests
  web/               # Next.js frontend
packages/
  shared/            # Zod schemas and types shared by api and web
docs/
  ARCHITECTURE.md    # design decisions
```

## Getting started

Requirements: Node.js 20+, pnpm and Docker.

```bash
pnpm install
cp .env.example .env
docker compose up -d     # PostgreSQL on port 5544
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- API: http://localhost:4000 (`/health`, endpoints under `/api/v1`)
- Web: http://localhost:3000
- Local demo login (created by the seed): `menejer` / `sklad12345`

## Tests

```bash
pnpm test
```

Integration tests run against the local PostgreSQL database and cover auth, FIFO stock movements, the customer and supplier ledger, the cash box, inventory counts, reports, notifications, product images and backups.
