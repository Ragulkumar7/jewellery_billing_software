import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:root123@localhost:5432/opal_line_jewelry',
  max: 10,
});

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ins = async (sql, params) => {
      const r = await client.query(sql + ' returning id', params);
      return r.rows[0].id;
    };

    // Clean existing test data (keep products)
    await client.query("delete from payments where reference like 'TEST-%' or payment_number like 'TEST-%'");
    await client.query("delete from ledger_entries where transaction_type in ('TEST_Sale','TEST_Purchase','TEST_Expense')");
    await client.query("delete from stock_movements where reference like 'TEST-%'");
    await client.query("delete from invoice_items where invoice_id in (select id from invoices where invoice_number like 'TEST-%')");
    await client.query("delete from invoices where invoice_number like 'TEST-%'");
    await client.query("delete from purchase_invoices where pi_number like 'TEST-%'");
    await client.query("delete from purchase_returns where return_number like 'TEST-%'");
    await client.query("delete from expenses where expense_number like 'TEST-%'");
    await client.query("delete from shopify_orders where shopify_order_id like 'TEST-%'");
    await client.query("delete from sync_logs where entity_id::text like 'TEST-%'");
    await client.query("delete from sales_orders where order_number like 'TEST-%'");
    await client.query("delete from purchase_orders where po_number like 'TEST-%'");

    // Get some product IDs
    const products = await client.query("select id, sku, name, net_weight, making_charge, category, stock_qty, sold_qty from products where status='Active' limit 6");
    const prod = products.rows;
    if (prod.length < 3) throw new Error('Need at least 3 active products');

    // Get a customer
    const cust = await client.query("select id, name from customers where status='Active' limit 1");
    let customerId, customerName;
    if (cust.rows.length === 0) {
      customerId = await ins(
        "insert into customers (name, mobile, email, status, outstanding_balance) values ($1,$2,$3,$4,$5)",
        ['Test Customer Ravi', '9876543210', 'ravi@test.com', 'Active', 0]
      );
      customerName = 'Test Customer Ravi';
    } else {
      customerId = cust.rows[0].id;
      customerName = cust.rows[0].name;
    }

    // Get a supplier
    const sup = await client.query("select id, name from suppliers where status='Active' limit 1");
    let supplierId, supplierName;
    if (sup.rows.length === 0) {
      supplierId = await ins(
        "insert into suppliers (name, contact_person, mobile, email, status, outstanding_balance) values ($1,$2,$3,$4,$5,$6)",
        ['Test Supplier Gold', 'Amit', '9988776655', 'amit@supplier.com', 'Active', 0]
      );
      supplierName = 'Test Supplier Gold';
    } else {
      supplierId = sup.rows[0].id;
      supplierName = sup.rows[0].name;
    }

    // Get current silver rate
    const rateRes = await client.query("select rate_per_gram from silver_rates order by effective_date desc, effective_time desc limit 1");
    const silverRate = Number(rateRes.rows[0]?.rate_per_gram || 92.8);

    const today = new Date();
    const dates = [
      today.toISOString().slice(0, 10),
      new Date(today.getTime() - 86400000).toISOString().slice(0, 10),
      new Date(today.getTime() - 2*86400000).toISOString().slice(0, 10),
      new Date(today.getTime() - 5*86400000).toISOString().slice(0, 10),
      new Date(today.getTime() - 10*86400000).toISOString().slice(0, 10),
      new Date(today.getTime() - 15*86400000).toISOString().slice(0, 10),
      new Date(today.getTime() - 30*86400000).toISOString().slice(0, 10),
    ];

    // ---------- SALES INVOICES ----------
    for (let i = 0; i < 8; i++) {
      const d = dates[i % dates.length];
      const p = prod[i % prod.length];
      const qty = Math.floor(Math.random() * 3) + 1;
      const netWt = Number(p.net_weight);
      const making = Number(p.making_charge);
      const unitPrice = Math.round((netWt * silverRate + making) * 1.15);
      const lineTotal = unitPrice * qty;
      const discount = Math.round(lineTotal * 0.05);
      const subtotal = lineTotal - discount;
      const gstRate = 3;
      const gstAmount = Math.round(subtotal * gstRate / 100);
      const grandTotal = subtotal + gstAmount;
      const amountPaid = i % 3 === 0 ? grandTotal : (i % 3 === 1 ? Math.round(grandTotal * 0.5) : 0);
      const outstanding = grandTotal - amountPaid;

      const invId = await ins(
        `insert into invoices (invoice_number, invoice_type, invoice_date, customer_id, customer_name, status, payment_status, payment_method, source, subtotal, discount, gst_amount, round_off, grand_total, amount_paid, outstanding_balance, silver_rate, confirmed_by, confirmed_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        ['TEST-SI-' + (20260800+i+1), 'Tax Invoice', d, customerId, customerName,
         ['Unpaid','Partially Paid','Paid'][i%3],
         ['Unpaid','Partially Paid','Paid'][i%3],
         ['Cash','UPI','Card'][i%3],
         i % 4 === 0 ? 'Shopify' : 'Internal',
         subtotal, discount, gstAmount, 0, grandTotal, amountPaid, outstanding, silverRate, null, d + ' 10:00:00']
      );

      await client.query(
        `insert into invoice_items (invoice_id, product_id, sku, name, purity, gross_weight, net_weight, stone_weight, silver_rate, making_charge, stone_charge, other_charge, gst_rate, quantity, unit_price, line_total)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [invId, p.id, p.sku, p.name, '92.5', netWt, netWt, 0, silverRate, making, 0, 0, gstRate, qty, unitPrice, lineTotal]
      );

      // Stock movement for sale
      await client.query(
        `insert into stock_movements (product_id, movement_type, quantity_change, resulting_qty, reference, reference_type, notes, created_at)
         values ($1,'Sale',$2,$3,$4,$5,$6,$7)`,
        [p.id, -qty, Math.max(0, Number(p.stock_qty) - qty), 'TEST-SI-' + (20260800+i+1), 'Invoice', 'Test sale', d + ' 10:00:00']
      );

      // Payment if paid
      if (amountPaid > 0) {
        await ins(
          `insert into payments (payment_number, payment_type, direction, payment_method, amount, payment_date, reference, status, created_by, created_at)
           values ($1,'Receipt','In','Internal',$2,$3,$4,'Completed',null,$5)`,
          ['TEST-PAY-' + (20260800+i+1), amountPaid, d, 'TEST-SI-' + (20260800+i+1), d + ' 11:00:00']
        );
        await client.query(
          `insert into ledger_entries (transaction_type, entry_date, reference, description, debit, credit, created_by, created_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          ['TEST_Sale', d, 'TEST-SI-' + (20260800+i+1), 'Sales Invoice', 0, amountPaid, null, d + ' 11:00:00']
        );
      }
    }

    // ---------- PURCHASE INVOICES ----------
    for (let i = 0; i < 5; i++) {
      const d = dates[i % dates.length];
      const p = prod[i % prod.length];
      const qty = Math.floor(Math.random() * 5) + 5;
      const netWt = Number(p.net_weight);
      const making = Number(p.making_charge);
      const unitCost = Math.round((netWt * silverRate + making) * 0.85);
      const lineTotal = unitCost * qty;
      const discount = Math.round(lineTotal * 0.03);
      const subtotal = lineTotal - discount;
      const gstRate = 3;
      const gstAmount = Math.round(subtotal * gstRate / 100);
      const grandTotal = subtotal + gstAmount;
      const amountPaid = i % 2 === 0 ? grandTotal : Math.round(grandTotal * 0.4);
      const outstanding = grandTotal - amountPaid;

      const piId = await ins(
        `insert into purchase_invoices (pi_number, supplier_id, pi_date, due_date, status, payment_status, subtotal, discount, gst_amount, grand_total, amount_paid, outstanding_balance, notes)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        ['TEST-PI-' + (20260800+i+1), supplierId, d, d,
         'Approved',
         amountPaid >= grandTotal ? 'Paid' : 'Partially Paid',
         subtotal, discount, gstAmount, grandTotal, amountPaid, outstanding, 'Test purchase']
      );

      await client.query(
        `insert into pi_items (pi_id, product_id, sku, name, quantity, unit_cost, line_total, gst_rate)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [piId, p.id, p.sku, p.name, qty, unitCost, lineTotal, gstRate]
      );

      // Stock movement for purchase receipt
      await client.query(
        `insert into stock_movements (product_id, movement_type, quantity_change, resulting_qty, reference, reference_type, notes, created_at)
         values ($1,'Purchase Receipt',$2,$3,$4,$5,$6,$7)`,
        [p.id, qty, Number(p.stock_qty) + qty, 'TEST-PI-' + (20260800+i+1), 'Purchase Invoice', 'Test purchase receipt', d + ' 11:00:00']
      );

      // Payment if paid
      if (amountPaid > 0) {
        await ins(
          `insert into payments (payment_number, payment_type, direction, payment_method, amount, payment_date, reference, status, created_by, created_at)
           values ($1,'Payment','Out','Bank Transfer',$2,$3,$4,'Completed',null,$5)`,
          ['TEST-PAYP-' + (20260800+i+1), amountPaid, d, 'TEST-PI-' + (20260800+i+1), d + ' 12:00:00']
        );
        await client.query(
          `insert into ledger_entries (transaction_type, entry_date, reference, description, debit, credit, created_by, created_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          ['TEST_Purchase', d, 'TEST-PI-' + (20260800+i+1), 'Purchase Invoice', amountPaid, 0, null, d + ' 12:00:00']
        );
      }
    }

    // ---------- EXPENSES ----------
    const expenseCategories = ['Rent', 'Salaries', 'Marketing', 'Utilities', 'Transport', 'Misc'];
    for (let i = 0; i < 6; i++) {
      const d = dates[i % dates.length];
      const cat = expenseCategories[i % expenseCategories.length];
      const amount = Math.floor(Math.random() * 5000) + 2000;
      await ins(
        `insert into expenses (expense_number, category, amount, expense_date, status, payment_method, description)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        ['TEST-EXP-' + (20260800+i+1), cat, amount, d, 'Approved', 'Bank Transfer', 'Test expense']
      );
      await client.query(
        `insert into ledger_entries (transaction_type, entry_date, reference, description, debit, credit, created_by, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        ['TEST_Expense', d, 'TEST-EXP-' + (20260800+i+1), 'Expense', amount, 0, null, d + ' 14:00:00']
      );
    }

    // ---------- SHOPIFY ORDERS ----------
    for (let i = 0; i < 4; i++) {
      const d = dates[i % dates.length];
      const amount = Math.floor(Math.random() * 20000) + 5000;
      await ins(
        `insert into shopify_orders (shopify_order_id, order_number, customer_email, customer_name, order_date, amount, payment_status, fulfillment_status, currency)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        ['TEST-SHOP-' + (i+1), '#TEST' + (1000+i), 'shopify' + i + '@test.com', 'Shopify Customer ' + (i+1), d, amount, 'paid', 'fulfilled', 'INR']
      );
      // Skip sync_logs - entity_id is uuid
    }

    // Update product stock/sold from movements (roughly)
    for (const p of prod) {
      const mov = await client.query(`select sum(quantity_change) as net from stock_movements where product_id=$1 and movement_type in ('Sale','Purchase Receipt')`, [p.id]);
      const net = Number(mov.rows[0]?.net || 0);
      const newStock = Math.max(0, Number(p.stock_qty) + net);
      await client.query(`update products set stock_qty=$1, sold_qty=$2 where id=$3`, [newStock, Number(p.sold_qty) + Math.abs(Math.min(0, net)), p.id]);
    }

    await client.query('COMMIT');
    console.log('✅ Test data seeded successfully');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', e);
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();