import { createHmac, timingSafeEqual } from 'node:crypto';
import { Router, type Request, type Response, type Router as RouterType } from 'express';
import { createShopifyClient, ShopifyApiError, type ShopifyConfig } from '@repo/shopify';
import { env } from '@repo/config/env';
import { pool } from '../db/pool.js';
import { authenticate, requirePermission, type AuthenticatedRequest } from '../middleware/authorization.js';

const protectedRouter: RouterType = Router();
const webhookRouter: RouterType = Router();
const scopeSchema = new Set(['products', 'inventory', 'orders', 'customers', 'everything']);

const shopQuery = `query ShopStatus { shop { name myshopifyDomain } }`;
const productQuery = `query Products($cursor: String) {
  products(first: 250, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    edges { node {
      id title status
      variants(first: 10) { edges { node { id sku price inventoryQuantity inventoryItem { id } } } }
    } }
  }
}`;
const customerQuery = `query Customers($cursor: String) {
  customers(first: 250, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    edges { node { id displayName firstName lastName email phone numberOfOrders amountSpent { amount } } }
  }
}`;
const orderQuery = `query Orders($cursor: String) {
  orders(first: 100, sortKey: CREATED_AT, reverse: true, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    edges { node {
      id name createdAt displayFinancialStatus displayFulfillmentStatus
      totalPriceSet { shopMoney { amount currencyCode } }
      customer { id displayName email }
    } }
  }
}`;
const locationsQuery = `query Locations { locations(first: 10) { edges { node { id name } } } }`;
const productSetMutation = `mutation ProductSet($input: ProductSetInput!, $key: String!) {
  productSet(input: $input) @idempotent(key: $key) {
    product { id title status variants(first: 10) { edges { node { id sku price inventoryItem { id } } } } }
    userErrors { field message }
  }
}`;
const productInventoryQuery = `query ProductInventory($id: ID!) {
  product(id: $id) { variants(first: 1) { edges { node { id sku inventoryItem { id } } } } }
}`;
const inventoryItemSkuMutation = `mutation UpdateInventoryItem($id: ID!, $input: InventoryItemInput!, $key: String!) {
  inventoryItemUpdate(id: $id, input: $input) @idempotent(key: $key) { inventoryItem { id sku } userErrors { field message } }
}`;
const inventoryQuantityMutation = `mutation SetInventory($input: InventorySetQuantitiesInput!, $key: String!) {
  inventorySetQuantities(input: $input) @idempotent(key: $key) { userErrors { field message } }
}`;

type PageInfo = { hasNextPage: boolean; endCursor: string | null };
type EdgeResult<T> = { pageInfo: PageInfo; edges: { node: T }[] };

type ShopifyVariant = { id: string; sku: string | null; price: string; grams: number | null; inventoryQuantity: number | null; inventoryItem: { id: string } | null };
type ShopifyProduct = { id: string; title: string; status: string; variants: { edges: { node: ShopifyVariant }[] } };
type ShopifyProductResponse = { products: { pageInfo: PageInfo; edges: { node: ShopifyProduct }[] } };
type ShopifyCustomer = { id: string; displayName: string; firstName: string | null; lastName: string | null; email: string | null; phone: string | null; numberOfOrders: string; amountSpent: { amount: string } };
type ShopifyCustomerResponse = { customers: { pageInfo: PageInfo; edges: { node: ShopifyCustomer }[] } };
type ShopifyOrder = { id: string; name: string; createdAt: string; displayFinancialStatus: string; displayFulfillmentStatus: string | null; totalPriceSet: { shopMoney: { amount: string; currencyCode: string } }; customer: { id: string; displayName: string; email: string | null } | null };
type ShopifyOrderResponse = { orders: { pageInfo: PageInfo; edges: { node: ShopifyOrder }[] } };
type ShopifyProductSetResponse = { productSet: { product: { id: string; title: string; status: string; variants: { edges: { node: { id: string; sku: string | null; price: string; inventoryItem: { id: string } | null } }[] } } | null; userErrors: { field: string[] | null; message: string }[] } };

type SkuMatch = { sku: string; productId: string; variantId: string; inventoryItemId: string | null; price: number; inventoryQuantity: number | null; status: string; productTitle: string };

type LogInput = {
  type: string;
  name: string;
  status: 'Synced' | 'Failed' | 'Flagged' | 'Skipped' | 'Pending';
  error?: string | null;
  direction?: 'import' | 'export';
  operation?: string;
  entityId?: string | null;
  shopifyId?: string | null;
  shopifyProductId?: string | null;
  shopifyVariantId?: string | null;
  shopifyInventoryItemId?: string | null;
  attempts?: number;
};

async function fetchAllPages<T>(fetchPage: (cursor: string | null) => Promise<EdgeResult<T>>): Promise<T[]> {
  const nodes: T[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 500; page += 1) {
    const result = await fetchPage(cursor);
    nodes.push(...result.edges.map((edge) => edge.node));
    if (!result.pageInfo.hasNextPage || !result.pageInfo.endCursor) break;
    cursor = result.pageInfo.endCursor;
  }
  return nodes;
}

async function fetchAllShopifyProducts(client: ReturnType<typeof createShopifyClient>): Promise<ShopifyProduct[]> {
  return fetchAllPages<ShopifyProduct>((cursor) =>
    client.query<ShopifyProductResponse>(productQuery, cursor ? { cursor } : undefined).then((data) => ({ pageInfo: data.products.pageInfo, edges: data.products.edges })),
  );
}

function buildSkuMap(products: ShopifyProduct[]): Map<string, SkuMatch> {
  const map = new Map<string, SkuMatch>();
  for (const product of products) {
    for (const variantEdge of product.variants.edges) {
      const variant = variantEdge.node;
      const sku = variant.sku?.trim();
      if (!sku) continue;
      map.set(sku.toLowerCase(), {
        sku,
        productId: product.id,
        variantId: variant.id,
        inventoryItemId: variant.inventoryItem?.id ?? null,
        price: Number(variant.price) || 0,
        inventoryQuantity: variant.inventoryQuantity,
        status: product.status,
        productTitle: product.title,
      });
    }
  }
  return map;
}

