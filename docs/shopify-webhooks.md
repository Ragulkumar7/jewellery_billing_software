# Shopify Webhook Registration Guide

The API exposes signed webhook endpoints that receive Shopify push events.
**None of them are registered yet** — the app currently has zero webhook
subscriptions, so everything relies on the manual "sync" buttons. Register the
topics below to get real-time updates.

## Endpoints

Base: `POST {API_PUBLIC_URL}/api/shopify/webhooks/:resource/:event`

The handler maps the URL path to a Shopify topic and dispatches:

| Shopify topic | Callback URL | Handler behavior |
| --- | --- | --- |
| `products/create` | `{API}/api/shopify/webhooks/products/create` | Checks ERP price vs Shopify price; flags external edits |
| `products/update` | `{API}/api/shopify/webhooks/products/update` | Same as create |
| `products/delete` | `{API}/api/shopify/webhooks/products/delete` | Marks ERP product `shopify_sync_status = 'Not Synced'` + flag |
| `inventory_levels/update` | `{API}/api/shopify/webhooks/inventory_levels/update` | ERP is authoritative: **restores ERP stock** to Shopify, flags the external change |
| `orders/create` | `{API}/api/shopify/webhooks/orders/create` | Mirror row + auto-create Draft ERP sales order |
| `customers/create` | `{API}/api/shopify/webhooks/customers/create` | Auto-link/create ERP customer |
| `customers/update` | `{API}/api/shopify/webhooks/customers/update` | Re-link / refresh |
| `customers/delete` | `{API}/api/shopify/webhooks/customers/delete` | Marks ERP customer `Inactive`, removes mirror |

## What can be registered on the CURRENT store plan

Only non-PII topics are allowed on this plan:

- ✅ `products/create`, `products/update`, `products/delete`
- ✅ `inventory_levels/update`

The following topics **cannot be subscribed until the store plan is upgraded
and the app is approved for customer data (PII)** — Shopify rejects them with
*"This app is not approved to subscribe to webhook topics containing protected
customer data"*:

- ❌ `orders/create`, `orders/update`
- ❌ `customers/create`, `customers/update`, `customers/delete`

Until then, orders and customers are covered by the manual full sync (which
already degrades gracefully without PII).

## Prerequisites

1. The API deployed and reachable at a **public HTTPS URL** (Shopify rejects
   non-HTTPS and localhost). Example: `https://billing.opalline.in`.
2. `SHOPIFY_WEBHOOK_SECRET` set in the API environment (same value used at
   registration time — changing it invalidates HMAC verification).
3. The webhook receiver must read the **raw body** (the HMAC is computed over
   the raw JSON body, before any parsing).
4. Verify the API is healthy before registering: `GET {API}/health`.

## Method A — Register in Shopify admin (easiest)

1. Log in to the store admin →
   **Settings → Notifications → Webhooks → Add webhook**.
2. For each topic below, pick the event, set the callback URL, format **JSON**,
   and API version **2026-07**:

| Event (admin dropdown) | Callback URL |
| --- | --- |
| Product creation | `https://billing.opalline.in/api/shopify/webhooks/products/create` |
| Product update | `https://billing.opalline.in/api/shopify/webhooks/products/update` |
| Product deletion | `https://billing.opalline.in/api/shopify/webhooks/products/delete` |
| Inventory level update | `https://billing.opalline.in/api/shopify/webhooks/inventory_levels/update` |

(Replace `billing.opalline.in` with your real API domain.)

## Method B — Register via GraphQL Admin API

POST to `https://{store}.myshopify.com/admin/api/2026-07/graphql.json`
with header `X-Shopify-Access-Token: {SHOPIFY_ADMIN_ACCESS_TOKEN}`.

```graphql
mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
    webhookSubscription { id }
    userErrors { field message }
  }
}
```

Variables (repeat per topic):

```json
{
  "topic": "PRODUCTS_CREATE",
  "webhookSubscription": {
    "callbackUrl": "https://billing.opalline.in/api/shopify/webhooks/products/create",
    "format": "JSON"
  }
}
```

Topics: `PRODUCTS_CREATE`, `PRODUCTS_UPDATE`, `PRODUCTS_DELETE`,
`INVENTORY_LEVELS_UPDATE`. The `userErrors` field reports plan/PII rejections.

## Verification

1. **List registrations:**

   ```graphql
   query { webhookSubscriptions(first: 25) { edges { node { id topic callbackUrl } } } }
   ```

2. **Confirm deliveries** — after a product/inventory change in Shopify, check
   the API's Shopify Sync UI (**Errors/Logs** tabs) or the `sync_logs` table for
   `webhook_product` / `inventory_webhook` entries with status `Synced`.

3. **Local end-to-end smoke test** (before deployment): post a signed payload
   straight at the endpoint to confirm the handler works:

   ```bash
   node -e "
   const { createHmac } = require('node:crypto');
   const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
   const body = JSON.stringify({ id: 123, title: 'test', variants: [{ sku: '999', price: '100' }] });
   const hmac = createHmac('sha256', secret).update(body).digest('base64');
   fetch('http://localhost:4000/api/shopify/webhooks/products/create', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json', 'X-Shopify-Hmac-Sha256': hmac },
     body,
   }).then((r) => r.text()).then(console.log);
   "
   ```

## Operational notes

- **Inventory direction:** the ERP is the source of truth. If stock changes in
  Shopify, the webhook restores the ERP value to Shopify and records a flag
  (`inventory_restored`). Stock changes are never imported from Shopify.
- **Products:** Shopify edits (price/name) are detected and flagged
  (`external_edit`) — the ERP restores its values on the next full sync.
- **Order of registration:** register products + inventory first. Orders and
  customers webhooks can be added later after the store plan upgrade + customer
  data approval — no code changes needed, the handlers already exist.
