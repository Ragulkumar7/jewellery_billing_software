import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { env } from '@repo/config/env';
import { createShopifyClient } from '@repo/shopify';
import { pool } from '../db/pool.js';
import { authenticate, requirePermission, type AuthenticatedRequest } from '../middleware/authorization.js';
import { syncProducts } from './shopify.js';

const router: RouterType = Router();
const rateSchema = z.object({
  ratePerGram: z.number().positive(),
  effectiveDate: z.string().date().optional(),
  effectiveTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  remarks: z.string().max(500).optional(),
});
const publishSchema = z.object({
  productIds: z.array(z.string().uuid()).optional(),
});

// GET /api/silver-rate — current rate + previous rate for deltas
router.get('/api/silver-rate', authenticate, requirePermission('silver_rate.view'), async (_req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: 'DATABASE_URL is not configured' });
  try {
    const { rows } = await pool.query('select rate_per_gram, effective_date, effective_time, created_at from silver_rates order by effective_date desc, effective_time desc, created_at desc limit 2');
    const current = rows[0];
    const previous = rows[1] || rows[0];
    const formatDate = (value: unknown) => {
      if (!value) return null;
      const d = value instanceof Date ? value : new Date(String(value));
      if (Number.isNaN(d.getTime())) return null;
      return d.toISOString().slice(0, 10);
    };
    const formatTime = (value: unknown) => {
      if (!value) return null;
      return String(value).slice(0, 5);
    };
    res.json({
      success: true,
      data: {
        currentRate: current ? Number(current.rate_per_gram) : 92.8,
        previousRate: previous ? Number(previous.rate_per_gram) : (current ? Number(current.rate_per_gram) : 92.8),
        effectiveDate: formatDate(current?.effective_date),
        effectiveTime: formatTime(current?.effective_time),
        updatedAt: current?.created_at ?? null,
      },
    });
  } catch (error) { next(error); }
});

// GET /api/silver-rate/history — audit trail of rate changes
router.get('/api/silver-rate/history', authenticate, requirePermission('silver_rate.view'), async (req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: 'DATABASE_URL is not configured' });
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const { rows } = await pool.query(
      'select h.*, coalesce(u.name, \'System\') updated_by_name from silver_rate_history h left join users u on u.id = h.updated_by order by h.effective_date desc, h.effective_time desc limit $1',
      [limit],
    );
    res.json({ success: true, data: rows });
  } catch (error) { next(error); }
});