async function getSilverRate(): Promise<number> {
  if (!pool) return 92.8;
  const rate = (await pool.query('select rate_per_gram from silver_rates order by effective_date desc, effective_time desc limit 1')).rows[0];
  return Number(rate?.rate_per_gram || 92.8);
}

// Single canonical price formula (ERP owns pricing):
// metal value = net weight × silver rate; + making + stone + other charges;
// then GST is added so the Shopify price is the customer-facing, tax-inclusive price.
function computeShopifyPrice(product: { net_weight?: number; making_charge?: number; stone_charge?: number; other_charge?: number; gst_rate?: number }, silverRate: number): number {
  const subtotal = Number(product.net_weight) * silverRate + Number(product.making_charge || 0) + Number(product.stone_charge || 0) + Number(product.other_charge || 0);
  const price = subtotal + subtotal * (Number(product.gst_rate || 0) / 100);
  return Math.round((price + Number.EPSILON) * 100) / 100;
}

function buildProductSetInput(product: Record<string, any>, price: number, variantId: string | null) {
  const sku = String(product.sku ?? '').trim();
  const variant: Record<string, unknown> = {
    ...(variantId ? { id: variantId } : {}),
    optionValues: [{ optionName: 'Title', name: 'Default Title' }],
    sku,
    price: price.toFixed(2),
    ...(product.barcode ? { barcode: String(product.barcode) } : {}),
  };
  const input: Record<string, unknown> = {
    title: product.name,
    status: product.status === 'Active' ? 'ACTIVE' : 'DRAFT',
    productType: product.category || 'Silver',
    tags: product.collection ? [String(product.collection)] : [],
    productOptions: [{ name: 'Title', values: [{ name: 'Default Title' }] }],
    variants: [variant],
  };
  const grams = Number(product.net_weight || 0);
  const descriptionHtml = [
    product.category ? `Category: ${product.category}` : null,
    product.purity ? `Purity: ${product.purity}` : null,
    product.collection ? `Collection: ${product.collection}` : null,
    grams > 0 ? `Net Weight: ${grams}g` : null,
  ].filter(Boolean).join('<br/>');
  if (descriptionHtml) input.descriptionHtml = descriptionHtml;
  return input;
}

async function insertLog(input: LogInput) {
  if (!pool) return;
  await pool.query(
    `insert into sync_logs (sync_type, entity_id, entity_name, shopify_id, status, error_message, attempts, synced_at, direction, operation, shopify_product_id, shopify_variant_id, shopify_inventory_item_id)
     values ($1,$2,$3,$4,$5,$6,$7,now(),$8,$9,$10,$11,$12)`,
    [
      input.type,
      input.entityId ?? null,
      input.name,
      input.shopifyId ?? null,
      input.status,
      input.error ?? null,
      input.attempts ?? (input.status === 'Failed' ? 1 : 0),
      input.direction ?? null,
      input.operation ?? null,
      input.shopifyProductId ?? null,
      input.shopifyVariantId ?? null,
      input.shopifyInventoryItemId ?? null,
    ],
  );
}

