CREATE TABLE IF NOT EXISTS public.shopify_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_order_id text NOT NULL UNIQUE,
  order_number text NOT NULL,
  customer_name text NOT NULL,
  customer_email text,
  order_date timestamptz NOT NULL,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  payment_status text,
  fulfillment_status text,
  sync_status text NOT NULL DEFAULT 'Imported',
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shopify_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_select_shopify_orders" ON public.shopify_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_shopify_orders" ON public.shopify_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_shopify_orders" ON public.shopify_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
