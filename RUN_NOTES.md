# How to Run This Project

Quick guide so you don't need to ask. Everything below was verified working on this machine.

## Quick Start (the short version)

Open **two terminals** at the project root (`C:\Users\ksc\Desktop\jewelry-erp`) and run:

```bash
# Terminal 1 — API
pnpm --filter admin-api dev

# Terminal 2 — Frontend
pnpm --filter billing-web dev
```

Then open:

- **Billing UI:** http://localhost:5173
- **API:** http://localhost:4000 (test: http://localhost:4000/api/auth/me → `{"success":true,...}`)

That's it. If you just need to run it, stop here.

---

## Prerequisites (already set up on this machine)

| Requirement | Status | Notes |
|---|---|---|
| PostgreSQL running on port 5432 | ✅ | Must be running before the API starts |
| `apps/admin-api/.env` | ✅ | Contains `DATABASE_URL`, bootstrap admin creds, Shopify creds |
| Node deps installed (`node_modules`) | ✅ | Re-run `pnpm install` if you pull new code with new deps |
| DB schema/migrations applied | ✅ | 36 tables; re-apply only after migration files change |

### First-time setup (only if on a fresh machine)

```bash
pnpm install
pnpm --filter admin-api db:migrate
```

Set up `apps/admin-api/.env` (copy from `.env.example`):

```env
DATABASE_URL=postgres://user:pass@localhost:5432/opal_line_jewelry
BOOTSTRAP_ADMIN_EMAIL=...     # only for first login when DB has no users
BOOTSTRAP_ADMIN_PASSWORD=...  # then remove from .env
DEV_AUTH_BYPASS=true          # dev-only: auto-authenticated API access
```

---

## Commands Cheat Sheet

| Command | What it does |
|---|---|
| `pnpm --filter admin-api dev` | API dev server on **port 4000** (auto-reloads on change) |
| `pnpm --filter billing-web dev` | Vite frontend on **port 5173** (auto-reloads on change) |
| `pnpm dev` | Starts **both** via turbo (one command, both terminals' output in one) |
| `pnpm --filter admin-api db:migrate` | Apply pending SQL migrations from `infra/postgres/migrations` |
| `pnpm build` | Build all apps/packages |
| `pnpm lint` | Lint everything |
| `pnpm check-types` | Type-check everything |

---

## Useful Details

- **Login:** `DEV_AUTH_BYPASS=true` is set, so the API auto-authenticates in dev — no login screen friction. Real bootstrap credentials are in `apps/admin-api/.env` (`BOOTSTRAP_*`), used only when the DB has zero users.
- **Shopify:** Credentials are already in `.env`. Status/sync endpoints live under `/api/shopify/*`.
- **Ports:** API = `4000`, Web = `5173`. Change `PORT` in `.env`; Vite port via `--port` flag.
- **If the API crashes on startup**, it's almost always: PostgreSQL not running (start it) or a bad `DATABASE_URL`.
- **If the frontend shows API errors**, make sure the API terminal is still running — Vite and Express are separate processes.

## Stopping

`Ctrl+C` in each terminal. That's all — no cleanup needed.

## One-Liner (start both, backgrounded)

If you want both up without two terminals, from the project root:

```bash
pnpm dev
```

Run it in one terminal; both servers run under it. `Ctrl+C` stops both.