async function insertFlag(input: { productId?: string | null; productSku?: string | null; direction: string; category: string; severity?: string; shopifyValue?: string | null; ourValue?: string | null; remarks?: string }) {
  if (!pool) return;
  await pool.query(
    `insert into shopify_sync_flags (product_id, product_sku, direction, category, severity, shopify_value, our_value, remarks)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [input.productId ?? null, input.productSku ?? null, input.direction, input.category, input.severity ?? 'Warning', input.shopifyValue ?? null, input.ourValue ?? null, input.remarks ?? null],
  );
}

function shopifyConfig(): ShopifyConfig | null {
  if (!env.SHOPIFY_STORE_DOMAIN || !env.SHOPIFY_ADMIN_ACCESS_TOKEN) return null;
  return {
    storeDomain: env.SHOPIFY_STORE_DOMAIN,
    accessToken: env.SHOPIFY_ADMIN_ACCESS_TOKEN,
    apiVersion: env.SHOPIFY_API_VERSION,
    ...(env.SHOPIFY_LOCATION_ID ? { locationId: env.SHOPIFY_LOCATION_ID } : {}),
  };
}

function clientOrThrow() {
  const config = shopifyConfig();
  if (!config) throw new ShopifyApiError('Shopify is not configured. Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN.');
  return createShopifyClient(config);
}

async function resolveShopifyLocation(client: ReturnType<typeof createShopifyClient>) {
  if (env.SHOPIFY_LOCATION_ID) return env.SHOPIFY_LOCATION_ID;
  const data = await client.query<{ locations: { edges: { node: { id: string; name: string } }[] } }>(locationsQuery);
  return data.locations.edges[0]?.node.id ?? null;
}

protectedRouter.get('/api/shopify/status', authenticate, requirePermission('sync.shopify.view'), async (_req, res) => {
  const config = shopifyConfig();
  if (!config) return res.json({ success: true, data: { configured: false, connected: false, message: 'Shopify credentials are not configured' } });
  try {
    const data = await createShopifyClient(config).query<{ shop: { name: string; myshopifyDomain: string } }>(shopQuery);
    return res.json({ success: true, data: { configured: true, connected: true, storeName: data.shop.name, storeDomain: data.shop.myshopifyDomain, apiVersion: config.apiVersion } });
  } catch (error) {
    return res.json({ success: true, data: { configured: true, connected: false, message: error instanceof Error ? error.message : 'Shopify connection failed' } });
  }
});

protectedRouter.post('/api/shopify/sync/:scope', authenticate, requirePermission('sync.shopify.execute'), async (req: AuthenticatedRequest, res, next) => {
  const rawScope = req.params.scope;
  const scope = typeof rawScope === 'string' ? rawScope.toLowerCase() : '';
  if (!scopeSchema.has(scope)) return res.status(400).json({ success: false, message: 'Invalid sync scope' });
  try {
    const client = clientOrThrow();
    const productSkus = Array.isArray(req.body?.productSkus) ? req.body.productSkus.filter((sku: unknown): sku is string => typeof sku === 'string') : undefined;
    const result = scope === 'products' ? await syncProducts(client, productSkus) : scope === 'inventory' ? await syncInventory(client) : scope === 'orders' ? await syncOrders(client) : scope === 'customers' ? await syncCustomers(client) : await syncEverything(client);
    return res.json({ success: true, data: result });
  } catch (error) { return next(error); }
});

protectedRouter.post('/api/shopify/sync/product/:id', authenticate, requirePermission('sync.shopify.execute'), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: 'DATABASE_URL is not configured' });
  try {
    const product = (await pool.query('select * from products where id = $1', [req.params.id])).rows[0];
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    if (Number(product.net_weight) <= 0) return res.status(400).json({ success: false, message: `Cannot sync ${product.name}: Net Weight must be greater than 0` });
    return res.json({ success: true, data: await pushLocalProduct(clientOrThrow(), product) });
  } catch (error) { return next(error); }
});

protectedRouter.get('/api/shopify/reconcile', authenticate, requirePermission('sync.shopify.view'), async (_req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: 'DATABASE_URL is not configured' });
  try {
    return res.json({ success: true, data: await reconcileProducts(clientOrThrow()) });
  } catch (error) { return next(error); }
});

protectedRouter.get('/api/shopify/logs', authenticate, requirePermission('sync.shopify.view'), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: 'DATABASE_URL is not configured' });
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const type = typeof req.query.type === 'string' ? req.query.type : '';
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const params: unknown[] = [limit];
    let where = '';
    if (type) { where += ` and sync_type = $${params.length + 1}`; params.push(type); }
    if (status) { where += ` and status = $${params.length + 1}`; params.push(status); }
    const { rows } = await pool.query(`select * from sync_logs where 1=1 ${where} order by created_at desc limit $1`, params);
    return res.json({ success: true, data: rows });
  } catch (error) { return next(error); }
});

protectedRouter.get('/api/shopify/flags', authenticate, requirePermission('sync.shopify.view'), async (_req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: 'DATABASE_URL is not configured' });
  try {
    const { rows } = await pool.query('select * from shopify_sync_flags order by created_at desc limit 200');
    return res.json({ success: true, data: rows });
  } catch (error) { return next(error); }
});

protectedRouter.post('/api/shopify/flags/:id/resolve', authenticate, requirePermission('sync.shopify.execute'), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: 'DATABASE_URL is not configured' });
  try {
    await pool.query("update shopify_sync_flags set status = 'Resolved', resolved_at = now() where id = $1", [req.params.id]);
    return res.json({ success: true });
  } catch (error) { return next(error); }
});

async function pushLocalProduct(client: ReturnType<typeof createShopifyClient>, product: Record<string, any>, context: { skuMap?: Map<string, SkuMatch>; silverRate?: number } = {}) {
  if (!pool) throw new ShopifyApiError('DATABASE_URL is not configured');
  const sku = String(product.sku ?? '').trim();
  if (!sku) throw new ShopifyApiError(`Cannot sync ${product.name}: SKU is required`);
  if (Number(product.net_weight || 0) <= 0) throw new ShopifyApiError(`Cannot sync ${product.name}: Net Weight must be greater than 0`);
  const silverRate = context.silverRate ?? (await getSilverRate());
  const price = computeShopifyPrice(product, silverRate);
  if (price <= 0) throw new ShopifyApiError(`Cannot sync ${product.name}: calculated price must be greater than 0`);
  const skuMap = context.skuMap ?? buildSkuMap(await fetchAllShopifyProducts(client));
  const existing = skuMap.get(sku.toLowerCase());

  let productId = (product.shopify_product_id as string | null) || existing?.productId || null;
  let variantId = (product.shopify_variant_id as string | null) || existing?.variantId || null;
  let inventoryItemId = (product.shopify_inventory_item_id as string | null) || existing?.inventoryItemId || null;

  const locationId = await resolveShopifyLocation(client);
  const targetStatus = product.status === 'Active' ? 'ACTIVE' : 'DRAFT';
  const targetQty = Math.max(Number(product.stock_qty || 0), 0);

  // No-op fast path: the Shopify side already matches the ERP state. Persist any
  // missing mapping IDs so persistent sync works, without writing to Shopify.
  if (
    existing &&
    Math.abs(existing.price - price) <= 0.01 &&
    existing.productTitle === String(product.name) &&
    existing.status === targetStatus &&
    (existing.inventoryQuantity ?? null) === targetQty &&
    productId &&
    variantId
  ) {
    await pool.query(
      `update products set shopify_product_id = $1, shopify_variant_id = $2, shopify_inventory_item_id = $3,
         shopify_location_id = coalesce(shopify_location_id, $4), shopify_sync_status = 'Synced', shopify_last_sync = now()
       where id = $5`,
      [existing.productId, existing.variantId, existing.inventoryItemId, locationId, product.id],
    );
    return { productId: existing.productId, variantId: existing.variantId, inventoryItemId: existing.inventoryItemId, locationId, price, sku, priceChanged: false, inventoryChanged: false };
  }

  if (productId && !variantId) {
    const inventory = await client.query<{ product: { variants: { edges: { node: { id: string } }[] } } | null }>(productInventoryQuery, { id: productId });
    variantId = inventory.product?.variants.edges[0]?.node.id ?? null;
  }
  if (productId && !variantId) throw new ShopifyApiError(`Cannot sync ${product.name}: Shopify product has no variant`);

  const applySet = async (id: string | null) => {
    const input = { ...buildProductSetInput(product, price, id ? variantId : null), ...(id ? { id } : {}) };
    const result = await client.query<ShopifyProductSetResponse>(productSetMutation, { input, key: `opalline:${product.id}:${id ?? 'new'}:${price.toFixed(2)}` });
    const errors = result.productSet.userErrors;
    if (errors.length) throw new ShopifyApiError(errors.map((error) => error.message).join('; '));
    if (!result.productSet.product) throw new ShopifyApiError('Shopify productSet returned no product');
    return result.productSet.product;
  };

  let createdProduct: Awaited<ReturnType<typeof applySet>>;
  try {
    createdProduct = productId ? await applySet(productId) : await applySet(null);
  } catch (error) {
    if (!(error instanceof ShopifyApiError) || !/Product does not exist|Variant does not exist/i.test(error.message)) throw error;
    // Stored Shopify reference is stale. Relink by SKU when possible, otherwise recreate.
    if (existing) {
      productId = existing.productId;
      variantId = existing.variantId;
      inventoryItemId = existing.inventoryItemId;
      createdProduct = await applySet(productId);
    } else {
      productId = null;
      variantId = null;
      createdProduct = await applySet(null);
    }
  }

  productId = createdProduct.id;
  const firstVariant = createdProduct.variants.edges[0]?.node;
  variantId = firstVariant?.id ?? variantId;
  inventoryItemId = firstVariant?.inventoryItem?.id ?? inventoryItemId;

  await pool.query(
    `update products set shopify_product_id = $1, shopify_variant_id = $2, shopify_inventory_item_id = $3,
       shopify_location_id = coalesce(shopify_location_id, $4), shopify_sync_status = 'Synced', shopify_last_sync = now()
     where id = $5`,
    [productId, variantId, inventoryItemId, locationId, product.id],
  );

  // Option A: ERP owns inventory. Only push stock to Shopify when it differs,
  // so our own ledger writes don't churn the store, but external drift is corrected.
  let inventoryChanged = false;
  const previousQty = existing?.inventoryQuantity ?? null;
  if (inventoryItemId && locationId) {
    const desired = Math.max(Number(product.stock_qty || 0), 0);
    if (previousQty === null || previousQty !== desired) {
      const invResult = await client.query<{ inventorySetQuantities: { userErrors: { field: string[] | null; message: string }[] } }>(inventoryQuantityMutation, { input: { name: 'available', reason: 'correction', quantities: [{ inventoryItemId, locationId, quantity: desired, changeFromQuantity: previousQty && previousQty > 0 ? previousQty : null }] }, key: `opalline:inv:${inventoryItemId}:${desired}` });
      const invErrors = invResult.inventorySetQuantities.userErrors;
      if (invErrors.length) {
        await insertLog({ type: 'Inventory', name: sku, status: 'Failed', error: invErrors.map((error) => error.message).join('; '), direction: 'export', operation: 'inventory_set', entityId: product.id, shopifyInventoryItemId: inventoryItemId });
      } else {
        inventoryChanged = true;
      }
    }
  }

  if (inventoryItemId) {
    try {
      const skuResult = await client.query<{ inventoryItemUpdate: { userErrors: { field: string[] | null; message: string }[] } }>(inventoryItemSkuMutation, { id: inventoryItemId, input: { sku }, key: `opalline:sku:${inventoryItemId}:${sku}` });
      const skuErrors = skuResult.inventoryItemUpdate.userErrors;
      if (skuErrors.length) await insertLog({ type: 'Product', name: product.name, status: 'Failed', error: skuErrors.map((error) => error.message).join('; '), direction: 'export', operation: 'inventory_item_sku', entityId: product.id, shopifyInventoryItemId: inventoryItemId });
    } catch (error) {
      await insertLog({ type: 'Product', name: product.name, status: 'Failed', error: error instanceof Error ? error.message : 'SKU update failed', direction: 'export', operation: 'inventory_item_sku', entityId: product.id, shopifyInventoryItemId: inventoryItemId });
    }
  }

  await insertLog({ type: 'Product', name: product.name, status: 'Synced', direction: 'export', operation: 'product_set', entityId: product.id, shopifyProductId: productId, shopifyVariantId: variantId, shopifyInventoryItemId: inventoryItemId });
  const previousPrice = existing?.price ?? 0;
  const priceChanged = Math.abs(previousPrice - price) > 0.001;
  return { productId, variantId, inventoryItemId, locationId, price, sku, priceChanged, inventoryChanged };
}

export async function syncProducts(client: ReturnType<typeof createShopifyClient>, productSkus?: string[]) {
  if (!pool) throw new ShopifyApiError('DATABASE_URL is not configured');
  const silverRate = await getSilverRate();
  const shopifyProducts = await fetchAllShopifyProducts(client);
  const skuMap = buildSkuMap(shopifyProducts);
  let imported = 0;
  let updated = 0;

  // Discovery/import pass (Shopify -> ERP). Product metadata is copied only for
  // newly discovered records. Existing ERP records are linked by IDs but their
  // authoritative fields (name, price, stock) are NOT overwritten.
  for (const shopifyProduct of shopifyProducts) {
    const status = shopifyProduct.status === 'ACTIVE' ? 'Active' : shopifyProduct.status === 'ARCHIVED' ? 'Inactive' : 'Draft';
    for (const variantEdge of shopifyProduct.variants.edges) {
      const variant = variantEdge.node;
      if (!variant.sku?.trim()) continue;
      const sku = variant.sku.trim();
      const linked = await pool.query(
        `select id, sku from products where shopify_product_id = $1 or shopify_variant_id = $2
         order by case when sku like 'SHOPIFY-%' then 1 else 0 end, created_at`,
        [shopifyProduct.id, variant.id],
      );
      if (linked.rows.length) {
        const canonical = linked.rows[0];
        await pool.query(
          `update products set shopify_product_id = $1, shopify_variant_id = $2,
             shopify_inventory_item_id = coalesce(shopify_inventory_item_id, $3),
             shopify_sync_status = 'Synced', shopify_last_sync = now()
           where id = $4`,
          [shopifyProduct.id, variant.id, variant.inventoryItem?.id ?? null, canonical.id],
        );
        for (const duplicate of linked.rows.slice(1)) {
          await pool.query("update products set status = 'Inactive', shopify_sync_status = 'Synced', shopify_last_sync = now() where id = $1", [duplicate.id]);
        }
        updated += 1;
        continue;
      }
      const bySku = await pool.query('select id from products where lower(sku) = lower($1) limit 1', [sku]);
      if (bySku.rows[0]) {
        await pool.query(
          `update products set shopify_product_id = $1, shopify_variant_id = $2,
             shopify_inventory_item_id = coalesce(shopify_inventory_item_id, $3),
             shopify_sync_status = 'Synced', shopify_last_sync = now()
           where id = $4`,
          [shopifyProduct.id, variant.id, variant.inventoryItem?.id ?? null, bySku.rows[0].id],
        );
        updated += 1;
        continue;
      }
      const result = await pool.query(
        `insert into products (sku, name, category, status, stock_qty, shopify_product_id, shopify_variant_id, shopify_inventory_item_id, shopify_sync_status, shopify_last_sync)
         values ($1, $2, 'Silver', $3, 0, $4, $5, $6, 'Synced', now())
         on conflict (sku) do update set shopify_product_id = coalesce(products.shopify_product_id, excluded.shopify_product_id),
           shopify_variant_id = coalesce(products.shopify_variant_id, excluded.shopify_variant_id),
           shopify_inventory_item_id = coalesce(products.shopify_inventory_item_id, excluded.shopify_inventory_item_id),
           shopify_sync_status = 'Synced', shopify_last_sync = now()
         returning (xmax = 0) as inserted`,
        [sku, shopifyProduct.title, status, shopifyProduct.id, variant.id, variant.inventoryItem?.id ?? null],
      );
      if (result.rows[0]?.inserted) imported += 1;
      else updated += 1;
    }
  }

  // Price/inventory push pass (ERP -> Shopify).
  const local = await pool.query('select * from products where status = $1', ['Active']);
  const localProducts = productSkus?.length ? local.rows.filter((row) => productSkus.includes(row.sku)) : local.rows;
  let pushed = 0;
  let priceUpdated = 0;
  let inventoryUpdated = 0;
  const failures: { name: string; message: string }[] = [];
  for (const product of localProducts) {
    try {
      const outcome = await pushLocalProduct(client, product, { skuMap, silverRate });
      pushed += 1;
      if (outcome.priceChanged) priceUpdated += 1;
      if (outcome.inventoryChanged) inventoryUpdated += 1;
    } catch (error) {
      failures.push({ name: product.name, message: error instanceof Error ? error.message : 'Product sync failed' });
      await pool.query("update products set shopify_sync_status = 'Failed', shopify_last_sync = now() where id = $1", [product.id]);
      await insertLog({ type: 'Product', name: product.name, status: 'Failed', error: error instanceof Error ? error.message : 'Product sync failed', direction: 'export', operation: 'product_set', entityId: product.id });
    }
  }
  await insertLog({ type: 'Product', name: 'Product reconciliation', status: 'Synced', direction: 'export', operation: 'reconcile_products' });
  return { source: 'Shopify', shopifyRecords: shopifyProducts.length, imported, updated, matched: skuMap.size, pushed, priceUpdated, inventoryUpdated, failures, localRecords: localProducts.length };
}

async function syncInventory(client: ReturnType<typeof createShopifyClient>) {
  if (!pool) throw new ShopifyApiError('DATABASE_URL is not configured');
  const shopifyProducts = await fetchAllShopifyProducts(client);
  const skuMap = buildSkuMap(shopifyProducts);
  const locationData = await client.query<{ locations: { edges: { node: { id: string; name: string } }[] } }>(locationsQuery);
  const locations = locationData.locations.edges.map((edge) => edge.node);
  const selectedLocation = env.SHOPIFY_LOCATION_ID
    ? locations.find((location) => location.id === env.SHOPIFY_LOCATION_ID)
    : locations[0];
  const local = await pool.query('select id, sku, name, stock_qty from products where status = $1', ['Active']);
  const records: { sku: string; name: string; ourStock: number; shopifyStock: number | null; difference: number | null }[] = [];
  let corrected = 0;
  let mismatches = 0;
  if (selectedLocation) {
    for (const product of local.rows) {
      const match = skuMap.get(String(product.sku).toLowerCase());
      if (!match) {
        records.push({ sku: product.sku, name: product.name, ourStock: Number(product.stock_qty), shopifyStock: null, difference: null });
        continue;
      }
      const shopifyStock = match.inventoryQuantity ?? null;
      const ourStock = Number(product.stock_qty);
      records.push({ sku: product.sku, name: product.name, ourStock, shopifyStock, difference: shopifyStock === null ? null : ourStock - shopifyStock });
      if (shopifyStock === null || shopifyStock === ourStock || !match.inventoryItemId) continue;
      const result = await client.query<{ inventorySetQuantities: { userErrors: { field: string[] | null; message: string }[] } }>(inventoryQuantityMutation, { input: { name: 'available', reason: 'correction', quantities: [{ inventoryItemId: match.inventoryItemId, locationId: selectedLocation.id, quantity: ourStock, changeFromQuantity: shopifyStock && shopifyStock > 0 ? shopifyStock : null }] }, key: `opalline:inv:${match.inventoryItemId}:${ourStock}` });
      const errors = result.inventorySetQuantities.userErrors;
      if (errors.length) {
        mismatches += 1;
        await insertLog({ type: 'Inventory', name: product.sku, status: 'Failed', error: errors.map((error) => error.message).join('; '), direction: 'export', operation: 'inventory_set', entityId: product.id, shopifyInventoryItemId: match.inventoryItemId });
      } else {
        corrected += 1;
        await insertFlag({ productId: product.id, productSku: product.sku, direction: 'import', category: 'inventory_mismatch', severity: 'Info', shopifyValue: String(shopifyStock), ourValue: String(ourStock), remarks: 'Shopify stock differed from ERP and was corrected to the ERP value.' });
      }
    }
  }
  await insertLog({ type: 'Inventory', name: 'Inventory reconciliation', status: 'Synced', direction: 'export', operation: 'reconcile_inventory' });
  return { source: 'Shopify', selectedLocation: selectedLocation ?? null, locations, shopifyRecords: shopifyProducts.length, corrected, mismatches, mismatchCount: mismatches, records: records.slice(0, 200) };
}

async function syncCustomers(client: ReturnType<typeof createShopifyClient>) {
  if (!pool) throw new ShopifyApiError('DATABASE_URL is not configured');
  const customers = await fetchAllPages<ShopifyCustomer>((cursor) =>
    client.query<ShopifyCustomerResponse>(customerQuery, cursor ? { cursor } : undefined).then((data) => ({ pageInfo: data.customers.pageInfo, edges: data.customers.edges })),
  );
  let linked = 0;
  for (const customer of customers) {
    const name = customer.displayName || [customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'Shopify Customer';
    await pool.query(`insert into shopify_customers (shopify_customer_id, name, mobile, email, total_orders, total_spent, synced_at) values ($1,$2,$3,$4,$5,$6,now()) on conflict (shopify_customer_id) do update set name = excluded.name, mobile = excluded.mobile, email = excluded.email, total_orders = excluded.total_orders, total_spent = excluded.total_spent, synced_at = now()`, [customer.id, name, customer.phone, customer.email, Number(customer.numberOfOrders), Number(customer.amountSpent.amount)]);
    await pool.query('update customers set shopify_status = $1, last_shopify_sync_at = now() where shopify_customer_id = $2', ['Active', customer.id]);
    const match = await pool.query('select id from customers where ($1 <> \'\' and lower(email) = lower($1)) or ($2 <> \'\' and mobile = $2) limit 1', [customer.email ?? '', customer.phone ?? '']);
    if (match.rows[0]) { await pool.query('update customers set shopify_customer_id = $1, shopify_status = $2, last_shopify_sync_at = now() where id = $3 and shopify_customer_id is null', [customer.id, 'Active', match.rows[0].id]); linked += 1; }
  }
  await insertLog({ type: 'Customer', name: 'Customer reconciliation', status: 'Synced', direction: 'import', operation: 'reconcile_customers' });
  return { source: 'Shopify', shopifyRecords: customers.length, linked };
}

async function syncOrders(client: ReturnType<typeof createShopifyClient>) {
  if (!pool) throw new ShopifyApiError('DATABASE_URL is not configured');
  const orders = await fetchAllPages<ShopifyOrder>((cursor) =>
    client.query<ShopifyOrderResponse>(orderQuery, cursor ? { cursor } : undefined).then((data) => ({ pageInfo: data.orders.pageInfo, edges: data.orders.edges })),
  );
  for (const order of orders) {
    await pool.query(`insert into shopify_orders (shopify_order_id, order_number, customer_name, customer_email, order_date, amount, currency, payment_status, fulfillment_status, sync_status, synced_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Imported',now()) on conflict (shopify_order_id) do update set customer_name = excluded.customer_name, customer_email = excluded.customer_email, amount = excluded.amount, payment_status = excluded.payment_status, fulfillment_status = excluded.fulfillment_status, sync_status = excluded.sync_status, synced_at = now()`, [order.id, order.name, order.customer?.displayName ?? 'Shopify Customer', order.customer?.email ?? null, order.createdAt, Number(order.totalPriceSet.shopMoney.amount), order.totalPriceSet.shopMoney.currencyCode, order.displayFinancialStatus, order.displayFulfillmentStatus]);
  }
  await insertLog({ type: 'Order', name: 'Order import', status: 'Synced', direction: 'import', operation: 'import_orders' });
  return { source: 'Shopify', imported: orders.length };
}

async function reconcileProducts(client: ReturnType<typeof createShopifyClient>) {
  if (!pool) throw new ShopifyApiError('DATABASE_URL is not configured');
  const silverRate = await getSilverRate();
  const shopifyProducts = await fetchAllShopifyProducts(client);
  const skuMap = buildSkuMap(shopifyProducts);
  const local = (await pool.query('select id, sku, name, net_weight, making_charge, stone_charge, other_charge, gst_rate, stock_qty, status from products')).rows;
  const localWithSku = local.filter((row) => String(row.sku ?? '').trim());

  const matched: { sku: string; name: string; ourPrice: number; shopifyPrice: number; priceDiff: number }[] = [];
  const missingInShopify: { sku: string; name: string; ourPrice: number; stock: number }[] = [];
  const missingInBilling: { sku: string; title: string; price: number; inventoryQuantity: number | null }[] = [];
  const priceMismatch: { sku: string; name: string; ourPrice: number; shopifyPrice: number; diff: number }[] = [];
  const inventoryMismatch: { sku: string; name: string; ourStock: number; shopifyStock: number | null; difference: number | null }[] = [];

  const localBySku = new Map<string, { sku: string; name: string; net_weight: number; making_charge: number; stone_charge: number; other_charge: number; gst_rate: number; stock_qty: number; status: string }>();
  for (const row of localWithSku) localBySku.set(String(row.sku).toLowerCase(), row);

  for (const [, match] of skuMap) {
    const row = localBySku.get(match.sku.toLowerCase());
    if (!row) {
      missingInBilling.push({ sku: match.sku, title: match.productTitle, price: match.price, inventoryQuantity: match.inventoryQuantity });
      continue;
    }
    const ourPrice = computeShopifyPrice(row, silverRate);
    const priceDiff = Math.round((Math.abs(ourPrice - match.price) + Number.EPSILON) * 100) / 100;
    matched.push({ sku: row.sku, name: row.name, ourPrice, shopifyPrice: match.price, priceDiff });
    if (priceDiff > 0.01) priceMismatch.push({ sku: row.sku, name: row.name, ourPrice, shopifyPrice: match.price, diff: Math.round((ourPrice - match.price) * 100) / 100 });
    const ourStock = Number(row.stock_qty);
    const shopifyStock = match.inventoryQuantity;
    if (shopifyStock !== null && ourStock !== shopifyStock) inventoryMismatch.push({ sku: row.sku, name: row.name, ourStock, shopifyStock, difference: ourStock - shopifyStock });
  }

  for (const row of localWithSku) {
    if (row.status === 'Active' && !skuMap.has(String(row.sku).toLowerCase())) {
      missingInShopify.push({ sku: row.sku, name: row.name, ourPrice: computeShopifyPrice(row, silverRate), stock: Number(row.stock_qty) });
    }
  }

  return {
    ranAt: new Date().toISOString(),
    silverRate,
    summary: {
      localProducts: local.length,
      shopifyVariants: skuMap.size,
      matched: matched.length,
      missingInShopify: missingInShopify.length,
      missingInBilling: missingInBilling.length,
      priceMismatch: priceMismatch.length,
      inventoryMismatch: inventoryMismatch.length,
    },
    details: {
      matched: matched.slice(0, 200),
      missingInShopify: missingInShopify.slice(0, 200),
      missingInBilling: missingInBilling.slice(0, 200),
      priceMismatch: priceMismatch.slice(0, 200),
      inventoryMismatch: inventoryMismatch.slice(0, 200),
    },
  };
}

async function syncEverything(client: ReturnType<typeof createShopifyClient>) {
  return { products: await syncProducts(client), inventory: await syncInventory(client), customers: await syncCustomers(client), orders: await syncOrders(client) };
}

function verifyWebhook(req: Request) {
  const secret = env.SHOPIFY_WEBHOOK_SECRET;
  const hmac = req.header('x-shopify-hmac-sha256');
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!secret || !hmac || !rawBody) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('base64');
  const actual = Buffer.from(hmac, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

async function handleCustomerWebhook(payload: Record<string, any>) {
  if (!pool || !payload.admin_graphql_api_id) return;
  const customer = payload;
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ') || 'Shopify Customer';
  await pool.query(`insert into shopify_customers (shopify_customer_id, name, mobile, email, synced_at) values ($1,$2,$3,$4,now()) on conflict (shopify_customer_id) do update set name = excluded.name, mobile = excluded.mobile, email = excluded.email, synced_at = now()`, [customer.admin_graphql_api_id, name, customer.phone ?? null, customer.email ?? null]);
  const shopifyStatus = customer.deleted_at || customer.archived ? 'Inactive' : 'Active';
  await pool.query('update customers set shopify_status = $1, last_shopify_sync_at = now() where shopify_customer_id = $2', [shopifyStatus, customer.admin_graphql_api_id]);
}

async function handleProductWebhook(topic: string, payload: Record<string, any>) {
  if (!pool) return;
  const productId = payload.admin_graphql_api_id ?? (payload.id ? `gid://shopify/Product/${payload.id}` : null);
  const variants: Record<string, any>[] = Array.isArray(payload.variants) ? payload.variants : [];
  const sku = String(variants[0]?.sku ?? '').trim() || null;
  const title = String(payload.title ?? 'Shopify product');

  if (topic.endsWith('/delete')) {
    const match = sku
      ? await pool.query('select id from products where lower(sku) = lower($1) limit 1', [sku])
      : await pool.query('select id from products where shopify_product_id = $1 limit 1', [productId]);
    if (match.rows[0]) {
      await pool.query("update products set shopify_sync_status = 'Not Synced' where id = $1", [match.rows[0].id]);
      await insertFlag({ productId: match.rows[0].id, productSku: sku, direction: 'import', category: 'product_deleted', severity: 'Warning', shopifyValue: productId, remarks: `Product deleted in Shopify (${title}).` });
    }
    await insertLog({ type: 'Product', name: sku ?? title, status: 'Flagged', error: 'Product deleted in Shopify', direction: 'import', operation: 'product_deleted', shopifyProductId: productId });
    return;
  }

  const shopifyPrice = Number(variants[0]?.price || 0);
  const match = sku
    ? await pool.query('select id, name from products where lower(sku) = lower($1) limit 1', [sku])
    : await pool.query('select id, name from products where shopify_product_id = $1 limit 1', [productId]);
  if (match.rows[0]) {
    const product = (await pool.query('select id, name, sku, net_weight, making_charge, stone_charge, other_charge, gst_rate from products where id = $1', [match.rows[0].id])).rows[0];
    const silverRate = await getSilverRate();
    const ourPrice = computeShopifyPrice(product, silverRate);
    const externalChange = Math.abs(ourPrice - shopifyPrice) > 0.01 || (product.name && title !== product.name);
    if (externalChange) {
      await insertFlag({ productId: product.id, productSku: product.sku, direction: 'import', category: 'external_edit', severity: 'Warning', shopifyValue: `price=${shopifyPrice}`, ourValue: `price=${ourPrice}`, remarks: `External edit detected in Shopify for ${title}. ERP is authoritative and will restore values on the next sync.` });
      await insertLog({ type: 'Product', name: product.name, status: 'Flagged', error: 'External product edit detected', direction: 'import', operation: 'external_edit', entityId: product.id, shopifyProductId: productId });
    } else {
      await insertLog({ type: 'Product', name: product.name, status: 'Synced', direction: 'import', operation: 'webhook_product', entityId: product.id, shopifyProductId: productId });
    }
  } else {
    await insertLog({ type: 'Product', name: sku ?? title, status: 'Flagged', error: 'Shopify product not found in ERP — review and link', direction: 'import', operation: 'unlinked_product', shopifyProductId: productId });
  }
}

async function handleInventoryWebhook(payload: Record<string, any>) {
  if (!pool) return;
  const inventoryItemId = payload.admin_graphql_api_id ?? (payload.inventory_item_id ? `gid://shopify/InventoryItem/${payload.inventory_item_id}` : null);
  const locationId = payload.location_id ? `gid://shopify/Location/${payload.location_id}` : (payload.admin_graphql_api_location_id ?? null);
  const shopifyQty = Number(payload.available ?? payload.new_quantity ?? 0);
  if (!inventoryItemId) {
    await insertLog({ type: 'Inventory', name: 'unknown', status: 'Flagged', error: 'Inventory webhook without an inventory item id', direction: 'import', operation: 'inventory_unlinked' });
    return;
  }
  const match = await pool.query('select id, sku, name, stock_qty, shopify_location_id from products where shopify_inventory_item_id = $1 limit 1', [inventoryItemId]);
  if (!match.rows[0]) {
    await insertLog({ type: 'Inventory', name: inventoryItemId, status: 'Flagged', error: 'Inventory change for unlinked inventory item', direction: 'import', operation: 'inventory_unlinked', shopifyInventoryItemId: inventoryItemId });
    return;
  }
  const product = match.rows[0];
  const ourQty = Number(product.stock_qty);
  if (shopifyQty === ourQty) {
    await insertLog({ type: 'Inventory', name: product.sku, status: 'Synced', direction: 'import', operation: 'inventory_webhook', entityId: product.id, shopifyInventoryItemId: inventoryItemId });
    return;
  }
  // Option A: ERP is the source of truth for inventory. Restore the ERP value
  // and flag the external change instead of importing it.
  const location = locationId ?? product.shopify_location_id ?? env.SHOPIFY_LOCATION_ID ?? null;
  if (!location) {
    await insertFlag({ productId: product.id, productSku: product.sku, direction: 'import', category: 'inventory_mismatch', severity: 'Warning', shopifyValue: String(shopifyQty), ourValue: String(ourQty), remarks: 'External stock change detected; unable to restore without a location.' });
    await insertLog({ type: 'Inventory', name: product.sku, status: 'Flagged', error: 'External stock change detected; restore blocked (no location)', direction: 'import', operation: 'inventory_mismatch', entityId: product.id, shopifyInventoryItemId: inventoryItemId });
    return;
  }
  try {
    const result = await clientOrThrow().query<{ inventorySetQuantities: { userErrors: { field: string[] | null; message: string }[] } }>(inventoryQuantityMutation, { input: { name: 'available', reason: 'correction', quantities: [{ inventoryItemId, locationId: location, quantity: ourQty, changeFromQuantity: shopifyQty }] }, key: `opalline:inv:${inventoryItemId}:${ourQty}` });
    const errors = result.inventorySetQuantities.userErrors;
    if (errors.length) {
      await insertFlag({ productId: product.id, productSku: product.sku, direction: 'import', category: 'inventory_mismatch', severity: 'Warning', shopifyValue: String(shopifyQty), ourValue: String(ourQty), remarks: `External stock change detected but restore failed: ${errors.map((error) => error.message).join('; ')}` });
      await insertLog({ type: 'Inventory', name: product.sku, status: 'Flagged', error: errors.map((error) => error.message).join('; '), direction: 'import', operation: 'inventory_mismatch', entityId: product.id, shopifyInventoryItemId: inventoryItemId });
      return;
    }
    await insertFlag({ productId: product.id, productSku: product.sku, direction: 'import', category: 'inventory_mismatch', severity: 'Warning', shopifyValue: String(shopifyQty), ourValue: String(ourQty), remarks: 'External stock change detected and restored to the ERP value.' });
    await insertLog({ type: 'Inventory', name: product.sku, status: 'Flagged', error: 'External stock change detected and corrected to the ERP value', direction: 'import', operation: 'inventory_restored', entityId: product.id, shopifyInventoryItemId: inventoryItemId });
  } catch (error) {
    await insertLog({ type: 'Inventory', name: product.sku, status: 'Failed', error: error instanceof Error ? error.message : 'Inventory restore failed', direction: 'import', operation: 'inventory_restore_failed', entityId: product.id, shopifyInventoryItemId: inventoryItemId });
  }
}

async function handleOrderWebhook(payload: Record<string, any>) {
  if (!pool) return;
  const orderId = payload.admin_graphql_api_id ?? (payload.id ? `gid://shopify/Order/${payload.id}` : null);
  if (!orderId) return;
  const customer = payload.customer ?? null;
  await pool.query(`insert into shopify_orders (shopify_order_id, order_number, customer_name, customer_email, order_date, amount, currency, payment_status, fulfillment_status, sync_status, synced_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Imported',now()) on conflict (shopify_order_id) do update set customer_name = excluded.customer_name, customer_email = excluded.customer_email, amount = excluded.amount, payment_status = excluded.payment_status, fulfillment_status = excluded.fulfillment_status, sync_status = excluded.sync_status, synced_at = now()`, [orderId, String(payload.name ?? orderId), customer?.display_name ?? customer?.email ?? 'Shopify Customer', customer?.email ?? null, String(payload.created_at ?? new Date().toISOString()), Number(payload.total_price || 0), String(payload.currency ?? 'INR'), String(payload.financial_status ?? ''), String(payload.fulfillment_status ?? '')]);
  await insertLog({ type: 'Order', name: String(payload.name ?? orderId), status: 'Synced', direction: 'import', operation: 'webhook_order', shopifyId: orderId });
}

async function handleWebhook(req: Request, res: Response, next: (error?: unknown) => void) {
  if (!verifyWebhook(req)) return res.status(401).json({ success: false, message: 'Invalid Shopify webhook signature' });
  try {
    const resource = typeof req.params.resource === 'string' ? req.params.resource : '';
    const event = typeof req.params.event === 'string' ? req.params.event : '';
    const topicParam = typeof req.params.topic === 'string' ? req.params.topic : '';
    const topic = resource && event ? `${resource}/${event}` : topicParam;
    const payload = req.body as Record<string, any>;

    if (topic.startsWith('customers/')) {
      await handleCustomerWebhook(payload);
    } else if (topic.startsWith('products/')) {
      await handleProductWebhook(topic, payload);
    } else if (topic.startsWith('inventory_levels/')) {
      await handleInventoryWebhook(payload);
    } else if (topic.startsWith('orders/')) {
      await handleOrderWebhook(payload);
    } else {
      await insertLog({ type: 'Webhook', name: payload.name || payload.id || topic, status: 'Skipped', operation: 'unknown_topic' });
    }
    return res.status(200).json({ success: true });
  } catch (error) { return next(error); }
}

webhookRouter.post('/:resource/:event', handleWebhook);
webhookRouter.post('/:topic', handleWebhook);

export { protectedRouter as shopifyRouter, webhookRouter as shopifyWebhookRouter };
