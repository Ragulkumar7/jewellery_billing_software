import { useEffect, useMemo, useState } from 'react';
import {
  Search, Plus, Gem, X, Eye, Pencil, Download, RefreshCw, Power, Tag, Scale,
  Boxes, TrendingUp, AlertTriangle, Package, ShoppingCart, Trash2,
} from 'lucide-react';
import { inr } from '@/lib/currency';
import { round2 } from '@/lib/math';
import { type Product, type StockHistory } from '@/lib/types';
import { api } from '@/lib/api';
import { useSilverRate } from '@/lib/silver-rate-context';
import { calculateUnitPrice } from '@/lib/pricing';
import { Badge, EmptyState, Panel, statusColor } from '@/components/ui';

export default function Products() {
  const { currentRate } = useSilverRate();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [stockFilter, setStockFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [syncFilter, setSyncFilter] = useState('All');
  const [selected, setSelected] = useState<Product | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ mode: 'single'; product: Product } | { mode: 'all' } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => { load(); }, []);
  async function load() {
    try { setProducts(await api<Product[]>('/api/products')); } catch { setProducts([]); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      if (deleteTarget.mode === 'single') {
        await api(`/api/products/${deleteTarget.product.id}`, { method: 'DELETE' });
      } else {
        await api('/api/products/bulk-delete', { method: 'POST', body: JSON.stringify({}) });
      }
      await load();
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Unable to delete products');
    } finally {
      setDeleting(false);
    }
  }

  const categories = useMemo(() => ['All', ...Array.from(new Set(products.map((p) => p.category)))], [products]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) return false;
      if (catFilter !== 'All' && p.category !== catFilter) return false;
      if (statusFilter !== 'All' && p.status !== statusFilter) return false;
      if (syncFilter !== 'All' && p.shopify_sync_status !== syncFilter) return false;
      if (stockFilter !== 'All') {
        if (stockFilter === 'Out of Stock' && p.stock_qty > 0) return false;
        if (stockFilter === 'Low Stock' && (p.stock_qty >= p.min_stock_qty || p.stock_qty === 0)) return false;
        if (stockFilter === 'In Stock' && p.stock_qty < p.min_stock_qty) return false;
      }
      return true;
    });
  }, [products, search, catFilter, stockFilter, statusFilter, syncFilter]);

  if (selected) return <ProductDetail product={selected} onBack={() => setSelected(null)} onEdit={() => { setEditProduct(selected); setSelected(null); }} />;
  if (editProduct) return <ProductForm product={editProduct} onClose={() => setEditProduct(null)} onSaved={() => { setEditProduct(null); load(); }} />;

  const totalStock = products.reduce((s, p) => s + p.stock_qty, 0);
  const lowStock = products.filter((p) => p.stock_qty > 0 && p.stock_qty < p.min_stock_qty).length;
  const outStock = products.filter((p) => p.stock_qty === 0).length;
  const synced = products.filter((p) => p.shopify_sync_status === 'Synced').length;

  function stockBadge(p: Product) {
    if (p.stock_qty === 0) return <Badge color="red">Out of Stock</Badge>;
    if (p.stock_qty < p.min_stock_qty) return <Badge color="amber">Low Stock</Badge>;
    return <Badge color="green">In Stock</Badge>;
  }

  function syncBadge(s: string) {
    if (s === 'Synced') return <Badge color="green">Synced</Badge>;
    if (s === 'Pending') return <Badge color="amber">Pending</Badge>;
    if (s === 'Failed') return <Badge color="red">Failed</Badge>;
    return <Badge color="slate">Not Synced</Badge>;
  }

  function calcPrice(p: Product, rate: number) {
    return calculateUnitPrice(p, rate);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
        {[
          ['Total Products', String(products.length), 'navy', Gem],
          ['Total Stock Items', String(totalStock), 'teal', Boxes],
          ['Low Stock', String(lowStock), 'orange', AlertTriangle],
          ['Out of Stock', String(outStock), 'rose', Package],
          ['Shopify Synced', String(synced), 'blue', RefreshCw],
          ['Active Products', String(products.filter((p) => p.status === 'Active').length), 'green', Power],
        ].map(([label, val, color, Icon]) => {
          const I = Icon as typeof Gem;
          return (
            <div key={label as string} className={`rounded-lg p-3 text-white shadow-sm bg-${color as string}`}>
              <div className="mb-2 flex items-center justify-between"><span className="text-[9px] font-medium">{label as string}</span><I size={14} /></div>
              <p className="text-sm font-bold">{val as string}</p>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-bold">Products</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-8 items-center gap-2 rounded-md bg-slate-50 px-3 text-slate-400"><Search size={14} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, SKU..." className="w-40 bg-transparent text-xs outline-none" /></div>
            <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">
              {['All', 'In Stock', 'Low Stock', 'Out of Stock'].map((s) => <option key={s}>{s}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">
              {['All', 'Active', 'Inactive'].map((s) => <option key={s}>{s}</option>)}
            </select>
            <select value={syncFilter} onChange={(e) => setSyncFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">
              {['All', 'Synced', 'Pending', 'Failed', 'Not Synced'].map((s) => <option key={s}>{s}</option>)}
            </select>
            <button className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"><Download size={14} /> Export</button>
            <button onClick={() => setDeleteTarget({ mode: 'all' })} className="flex h-8 items-center gap-1.5 rounded-md border border-red-200 px-3 text-[11px] font-semibold text-red-600 hover:bg-red-50"><Trash2 size={14} /> Delete All</button>
            <button onClick={() => setShowAdd(true)} className="flex h-8 items-center gap-1.5 rounded-md bg-[#4714a1] px-3 text-[11px] font-bold text-white hover:bg-[#5419b5]"><Plus size={14} /> Add Product</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400">
              <tr>
                {['Image', 'Name / SKU', 'Category', 'Purity', 'Gross Wt', 'Net Wt', 'Stone Wt', 'Price', 'Stock', 'Stock Status', 'Shopify', 'Status', 'Actions'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="px-3 py-2.5"><div className="grid h-9 w-9 place-items-center rounded-md bg-purple-50 text-[#6f39bd]"><Gem size={15} /></div></td>
                  <td className="px-3 py-2.5"><p className="font-bold">{p.name}</p><p className="text-[9px] text-slate-400">{p.sku}</p></td>
                  <td className="px-3 py-2.5 text-slate-500">{p.category}</td>
                  <td className="px-3 py-2.5"><Badge color="slate">{p.purity}</Badge></td>
                  <td className="px-3 py-2.5 text-slate-500">{p.gross_weight.toFixed(3)}g</td>
                  <td className="px-3 py-2.5 text-slate-500">{p.net_weight.toFixed(3)}g</td>
                  <td className="px-3 py-2.5 text-slate-500">{p.stone_weight.toFixed(3)}g</td>
                  <td className="px-3 py-2.5 font-bold">{inr(calcPrice(p, currentRate))}</td>
                  <td className="px-3 py-2.5 font-bold">{p.stock_qty}</td>
                  <td className="px-3 py-2.5">{stockBadge(p)}</td>
                  <td className="px-3 py-2.5">{syncBadge(p.shopify_sync_status)}</td>
                  <td className="px-3 py-2.5"><Badge color={p.status === 'Active' ? 'green' : 'slate'}>{p.status}</Badge></td>
                  <td className="px-3 py-2.5"><div className="flex items-center gap-1.5">
                    <button onClick={() => setSelected(p)} className="grid h-6 w-6 place-items-center rounded bg-slate-100 text-slate-500 hover:bg-slate-200"><Eye size={12} /></button>
                    <button onClick={() => setEditProduct(p)} className="grid h-6 w-6 place-items-center rounded bg-slate-100 text-slate-500 hover:bg-slate-200"><Pencil size={12} /></button>
                    <button onClick={() => setDeleteTarget({ mode: 'single', product: p })} className="grid h-6 w-6 place-items-center rounded bg-red-50 text-red-500 hover:bg-red-100"><Trash2 size={12} /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <EmptyState message="No products found" />}
        </div>
      </div>

      {showAdd && <ProductForm product={null} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><p className="text-sm font-bold">{deleteTarget.mode === 'all' ? 'Delete All Products' : 'Delete Product'}</p><button onClick={() => !deleting && setDeleteTarget(null)}><X size={16} /></button></div>
            <div className="rounded-lg bg-red-50 p-4 text-center">
              <AlertTriangle size={24} className="mx-auto text-red-500" />
              <p className="mt-2 text-sm font-bold text-red-700">Are you sure?</p>
              <p className="mt-1 text-[11px] text-red-600">
                {deleteTarget.mode === 'all'
                  ? `This permanently deletes all ${products.length} products. Invoice line items keep their snapshot but lose the product link, and stock history is removed.`
                  : `This permanently deletes "${deleteTarget.product.name}" (${deleteTarget.product.sku}). Invoice line items keep their snapshot but lose the product link, and stock history is removed.`}
              </p>
            </div>
            {deleteError && <p className="mt-3 text-[10px] font-semibold text-red-500">{deleteError}</p>}
            <div className="mt-4 flex gap-2">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting} className="flex-1 rounded-md border border-slate-200 py-2.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 rounded-md bg-red-600 py-2.5 text-[11px] font-bold text-white hover:bg-red-700 disabled:opacity-50">{deleting ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductDetail({ product: initialProduct, onBack, onEdit }: { product: Product; onBack: () => void; onEdit: () => void }) {
  const [product, setProduct] = useState(initialProduct);
  const [history, setHistory] = useState<StockHistory[]>([]);
  const { currentRate: rate } = useSilverRate();
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    api<StockHistory[]>(`/api/products/${product.id}/movements?limit=50`).then(setHistory).catch(() => setHistory([]));
  }, [product.id]);

  const metalValue = round2(product.net_weight * rate);
  const makingValue = round2(Number(product.making_charge) || 0);
  const stoneValue = round2(Number(product.stone_charge) || 0);
  const otherValue = round2(Number(product.other_charge) || 0);
  const subtotal = calculateUnitPrice(product, rate);

  async function syncToShopify() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const latest = (await api<Product[]>('/api/products')).find((item) => item.id === product.id);
      if (!latest) throw new Error('Product is no longer available');
      setProduct(latest);
      if (latest.net_weight <= 0) throw new Error('Set Net Weight greater than 0 before syncing');
      const result = await api<{ price: string }>('/api/shopify/sync/product/' + latest.id, { method: 'POST' });
      const refreshed = await api<Product[]>('/api/products');
      const updated = refreshed.find((item) => item.id === product.id);
      if (updated) setProduct(updated);
      setSyncMessage(`Synced to Shopify at ₹${result.price}`);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : 'Shopify sync failed');
    } finally { setSyncing(false); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">←</button>
        <h2 className="text-base font-bold">{product.name}</h2>
        <Badge color="slate">{product.sku}</Badge>
        <Badge color={product.status === 'Active' ? 'green' : 'slate'}>{product.status}</Badge>
        <button onClick={onEdit} className="ml-auto flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"><Pencil size={13} /> Edit</button>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Panel title="Basic Information" icon={Gem}>
          <div className="mb-4 grid place-items-center rounded-lg bg-slate-50 py-8"><div className="grid h-20 w-20 place-items-center rounded-xl bg-purple-50 text-[#6f39bd]"><Gem size={36} /></div></div>
          <div className="space-y-2 text-[11px]">
            {[['Product Name', product.name], ['SKU', product.sku], ['Barcode', product.barcode || '—'], ['Category', product.category], ['Collection', product.collection || '—'], ['Purity', product.purity], ['Hallmark', product.hallmark || '—']].map(([k, v]) => <div key={k} className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">{k}</span><b className="text-right">{v}</b></div>)}
          </div>
        </Panel>

        <Panel title="Pricing Breakdown" icon={Tag}>
          <div className="space-y-2 text-[11px]">
             {[['Current Silver Rate', `₹${rate.toFixed(2)} / gm`], ['Net Weight', `${product.net_weight.toFixed(3)} gm`], ['Silver / Metal Value', inr(metalValue)], ['Making Charge', inr(makingValue)], ['Stone Charge', inr(stoneValue)], ['Other Charges', inr(otherValue)], ['Unit Price', inr(subtotal)]].map(([k, v]) => <div key={k} className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">{k}</span><b>{v}</b></div>)}
             <div className="flex justify-between pt-2"><span className="font-bold">Selling Price (pre-GST)</span><span className="text-sm font-bold text-[#5419b5]">{inr(subtotal)}</span></div>
          </div>
        </Panel>

        <div className="space-y-3">
          <Panel title="Stock Information" icon={Boxes}>
            <div className="grid grid-cols-2 gap-2">
              {[['Current Stock', String(product.stock_qty)], ['Available', String(product.stock_qty - product.reserved_qty)], ['Reserved', String(product.reserved_qty)], ['Sold', String(product.sold_qty)]].map(([k, v]) => <div key={k} className="rounded-lg border border-slate-100 p-2 text-center"><p className="text-[9px] text-slate-400">{k}</p><p className="mt-1 text-base font-bold">{v}</p></div>)}
            </div>
            <div className="mt-3 text-[10px] text-slate-400">Last Updated: {product.stock_updated_at ? new Date(product.stock_updated_at).toLocaleString() : '—'}</div>
          </Panel>

          <Panel title="Shopify Sync" icon={RefreshCw}>
            <div className="space-y-2 text-[11px]">
              <div className="flex justify-between"><span className="text-slate-500">Sync Status</span>{product.shopify_sync_status === 'Synced' ? <Badge color="green">Synced</Badge> : product.shopify_sync_status === 'Failed' ? <Badge color="red">Failed</Badge> : product.shopify_sync_status === 'Pending' ? <Badge color="amber">Pending</Badge> : <Badge color="slate">Not Synced</Badge>}</div>
              {[['Shopify Product ID', product.shopify_product_id || '—'], ['Shopify Variant ID', product.shopify_variant_id || '—'], ['Last Synced', product.shopify_last_sync ? new Date(product.shopify_last_sync).toLocaleString() : '—']].map(([k, v]) => <div key={k} className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">{k}</span><b className="text-right text-[10px]">{v}</b></div>)}
               {syncMessage && <p className={`text-[10px] ${syncMessage.startsWith('Synced') ? 'text-emerald-600' : 'text-red-500'}`}>{syncMessage}</p>}
               <button onClick={syncToShopify} disabled={syncing} className="w-full rounded-md bg-[#4714a1] py-2 text-[10px] font-bold text-white hover:bg-[#5419b5] disabled:opacity-50">{syncing ? 'Syncing...' : 'Sync to Shopify'}</button>
            </div>
          </Panel>
        </div>
      </div>

      <Panel title="Stock History" icon={TrendingUp}>
        {history.length === 0 ? <EmptyState message="No stock movements recorded" /> : (
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {history.slice(0, 10).reverse().map((h, i) => (
              <div key={h.id} className="flex items-center">
                <div className="min-w-[110px] rounded-lg border border-slate-100 p-2 text-center">
                  <p className="text-[8px] font-bold uppercase text-slate-400">{h.movement_type}</p>
                  <p className={`mt-1 text-sm font-bold ${h.quantity_change > 0 ? 'text-emerald-600' : h.quantity_change < 0 ? 'text-red-500' : 'text-slate-600'}`}>{h.quantity_change > 0 ? '+' : ''}{h.quantity_change}</p>
                  <p className="text-[8px] text-slate-400">Qty: {h.resulting_qty}</p>
                  <p className="text-[8px] text-slate-400">{new Date(h.created_at).toLocaleDateString()}</p>
                </div>
                {i < history.length - 1 && <div className="h-[2px] w-6 bg-slate-200" />}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function ProductForm({ product, onClose, onSaved }: { product: Product | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: product?.name || '', sku: product?.sku || '', barcode: product?.barcode || '', category: product?.category || 'Silver',
    collection: product?.collection || '', purity: product?.purity || '92.5', hallmark: product?.hallmark || '',
    gross_weight: product?.gross_weight || 0, net_weight: product?.net_weight || 0, stone_weight: product?.stone_weight || 0,
    making_charge: product?.making_charge || 0, stone_charge: product?.stone_charge || 0, other_charge: product?.other_charge || 0,
    gst_rate: product?.gst_rate || 3, stock_qty: product?.stock_qty || 0, min_stock_qty: product?.min_stock_qty || 5,
    status: product?.status || 'Active',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!form.name || !form.sku) { setErr('Name and SKU are required'); return; }
    setSaving(true);
    const payload: any = { ...form };
    if (product) {
      try { await api(`/api/products/${product.id}`, { method: 'PUT', body: JSON.stringify(payload) }); }
      catch (error) { setErr(error instanceof Error ? error.message : 'Unable to update product'); setSaving(false); return; }
    } else {
      try { await api('/api/products', { method: 'POST', body: JSON.stringify(payload) }); }
      catch (error) { setErr(error instanceof Error ? error.message : 'Unable to create product'); setSaving(false); return; }
    }
    setSaving(false);
    onSaved();
  }

  const field = (key: string, label: string, type: string = 'text') => (
    <div><label className="text-[9px] font-bold uppercase text-slate-400">{label}</label>
      <input type={type} value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: type === 'number' ? +e.target.value : e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-[11px] outline-none focus:border-[#6f39bd]" /></div>
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><p className="text-sm font-bold">{product ? 'Edit Product' : 'Add New Product'}</p><button onClick={onClose}><X size={16} /></button></div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">{field('name', 'Product Name *')}{field('sku', 'SKU *')}</div>
          <div className="grid grid-cols-3 gap-3">{field('barcode', 'Barcode')}{field('category', 'Category')}{field('collection', 'Collection')}</div>
          <div className="grid grid-cols-3 gap-3">{field('purity', 'Purity')}{field('hallmark', 'Hallmark Info')}{field('gst_rate', 'GST Rate %', 'number')}</div>
          <div className="grid grid-cols-3 gap-3">{field('gross_weight', 'Gross Weight (g)', 'number')}{field('net_weight', 'Net Weight (g)', 'number')}{field('stone_weight', 'Stone Weight (g)', 'number')}</div>
          <div className="grid grid-cols-3 gap-3">{field('making_charge', 'Making Charge', 'number')}{field('stone_charge', 'Stone Charge', 'number')}{field('other_charge', 'Other Charges', 'number')}</div>
          <div className="grid grid-cols-3 gap-3">{field('stock_qty', 'Stock Qty', 'number')}{field('min_stock_qty', 'Min Stock Level', 'number')}
            <div><label className="text-[9px] font-bold uppercase text-slate-400">Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 text-[11px] outline-none">
                {['Active', 'Inactive'].map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          {err && <p className="text-[10px] font-semibold text-red-500">{err}</p>}
          <button onClick={save} disabled={saving} className="w-full rounded-md bg-[#4714a1] py-2.5 text-[11px] font-bold text-white hover:bg-[#5419b5] disabled:opacity-50">{saving ? 'Saving...' : product ? 'Update Product' : 'Create Product'}</button>
        </div>
      </div>
    </div>
  );
}
