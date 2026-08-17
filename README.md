# Opal Line Jewelry Billing Software

Internal billing and business operations software for Opal Line Jewelry.

## Stack

- **Package Manager:** pnpm
- **Monorepo:** Turborepo
- **Frontend:** React + Vite (`apps/billing-web`)
- **Backend:** Node.js / Express (`apps/admin-api`)
- **Database:** PostgreSQL (`infra/postgres`)
- **Language:** TypeScript
- **Commerce:** Shopify

## Structure

```
apps/
  billing-web/  React billing application
  admin-api/    Node.js API

packages/
  config/       Shared configuration
  shopify/      Shopify integration
  types/        Shared TypeScript types
  ui/           Shared React components
  utils/        Shared utilities
```

## Getting Started

Install PostgreSQL and create a database named `opal_line_jewelry`. Then set `DATABASE_URL` for the API. An example is available at `apps/admin-api/.env.example`.

Apply the database schema:

```bash
pnpm install
pnpm --filter admin-api db:migrate
```

The second migration adds normalized roles and permissions, sessions, password
reset storage, and authorization audit records. Set `BOOTSTRAP_ADMIN_EMAIL` and
`BOOTSTRAP_ADMIN_PASSWORD` only for the first login when the database has no
users, then remove them from the API environment.

Identity endpoints are available under `/api/auth`, `/api/users`, `/api/roles`,
and `/api/permissions`. Protected business routes require a bearer session and
their granular permission; UI visibility is not treated as a security boundary.

Run the frontend and API in separate terminals:

```bash
pnpm --filter admin-api dev
pnpm --filter billing-web dev
```

The API runs on port `4000` and the billing UI runs on the Vite port shown in the terminal.

## Shopify Integration

Create a Shopify custom app, install it on the store, and grant the Admin API scopes
`read_products`, `write_products`, `read_inventory`, `write_inventory`,
`read_orders`, and `read_customers`. Add the credentials to `apps/admin-api/.env`:

```env
SHOPIFY_STORE_DOMAIN=opalline.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_...
SHOPIFY_API_VERSION=2026-07
SHOPIFY_WEBHOOK_SECRET=...
```

The access token stays on the API server. The API exposes `GET /api/shopify/status`,
`POST /api/shopify/sync/:scope`, and signed webhook endpoints under
`/api/shopify/webhooks/:topic`. Register Shopify webhook topics for orders,
customers, products, and inventory against the public API URL.

## Scripts

| Command            | Description                    |
| ------------------ | ------------------------------ |
| `pnpm dev`         | Start all apps in development  |
| `pnpm build`       | Build all apps and packages    |
| `pnpm lint`        | Lint all apps and packages     |
| `pnpm check-types` | Type-check all apps and packages |
