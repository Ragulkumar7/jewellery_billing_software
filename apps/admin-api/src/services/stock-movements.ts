// Stock movement query layer over the PostgreSQL stock_movements table.
// The ERP's single inventory-history source. Queries are parameterized and
// always bounded so large histories are never pulled into the browser.

export type Queryable = {
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
};

export type StockMovementFilters = {
  productId?: string | null;
  movementType?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  limit?: number | null;
  offset?: number | null;
};

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 200;

export function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit)));
}

export function normalizeOffset(offset: number | undefined): number {
  if (offset === undefined || !Number.isFinite(offset)) return 0;
  return Math.max(0, Math.trunc(offset));
}

export async function listStockMovements(client: Queryable, filters: StockMovementFilters) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filters.productId) {
    params.push(filters.productId);
    conditions.push(`sm.product_id = $${params.length}`);
  }
  if (filters.movementType) {
    params.push(filters.movementType);
    conditions.push(`sm.movement_type = $${params.length}`);
  }
  if (filters.startDate) {
    params.push(filters.startDate);
    conditions.push(`sm.created_at::date >= $${params.length}`);
  }
  if (filters.endDate) {
    params.push(filters.endDate);
    conditions.push(`sm.created_at::date <= $${params.length}`);
  }

  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
  const limit = normalizeLimit(filters.limit);
  const offset = normalizeOffset(filters.offset);
  params.push(limit, offset);

  const { rows } = await client.query(
    `select sm.id, sm.product_id, sm.movement_type, sm.quantity_change, sm.resulting_qty,
       sm.reference, sm.reference_type, sm.notes, sm.created_by, sm.created_at::text as created_at
     from stock_movements sm join products p on p.id = sm.product_id
     ${where}
     order by sm.created_at desc limit $${params.length - 1} offset $${params.length}`,
    params,
  );

  return rows.map((r: any) => ({
    id: r.id,
    product_id: r.product_id,
    movement_type: r.movement_type,
    quantity_change: Number(r.quantity_change),
    resulting_qty: Number(r.resulting_qty),
    reference: r.reference,
    reference_type: r.reference_type,
    notes: r.notes,
    created_by: r.created_by,
    created_at: r.created_at,
  }));
}
