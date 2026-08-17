/* Unified internal and Shopify customer identities. */

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS shopify_customer_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_shopify_customer_id
  ON public.customers(shopify_customer_id)
  WHERE shopify_customer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.shopify_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_customer_id text NOT NULL UNIQUE,
  name text NOT NULL,
  mobile text,
  email text,
  total_orders integer NOT NULL DEFAULT 0,
  total_spent numeric(14,2) NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shopify_customers_name ON public.shopify_customers(name);
CREATE INDEX IF NOT EXISTS idx_shopify_customers_email ON public.shopify_customers(email);
CREATE INDEX IF NOT EXISTS idx_shopify_customers_mobile ON public.shopify_customers(mobile);

ALTER TABLE public.shopify_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_select_shopify_customers" ON public.shopify_customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_shopify_customers" ON public.shopify_customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_shopify_customers" ON public.shopify_customers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Existing legacy rows may be anonymous; every new invoice must identify a customer.
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_customer_required CHECK (customer_id IS NOT NULL) NOT VALID;

ALTER TABLE public.held_bills
  ADD CONSTRAINT held_bills_customer_required CHECK (customer_id IS NOT NULL) NOT VALID;

ALTER TABLE public.invoices ALTER COLUMN customer_name DROP DEFAULT;
ALTER TABLE public.held_bills ALTER COLUMN customer_name DROP DEFAULT;
