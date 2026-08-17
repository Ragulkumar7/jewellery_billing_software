# PostgreSQL

The billing system uses PostgreSQL as its system of record. Set `DATABASE_URL` for the API, then run:

```bash
pnpm --filter admin-api db:migrate
```

The migration creates users and roles, sales, purchases, products, stock movements, silver rates, accounts, reports data, Shopify sync logs, settings, and audit logs. The Node API owns database access; the browser must not receive database credentials.
