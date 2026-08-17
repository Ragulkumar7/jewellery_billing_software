const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:root123@localhost:5432/opal_line_jewelry' });
pool.query('SELECT id, sku, name, status, shopify_product_id, shopify_variant_id, shopify_sync_status FROM products WHERE status = $1', ['Active'])
  .then(r => { console.table(r.rows); pool.end(); })
  .catch(e => { console.error(e); pool.end(); });