// POST /api/silver-rate — transactional rate update + history + audit log
router.post('/api/silver-rate', authenticate, requirePermission('silver_rate.update'), async (req: AuthenticatedRequest, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: 'DATABASE_URL is not configured' });
  const parsed = rateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Invalid silver rate', issues: parsed.error.issues });
  const input = parsed.data;
  const client = await pool.connect();
  try {
    await client.query('begin');
    const previous = await client.query('select rate_per_gram from silver_rates order by effective_date desc, effective_time desc, created_at desc limit 1');
    const previousRate = Number(previous.rows[0]?.rate_per_gram || 0);
    const date = input.effectiveDate ?? new Date().toISOString().slice(0, 10);
    const time = input.effectiveTime ?? new Date().toTimeString().slice(0, 5);
    await client.query(
      'insert into silver_rates (purity, rate_per_gram, effective_date, effective_time, remarks, updated_by) values ($1,$2,$3,$4,$5,$6)',
      ['92.5', input.ratePerGram, date, time, input.remarks ?? null, req.auth?.userId ?? null],
    );
    await client.query(
      `insert into silver_rate_history (purity, previous_rate, new_rate, rate_change, effective_date, effective_time, remarks, updated_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      ['92.5', previousRate, input.ratePerGram, Math.round((input.ratePerGram - previousRate) * 100) / 100, date, time, input.remarks ?? null, req.auth?.userId ?? null],
    );
    await client.query(
      "insert into activity_logs (user_id, module, action, record_type, new_value, remarks) values ($1, 'Sync', 'Updated silver rate', 'Silver Rate', $2, $3)",
      [req.auth?.userId ?? null, JSON.stringify({ previousRate, newRate: input.ratePerGram }), `Silver rate changed from ₹${previousRate} to ₹${input.ratePerGram}`],
    );
    await client.query('commit');
    client.release();
    res.json({ success: true, data: { currentRate: input.ratePerGram, previousRate } });
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    client.release();
    return next(error);
  }
});

// Price formula shared with the frontend Price Impact preview in SilverRate.tsx:
//   metal value = net_weight × silver rate
//   subtotal = metal value + making + stone + other charges
//   price = subtotal + subtotal × (gst_rate / 100)
function computeProductPrice(product: { net_weight: number | string; making_charge: number | string; stone_charge: number | string; other_charge: number | string; gst_rate: number | string }, rate: number): number {
  const metalValue = Math.round((Number(product.net_weight) * rate + Number.EPSILON) * 100) / 100;
  const subtotal = metalValue + Number(product.making_charge) + Number(product.stone_charge) + Number(product.other_charge);
  const gst = Math.round((subtotal * (Number(product.gst_rate || 0) / 100) + Number.EPSILON) * 100) / 100;
  return Math.round((subtotal + gst + Number.EPSILON) * 100) / 100;
}

// POST /api/silver-rate/publish — bulk-recalculate and persist derived product
// prices for all affected products in a single transaction, audit-log the change,
// then optionally push the new prices to Shopify.
router.post('/api/silver-rate/publish', authenticate, requirePermission('silver_rate.publish'), async (req: AuthenticatedRequest, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: 'DATABASE_URL is not configured' });
  const parsed = publishSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: 'Invalid publish payload', issues: parsed.error.issues });
  let rate = 92.8;
  let affected = 0;
  const skus: string[] = [];
  const client = await pool.connect();
  try {
    await client.query('begin');
    const rateRow = await client.query('select rate_per_gram from silver_rates order by effective_date desc, effective_time desc, created_at desc limit 1');
    rate = Number(rateRow.rows[0]?.rate_per_gram || 92.8);
    const { rows } = parsed.data.productIds?.length
      ? await client.query('select id, sku, net_weight, making_charge, stone_charge, other_charge, gst_rate from products where id = any($1::uuid[]) and status = $2', [parsed.data.productIds, 'Active'])
      : await client.query('select id, sku, net_weight, making_charge, stone_charge, other_charge, gst_rate from products where status = $1', ['Active']);
    affected = rows.length;
    for (const product of rows) {
      const price = computeProductPrice(product, rate);
      skus.push(product.sku);
      await client.query(
        'insert into product_price_snapshots (product_id, price, silver_rate, net_weight, computed_at, recorded_by) values ($1,$2,$3,$4,now(),$5)',
        [product.id, price, rate, Number(product.net_weight), req.auth?.userId ?? null],
      );
    }
    await client.query(
      "insert into activity_logs (user_id, module, action, record_type, new_value, remarks) values ($1, 'Pricing', 'Recalculated product prices', 'Products', $2, $3)",
      [req.auth?.userId ?? null, JSON.stringify({ rate, affected }), `Recalculated prices for ${affected} products at ₹${rate}/g`],
    );
    await client.query('commit');
    client.release();
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    client.release();
    return next(error);
  }
  // Optional Shopify price publishing: network calls cannot run inside the DB
  // transaction, so this runs best-effort after the local persistence commits.
  if (env.SHOPIFY_STORE_DOMAIN && env.SHOPIFY_ADMIN_ACCESS_TOKEN) {
    try {
      const shopify = await syncProducts(createShopifyClient({ storeDomain: env.SHOPIFY_STORE_DOMAIN, accessToken: env.SHOPIFY_ADMIN_ACCESS_TOKEN, apiVersion: env.SHOPIFY_API_VERSION, ...(env.SHOPIFY_LOCATION_ID ? { locationId: env.SHOPIFY_LOCATION_ID } : {}) }), skus);
      return res.json({ success: true, data: { rate, affected, ...shopify } });
    } catch (error) {
      return res.json({ success: true, data: { rate, affected, shopifyError: error instanceof Error ? error.message : 'Shopify sync failed' } });
    }
  }
  res.json({ success: true, data: { rate, affected } });
});

export { router as silverRateRouter };
