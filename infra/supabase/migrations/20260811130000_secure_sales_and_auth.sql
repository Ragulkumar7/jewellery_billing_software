/*
  Production sales path.

  Sales are created in one database transaction so invoices, items, stock,
  customer balances, payments, and audit records cannot drift apart.
*/

CREATE OR REPLACE FUNCTION public.create_sale(
  p_invoice jsonb,
  p_items jsonb,
  p_user_name text DEFAULT 'Staff'
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_invoice public.invoices;
  v_item jsonb;
  v_product public.products;
  v_quantity integer;
  v_customer public.customers;
  v_outstanding numeric(14,2);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to create a sale';
  END IF;

  IF NULLIF(p_invoice->>'customer_id', '') IS NULL THEN
    RAISE EXCEPTION 'A customer is required to create a sale';
  END IF;

  IF jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'A sale must contain at least one item';
  END IF;

  INSERT INTO public.invoices (
    customer_id, customer_name, customer_mobile, invoice_type, status,
    payment_status, payment_method, subtotal, discount, gst_amount, round_off,
    grand_total, amount_paid, outstanding_balance, silver_rate, salesperson,
    salesperson_id, notes
  ) VALUES (
    NULLIF(p_invoice->>'customer_id', '')::uuid,
    NULLIF(p_invoice->>'customer_name', ''),
    NULLIF(p_invoice->>'customer_mobile', ''),
    COALESCE(NULLIF(p_invoice->>'invoice_type', ''), 'Tax Invoice'),
    COALESCE(NULLIF(p_invoice->>'status', ''), 'Unpaid'),
    COALESCE(NULLIF(p_invoice->>'payment_status', ''), 'Unpaid'),
    NULLIF(p_invoice->>'payment_method', ''),
    COALESCE((p_invoice->>'subtotal')::numeric, 0),
    COALESCE((p_invoice->>'discount')::numeric, 0),
    COALESCE((p_invoice->>'gst_amount')::numeric, 0),
    COALESCE((p_invoice->>'round_off')::numeric, 0),
    COALESCE((p_invoice->>'grand_total')::numeric, 0),
    GREATEST(COALESCE((p_invoice->>'amount_paid')::numeric, 0), 0),
    GREATEST(COALESCE((p_invoice->>'outstanding_balance')::numeric, 0), 0),
    COALESCE((p_invoice->>'silver_rate')::numeric, 0),
    COALESCE(NULLIF(p_user_name, ''), 'Staff'),
    auth.uid(),
    NULLIF(p_invoice->>'notes', '')
  ) RETURNING * INTO v_invoice;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_quantity := (v_item->>'quantity')::integer;
    IF v_quantity IS NULL OR v_quantity < 1 THEN
      RAISE EXCEPTION 'Invalid quantity for product %', v_item->>'product_id';
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = (v_item->>'product_id')::uuid
    FOR UPDATE;

    IF NOT FOUND OR v_product.status <> 'Active' THEN
      RAISE EXCEPTION 'Product % is unavailable', v_item->>'product_id';
    END IF;
    IF v_product.stock_qty < v_quantity THEN
      RAISE EXCEPTION 'Insufficient stock for % (available %, requested %)', v_product.name, v_product.stock_qty, v_quantity;
    END IF;

    INSERT INTO public.invoice_items (
      invoice_id, product_id, sku, name, category, purity, gross_weight,
      net_weight, stone_weight, silver_rate, making_charge, stone_charge,
      other_charge, gst_rate, quantity, unit_price, line_total
    ) VALUES (
      v_invoice.id, (v_item->>'product_id')::uuid, v_item->>'sku',
      v_item->>'name', v_item->>'category', v_item->>'purity',
      COALESCE((v_item->>'gross_weight')::numeric, 0),
      COALESCE((v_item->>'net_weight')::numeric, 0),
      COALESCE((v_item->>'stone_weight')::numeric, 0),
      COALESCE((v_item->>'silver_rate')::numeric, 0),
      COALESCE((v_item->>'making_charge')::numeric, 0),
      COALESCE((v_item->>'stone_charge')::numeric, 0),
      COALESCE((v_item->>'other_charge')::numeric, 0),
      COALESCE((v_item->>'gst_rate')::numeric, 0), v_quantity,
      COALESCE((v_item->>'unit_price')::numeric, 0),
      COALESCE((v_item->>'line_total')::numeric, 0)
    );

    UPDATE public.products
    SET stock_qty = stock_qty - v_quantity,
        sold_qty = sold_qty + v_quantity,
        stock_updated_at = now()
    WHERE id = v_product.id;

    INSERT INTO public.stock_history (product_id, movement_type, quantity_change, resulting_qty, reference, reference_type, notes)
    VALUES (v_product.id, 'Sale', -v_quantity, v_product.stock_qty - v_quantity, v_invoice.invoice_number, 'Invoice', 'Stock consumed by sale');
  END LOOP;

  IF v_invoice.amount_paid > 0 THEN
    INSERT INTO public.payments (direction, payment_type, party_name, party_type, reference, amount, payment_method, status, notes)
    VALUES ('Incoming', 'Invoice Payment', v_invoice.customer_name, 'Customer', v_invoice.invoice_number, v_invoice.amount_paid, COALESCE(v_invoice.payment_method, 'Cash'), 'Completed', 'Created with invoice');
  END IF;

  IF v_invoice.customer_id IS NOT NULL THEN
    SELECT * INTO v_customer FROM public.customers WHERE id = v_invoice.customer_id FOR UPDATE;
    IF FOUND THEN
      v_outstanding := GREATEST(0, v_customer.outstanding_balance + v_invoice.outstanding_balance);
      UPDATE public.customers
      SET total_purchases = total_purchases + v_invoice.grand_total,
          outstanding_balance = v_outstanding,
          loyalty_points = loyalty_points + FLOOR(v_invoice.grand_total / 100)::integer
      WHERE id = v_invoice.customer_id;
    END IF;
  END IF;

  INSERT INTO public.activity_log (user_name, module, action, record_id, record_type, status, new_value, remarks)
  VALUES (COALESCE(p_user_name, 'Staff'), 'Sales', 'Created Sales Invoice', v_invoice.id::text, 'Invoice', 'Success', v_invoice.grand_total::text, 'Invoice and inventory committed atomically');

  RETURN v_invoice;
END;
$$;

ALTER TABLE public.held_bills ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;
ALTER TABLE public.held_bills ADD COLUMN IF NOT EXISTS discount numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.held_bills ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.held_bills ADD COLUMN IF NOT EXISTS amount_paid numeric(14,2) NOT NULL DEFAULT 0;

REVOKE EXECUTE ON FUNCTION public.create_sale(jsonb, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_sale(jsonb, jsonb, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.adjust_product_stock(
  p_product_id uuid,
  p_new_quantity integer,
  p_reference text DEFAULT 'Manual adjustment',
  p_notes text DEFAULT NULL
)
RETURNS public.products
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_product public.products;
  v_delta integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to adjust stock';
  END IF;
  IF p_new_quantity < 0 THEN
    RAISE EXCEPTION 'Stock quantity cannot be negative';
  END IF;

  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
  v_delta := p_new_quantity - v_product.stock_qty;

  UPDATE public.products
  SET stock_qty = p_new_quantity, stock_updated_at = now()
  WHERE id = p_product_id
  RETURNING * INTO v_product;

  IF v_delta <> 0 THEN
    INSERT INTO public.stock_history (product_id, movement_type, quantity_change, resulting_qty, reference, reference_type, notes)
    VALUES (p_product_id, 'Adjustment', v_delta, p_new_quantity, p_reference, 'Manual', p_notes);
  END IF;
  RETURN v_product;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.adjust_product_stock(uuid, integer, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.adjust_product_stock(uuid, integer, text, text) TO authenticated;

-- Replace the original public/no-auth policies. Existing data remains intact,
-- but the browser must now have a Supabase Auth session to access it.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'silver_rates','customers','products','invoices','invoice_items','held_bills',
    'sales_returns','return_items','shifts','stock_history','shopify_sync_log',
    'expense_categories','expenses','payments','silver_rate_history',
    'system_users','system_roles','activity_log','system_settings'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "anon_select_%s" ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_insert_%s" ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_update_%s" ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "anon_delete_%s" ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY "authenticated_select_%s" ON public.%I FOR SELECT TO authenticated USING (true);', t, t);
    EXECUTE format('CREATE POLICY "authenticated_insert_%s" ON public.%I FOR INSERT TO authenticated WITH CHECK (true);', t, t);
    EXECUTE format('CREATE POLICY "authenticated_update_%s" ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true);', t, t);
    EXECUTE format('CREATE POLICY "authenticated_delete_%s" ON public.%I FOR DELETE TO authenticated USING (true);', t, t);
  END LOOP;
END $$;
