import { Router, type Router as RouterType } from 'express';
import { pool } from '../db/pool.js';
import { authenticate } from '../middleware/authorization.js';

const router: RouterType = Router();

type NotificationCategory = 'critical' | 'warning' | 'info';

type NotificationItem = {
  key: string;
  category: NotificationCategory;
  title: string;
  message: string;
  count?: number;
  actionPath?: string;
  updatedAt: string;
};

// GET /api/notifications — actionable events aggregated live from operational
// tables. Deliberately NOT the activity log: only items that need awareness or
// action. Read/unread tracking is client-side per user.
router.get('/api/notifications', authenticate, async (_req, res, next) => {
  if (!pool) return res.status(503).json({ success: false, message: 'DATABASE_URL is not configured' });
  try {
    const [failedSync, openFlags, lowStock, outstanding, lastRateChange, ordersToday] = await Promise.all([
      pool.query(
        `select count(*)::int as failed,
                (select max(created_at) from sync_logs where status = 'Failed') as last_at
         from products where status = 'Active' and shopify_sync_status = 'Failed'`,
      ),
      pool.query(`select count(*)::int as open, max(created_at) as last_at from shopify_sync_flags where status = 'Open'`),
      pool.query(
        `select count(*)::int as total,
                array_agg(name order by stock_qty - min_stock_qty asc) filter (where true) as names,
                min(stock_qty)::float8 as lowest
         from products
         where status = 'Active' and stock_qty <= min_stock_qty`,
      ),
      pool.query(
        `select coalesce(sum(outstanding_balance), 0)::float8 as total,
                count(distinct customer_id)::int as customers,
                max(updated_at) as last_at
         from invoices where coalesce(outstanding_balance, 0) > 0 and status <> 'Cancelled'`,
      ),
      pool.query(
        `select previous_rate::float8 as previous_rate, new_rate::float8 as new_rate, created_at
         from silver_rate_history
         where created_at > now() - interval '7 days'
         order by created_at desc limit 1`,
      ),
      pool.query(
        `select count(*)::int as imported, max(created_at) as last_at
         from sync_logs
         where sync_type = 'Order' and created_at >= date_trunc('day', now())`,
      ),
    ]);

    const notifications: NotificationItem[] = [];
    const iso = (value: unknown) => (value ? new Date(value as string).toISOString() : new Date().toISOString());

    const failedProducts = Number(failedSync.rows[0]?.failed ?? 0);
    const flags = Number(openFlags.rows[0]?.open ?? 0);
    if (failedProducts > 0) {
      notifications.push({
        key: 'shopify-sync-failed',
        category: 'critical',
        title: 'Shopify Sync Failed',
        message: `${failedProducts} product${failedProducts === 1 ? '' : 's'} failed to sync`,
        count: failedProducts,
        actionPath: 'Shopify Sync',
        updatedAt: iso(failedSync.rows[0]?.last_at),
      });
    }
    if (flags > 0) {
      notifications.push({
        key: 'shopify-sync-flags',
        category: 'critical',
        title: 'Inventory Mismatch Flagged',
        message: `${flags} sync flag${flags === 1 ? '' : 's'} need review before publishing`,
        count: flags,
        actionPath: 'Shopify Sync',
        updatedAt: iso(openFlags.rows[0]?.last_at),
      });
    }

    const lowStockTotal = Number(lowStock.rows[0]?.total ?? 0);
    if (lowStockTotal > 0) {
      const names: string[] = (lowStock.rows[0]?.names ?? []).filter(Boolean);
      const example = names[0];
      notifications.push({
        key: 'low-stock',
        category: 'warning',
        title: 'Low Stock',
        message: example
          ? `${example} at ${Number(lowStock.rows[0].lowest)} pcs — ${lowStockTotal} item${lowStockTotal === 1 ? '' : 's'} at or below minimum`
          : `${lowStockTotal} item${lowStockTotal === 1 ? '' : 's'} at or below minimum stock`,
        count: lowStockTotal,
        actionPath: 'Low Stock Alert',
        updatedAt: new Date().toISOString(),
      });
    }

    const dueTotal = Number(outstanding.rows[0]?.total ?? 0);
    const dueCustomers = Number(outstanding.rows[0]?.customers ?? 0);
    if (dueTotal > 0) {
      notifications.push({
        key: 'payment-due',
        category: 'warning',
        title: 'Payment Due',
        message: `₹${Math.round(dueTotal).toLocaleString('en-IN')} outstanding from ${dueCustomers} customer${dueCustomers === 1 ? '' : 's'}`,
        count: dueCustomers,
        actionPath: 'Payments',
        updatedAt: iso(outstanding.rows[0]?.last_at),
      });
    }

    const rateRow = lastRateChange.rows[0];
    if (rateRow) {
      notifications.push({
        key: 'silver-rate-updated',
        category: 'info',
        title: 'Silver Rate Updated',
        message: `₹${Number(rateRow.previous_rate)} → ₹${Number(rateRow.new_rate)} / gram`,
        actionPath: 'Silver Rate',
        updatedAt: iso(rateRow.created_at),
      });
    }

    const importedToday = Number(ordersToday.rows[0]?.imported ?? 0);
    if (importedToday > 0) {
      notifications.push({
        key: 'orders-imported-today',
        category: 'info',
        title: 'Shopify Orders Imported',
        message: `${importedToday} order${importedToday === 1 ? '' : 's'} imported today`,
        count: importedToday,
        actionPath: 'Shopify Sync',
        updatedAt: iso(ordersToday.rows[0]?.last_at),
      });
    }

    res.json({ success: true, data: { notifications, generatedAt: new Date().toISOString() } });
  } catch (error) { next(error); }
});

export { router as notificationsRouter };
