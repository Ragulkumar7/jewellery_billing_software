# Deployment Notes — Hosting the Project

**Architecture:** Frontend (billing-web) on **Vercel** · Backend (admin-api) + PostgreSQL on **Railway**

```
Browser → Vercel (React static site) ──HTTP──> Railway (Express API) ──> Railway Postgres
                                                          │
Shopify webhooks/sync ────────────────────────────────────┘
```

---

## Part 1 — Railway: Database + API backend

### Step 1: Create project and database

1. Go to [railway.app](https://railway.app) → sign in with GitHub
2. **New Project** → **Provision PostgreSQL** (a `Postgres` card appears — this is your production database)
3. Click the Postgres card → **Data** tab → copy the `DATABASE_URL` value (the `postgresql://...` string). You'll paste it twice later.

### Step 2: Deploy the API

1. In the same project: **+ Create** → **GitHub Repo** → pick `jewellery_billing_software` (branch `main`)
2. Railway reads `railway.toml` at the repo root automatically:
   - build: `pnpm install --frozen-lockfile && pnpm --filter admin-api build`
   - start: `pnpm --filter admin-api start`
3. ⚠️ Do NOT set "Root Directory" to `apps/admin-api`. The service root must stay at the **repo root** so pnpm can resolve the workspace packages.
4. Open the API service → **Variables** tab → add:

| Variable | Value | Where to get it |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Type exactly this — Railway auto-links to your Postgres card |
| `NODE_ENV` | `production` | — |
| `SHOPIFY_STORE_DOMAIN` | e.g. `opalline.myshopify.com` | Same as local `.env` |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | `shpat_...` | Same as local `.env` |
| `SHOPIFY_API_VERSION` | `2026-07` | Same as local `.env` |
| `SHOPIFY_WEBHOOK_SECRET` | `shpss_...` | Same as local `.env` |
| `SHOPIFY_LOCATION_ID` | `gid://shopify/Location/...` | Same as local `.env` |

5. ⚠️ **Do NOT set `DEV_AUTH_BYPASS` in production.** It would let anyone call the API without logging in.
6. If starting with an empty database and you need the first login, temporarily add `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`, log in once, then delete both variables.
7. Wait for deploy to go green, then service → **Settings** → **Networking** → **Generate Domain** → save the public URL (looks like `https://jewellery-billing-software-api.up.railway.app`). This is your **API URL**.
8. Test it: open `<api-url>/api/auth/me` in a browser. Expect JSON (401 without token is fine — it proves the server is alive).

### Step 3: Apply migrations to the cloud database

From your own machine (PowerShell), pointing at the Railway Postgres URL from Step 1:

```powershell
$env:DATABASE_URL = "postgresql://postgres:...@railway-internal-or-proxy:5432/railway"
pnpm --filter admin-api db:migrate
```

Expect one `Applied ...sql` line per pending migration (or silence if all applied).

### Optional: bring your local data along

The cloud DB starts empty. To copy your current dev data:

```powershell
# dump locally...
$env:PGPASSWORD="<local-pg-password>"; pg_dump -h localhost -U postgres -d opal_line_jewelry -F c -f backup.dump
# ...restore into Railway (use the PUBLIC connection string)
pg_restore -h <railway-host> -U postgres -d railway --no-owner backup.dump
```

Skip this if you'd rather start clean.

---

## Part 2 — Vercel: Frontend

1. **Delete the failed project** `jewellery-billing-software-admin-api` in Vercel (it was created with the wrong Root Directory — that's why every deploy failed).
2. Vercel dashboard → **Add New… → Project** → import `Ragulkumar7/jewellery_billing_software`
3. Configure:
   - **Framework Preset:** Other (Vercel picks up the root `vercel.json`)
   - **Root Directory:** leave EMPTY (repo root). This is critical — `vercel.json` lives at the root.
   - Build/output settings: leave as-is (`vercel.json` already points build at `apps/billing-web` and output at `apps/billing-web/dist`, plus SPA rewrites)
4. Before deploying, open **Environment Variables** and add:

| Variable | Value |
|---|---|
| `VITE_API_URL` | Your Railway public domain from Part 1 Step 2.8 (e.g. `https://jewellery-billing-software-api.up.railway.app`) |

5. **Deploy**. The frontend calls the API using `VITE_API_URL` (see `apps/billing-web/src/lib/api.ts`).
6. Open the Vercel URL and log in. If you started with an empty cloud DB, use the bootstrap credentials from Part 1 Step 2.6.

---

## Part 3 — Shopify webhook registration (after both are live)

Once the API has its public HTTPS domain:

```powershell
$env:PUBLIC_API_URL = "<your-railway-domain>"
pnpm --filter admin-api register-webhooks
```

This registers products/inventory topics against the Railway URL. See `docs/shopify-webhooks.md`.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Railway build fails resolving `@repo/*` | Service root was set to `apps/admin-api` | Delete service, redeploy with repo root |
| Vercel deploys blank page / 404 on assets | Wrong Root Directory or missing `vercel.json` | Root Directory must be empty; `vercel.json` must be at repo root |
| Frontend loads but no data / network errors | `VITE_API_URL` unset or wrong | Set it to the exact Railway domain (https, no trailing slash), redeploy |
| Login says invalid credentials | Cloud DB is empty | Add `BOOTSTRAP_ADMIN_EMAIL`/`PASSWORD` vars, redeploy, log in, remove vars |
| CORS errors in browser console | API reachable but rejects origin | `cors()` is wide-open by default; if you see this, check the API actually deployed |
