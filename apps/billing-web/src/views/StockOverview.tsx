import { useEffect, useMemo, useState } from 'react';
import { Search, Boxes, Scale, Package, AlertTriangle, ShoppingCart, TrendingUp, History, X } from 'lucide-react';
import { inr } from '@/lib/currency';
import { type Product, type StockHistory } from '@/lib/types';
import { Badge, EmptyState, Panel } from '@/components/ui';
import { api } from '@/lib/api';

export default function StockOverview() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [stockFilter, setStockFilter] = useState('All');
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);

  useEffect(() => { load(); }, []);
  async function load() {
    try { setProducts((await api<Product[]>('/api/products')).sort((a, b) => a.stock_qty - b.stock_qty)); } catch { setProducts([]); }
  }

  const categories = useMemo(() => ['All', ...Array.from(new Set(products.map((p) => p.category)))], [products]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) return false;
      if (catFilter !== 'All' && p.category !== catFilter) return false;
      if (stockFilter !== 'All') {
        if (stockFilter === 'Out of Stock' && p.stock_qty > 0) return false;
        if (stockFilter === 'Low Stock' && (p.stock_qty >= p.min_stock_qty || p.stock_qty === 0)) return false;
        if (stockFilter === 'In Stock' && p.stock_qty < p.min_stock_qty) return false;
      }
      return true;
    });
  }, [products, search, catFilter, stockFilter]);

  const totalProducts = products.length;
  const totalItems = products.reduce((s, p) => s + p.stock_qty, 0);
  const totalWeight = products.reduce((s, p) => s + p.gross_weight * p.stock_qty, 0);
  const available = products.reduce((s, p) => s + Math.max(0, p.stock_qty - p.reserved_qty), 0);
  const reserved = products.reduce((s, p) => s + p.reserved_qty, 0);
  const lowStock = products.filter((p) => p.stock_qty > 0 && p.stock_qty < p.min_stock_qty).length;
  const outStock = products.filter((p) => p.stock_qty === 0).length;

  if (historyProduct) return <StockHistoryView product={historyProduct} onBack={() => setHistoryProduct(null)} />;

  function stockBadge(p: Product) {
    if (p.stock_qty === 0) return <Badge color="red">Out of Stock</Badge>;
    if (p.stock_qty < p.min_stock_qty) return <Badge color="amber">Low Stock</Badge>;
    return <Badge color="green">In Stock</Badge>;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        {[
          ['Total Products', String(totalProducts), 'navy', Boxes],
          ['Total Stock Items', String(totalItems), 'teal', Package],
          ['Total Stock Weight', `${totalWeight.toFixed(1)}g`, 'blue', Scale],
          ['Available Stock', String(available), 'green', ShoppingCart],
          ['Reserved Stock', String(reserved), 'violet', Package],
          ['Low Stock', String(lowStock), 'orange', AlertTriangle],
          ['Out of Stock', String(outStock), 'rose', AlertTriangle],
        ].map(([label, val, color, Icon]) => {
          const I = Icon as typeof Boxes;
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
          <p className="text-sm font-bold">Stock List</p>
          <div className="flex items-center gap-2">
            <div className="flex h-8 items-center gap-2 rounded-md bg-slate-50 px-3 text-slate-400"><Search size={14} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product, SKU..." className="w-44 bg-transparent text-xs outline-none" /></div>
            <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">
              {['All', 'In Stock', 'Low Stock', 'Out of Stock'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400">
              <tr>{['Product', 'SKU', 'Category', 'Qty', 'Gross Wt', 'Net Wt', 'Available', 'Reserved', 'Stock Status', 'Last Updated', 'Actions'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="px-3 py-2.5 font-bold">{p.name}</td>
                  <td className="px-3 py-2.5 text-slate-500">{p.sku}</td>
                  <td className="px-3 py-2.5 text-slate-500">{p.category}</td>
                  <td className="px-3 py-2.5 font-bold">{p.stock_qty}</td>
                  <td className="px-3 py-2.5 text-slate-500">{(p.gross_weight * p.stock_qty).toFixed(3)}g</td>
                  <td className="px-3 py-2.5 text-slate-500">{(p.net_weight * p.stock_qty).toFixed(3)}g</td>
                  <td className="px-3 py-2.5 font-bold text-emerald-600">{Math.max(0, p.stock_qty - p.reserved_qty)}</td>
                  <td className="px-3 py-2.5 text-orange-600">{p.reserved_qty}</td>
                  <td className="px-3 py-2.5">{stockBadge(p)}</td>
                  <td className="px-3 py-2.5 text-[9px] text-slate-400">{p.stock_updated_at ? new Date(p.stock_updated_at).toLocaleDateString() : '—'}</td>
                  <td className="px-3 py-2.5"><button onClick={() => setHistoryProduct(p)} className="flex items-center gap-1 text-[10px] font-bold text-[#6f39bd] hover:underline"><History size={12} /> History</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <EmptyState message="No products found" />}
        </div>
      </div>
    </div>
  );
}

function StockHistoryView({ product, onBack }: { product: Product; onBack: () => void }) {
  const [history, setHistory] = useState<StockHistory[]>([]);

  useEffect(() => {
    api<StockHistory[]>(`/api/products/${product.id}/movements?limit=50`).then(setHistory).catch(() => setHistory([]));
  }, [product.id]);

  const movementColor = (type: string) => {
    const s = type.toLowerCase();
    if (['purchase', 'stock received', 'return'].includes(s)) return 'green';
    if (['sale'].includes(s)) return 'red';
    if (['adjustment'].includes(s)) return 'amber';
    return 'slate';
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">←</button>
        <h2 className="text-base font-bold">Stock History — {product.name}</h2>
        <Badge color="slate">{product.sku}</Badge>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Panel title="Current Stock Position" icon={Boxes}>
          <div className="grid grid-cols-2 gap-2">
            {[['Current Stock', String(product.stock_qty)], ['Available', String(Math.max(0, product.stock_qty - product.reserved_qty))], ['Reserved', String(product.reserved_qty)], ['Sold', String(product.sold_qty)]].map(([k, v]) => <div key={k} className="rounded-lg border border-slate-100 p-2 text-center"><p className="text-[9px] text-slate-400">{k}</p><p className="mt-1 text-base font-bold">{v}</p></div>)}
          </div>
        </Panel>
        <Panel title="Stock Flow" icon={TrendingUp}>
          <div className="flex flex-col items-center gap-1 py-2 text-[10px]">
            {['Opening Stock', 'Purchase', 'Stock Received', 'Sale', 'Return', 'Adjustment', 'Current Stock'].map((s, i) => (
              <div key={s} className="flex flex-col items-center">
                <div className={`rounded-lg border px-4 py-1.5 font-bold ${i === 0 || i === 6 ? 'bg-[#4714a1] text-white' : 'border-slate-200 text-slate-600'}`}>{s}</div>
                {i < 6 && <div className="h-4 w-[2px] bg-slate-300" />}
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Summary" icon={Scale}>
          <div className="space-y-2 text-[11px]">
            {[['Total In', String(history.filter((h) => h.quantity_change > 0).reduce((s, h) => s + h.quantity_change, 0))], ['Total Out', String(history.filter((h) => h.quantity_change < 0).reduce((s, h) => s + h.quantity_change, 0))], ['Net Movement', String(history.reduce((s, h) => s + h.quantity_change, 0))], ['Total Entries', String(history.length)]].map(([k, v]) => <div key={k} className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">{k}</span><b>{v}</b></div>)}
          </div>
        </Panel>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-bold">Stock Movements</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400">
              <tr>{['Date', 'Movement Type', 'Change', 'Resulting Qty', 'Reference', 'Type', 'Notes'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-t border-slate-50">
                  <td className="px-3 py-2.5 text-slate-500">{new Date(h.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2.5"><Badge color={movementColor(h.movement_type)}>{h.movement_type}</Badge></td>
                  <td className={`px-3 py-2.5 font-bold ${h.quantity_change > 0 ? 'text-emerald-600' : h.quantity_change < 0 ? 'text-red-500' : 'text-slate-600'}`}>{h.quantity_change > 0 ? '+' : ''}{h.quantity_change}</td>
                  <td className="px-3 py-2.5 font-bold">{h.resulting_qty}</td>
                  <td className="px-3 py-2.5 text-slate-500">{h.reference || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500">{h.reference_type || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-400">{h.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {history.length === 0 && <EmptyState message="No stock movements recorded" />}
        </div>
      </div>
    </div>
  );
}
