import { env } from "@repo/config/env";

const registrations = [
  { topic: "PRODUCTS_CREATE", resource: "products", event: "create" },
  { topic: "PRODUCTS_UPDATE", resource: "products", event: "update" },
  { topic: "PRODUCTS_DELETE", resource: "products", event: "delete" },
  { topic: "INVENTORY_LEVELS_UPDATE", resource: "inventory_levels", event: "update" },
] as const;

const mutation = `mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
  webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
    webhookSubscription { id }
    userErrors { field message }
  }
}`;

if (!env.SHOPIFY_STORE_DOMAIN || !env.SHOPIFY_ADMIN_ACCESS_TOKEN || !env.PUBLIC_API_URL) {
  console.error("Missing configuration. Set SHOPIFY_STORE_DOMAIN, SHOPIFY_ADMIN_ACCESS_TOKEN and PUBLIC_API_URL (the public HTTPS base URL where the API is deployed) in apps/admin-api/.env");
  process.exit(1);
}

const endpoint = `https://${env.SHOPIFY_STORE_DOMAIN}/admin/api/${env.SHOPIFY_API_VERSION}/graphql.json`;
const baseUrl = env.PUBLIC_API_URL.replace(/\/+$/, "");
let exitCode = 0;

for (const { topic, resource, event } of registrations) {
  const callbackUrl = `${baseUrl}/api/shopify/webhooks/${resource}/${event}`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": env.SHOPIFY_ADMIN_ACCESS_TOKEN },
      body: JSON.stringify({ query: mutation, variables: { topic, webhookSubscription: { callbackUrl, format: "JSON" } } }),
    });
    const body = await response.json();
    const created = body.data?.webhookSubscriptionCreate?.webhookSubscription;
    const errors = body.data?.webhookSubscriptionCreate?.userErrors ?? body.errors ?? [];
    if (created) {
      console.log(`${topic} -> ${callbackUrl} -> created (${created.id})`);
    } else {
      console.error(`${topic} -> ${callbackUrl} -> rejected: ${errors.map((e: { message?: string }) => e.message ?? String(e)).join("; ")}`);
      exitCode = 1;
    }
  } catch (error) {
    console.error(`${topic} -> ${callbackUrl} -> failed: ${error instanceof Error ? error.message : String(error)}`);
    exitCode = 1;
  }
}

process.exit(exitCode);