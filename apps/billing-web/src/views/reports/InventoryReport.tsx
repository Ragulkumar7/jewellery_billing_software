import { useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import { Search, Download, Printer, Eye, Package, TrendingUp, AlertTriangle, Boxes, Gem } from 'lucide-react';
import { api } from '@/lib/api';
import { inr } from '@/lib/currency';
import { Badge, EmptyState, Panel } from '@/components/ui';

type InventoryResponse = {
  silverRate: number;
  summary: {
    totalProducts: number;
    inStock: number;
    lowStock: number;
    outOfStock: number;
    totalQty: number;
    totalWeight: number;
    totalValue: number;
    weightValue: number;
  };
  stock: {
    id: string;
    sku: string;
    name: string;
    category: string;
    purity: string;
    netWeight: number;
    makingCharge: number;
    opening: number;
    purchased: number;
    sold: number;
    returned: number;
    adjusted: number;
    closing: number;
    minStock: number;
    soldQty: number;
    value: number;
  }[];
  movements: {
    id: string;
    created_at: string;
    movement_type: string;
    quantity_change: number;
    resulting_qty: number;
    reference: string | null;
    reference_type: string | null;
    notes: string | null;
    product_id: string;
    sku: string;
    product_name: string;
  }[];
  lowStock: { id: string; sku: string; name: string; category: string; stock_qty: number; min_stock_qty: number }[];
  categoryStock: { category: string; products: number; qty: number; weight: number }[];
};

export default function InventoryReport({ permissions, onNavigate }: { permissions: string[]; onNavigate: (v: string) => void }) {
  const can = (perm: string) => permissions.includes('*') || permissions.includes(perm);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [stockFilter, setStockFilter] = useState('All');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [tab, setTab] = useState<'summary' | 'movement' | 'analysis'>('summary');
  const [data, setData] = useState<InventoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<InventoryResponse['stock'][0] | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      if (catFilter !== 'All') params.set('category', catFilter);
      if (stockFilter !== 'All') params.set('stock', stockFilter);
      const res = await api<InventoryResponse>(`/api/reports/inventory?${params.toString()}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inventory report');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const categories = useMemo(() => {
    if (!data) return [] as string[];
    return [...new Set(data.stock.map((p) => p.category))];
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.stock.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, search]);

  const movementSummary = useMemo(() => {
    if (!data) return { byType: {} as Record<string, number>, total: [] as InventoryResponse['movements'] };
    const byType: Record<string, number> = {};
    data.movements.forEach((h) => { byType[h.movement_type] = (byType[h.movement_type] || 0) + h.quantity_change; });
    return { byType, total: data.movements };
  }, [data]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-slate-500">Loading inventory report...</div>;
  }

  if (!can('reports.inventory.view')) {
    return <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-[11px] text-amber-800">You do not have permission to view the Inventory Report.</div>;
  }

  if (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>;
  }

  if (!data) return null;

  const selectedHistory = selected ? data.movements.filter((m) => m.product_id === selected.id) : [];

  if (selected) return <ProductStockHistory stock={selected} history={selectedHistory} onBack={() => setSelected(null)} />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {['summary', 'movement', 'analysis'].map((t) => (
          <button key={t} onClick={() => setTab(t as typeof tab)} className={`rounded-md px-3 py-1.5 text-[10px] font-bold capitalize ${tab === t ? 'bg-[#4714a1] text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{t === 'analysis' ? 'Product Analysis' : t === 'movement' ? 'Stock Movement' : 'Stock Summary'}</button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex h-8 items-center gap-2 rounded-md bg-slate-50 px-3 text-slate-400"><Search size={14} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product, SKU..." className="w-32 bg-transparent text-xs outline-none" /></div>
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none"><option>All</option>{categories.map((c) => <option key={c}>{c}</option>)}</select>
          <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">{['All', 'In Stock', 'Low Stock', 'Out of Stock'].map((s) => <option key={s}>{s}</option>)}</select>
          <button onClick={load} className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"><Download size={14} /> Generate</button>
          {can('reports.inventory.export') && <><button className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"><Printer size={14} /> Print</button>
          <button className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"><Download size={14} /> Export</button></>}
        </div>
      </div>

      {tab === 'summary' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
            {([
              ['Total Products', String(data.summary.totalProducts), 'navy', Package],
              ['Total Quantity', String(data.summary.totalQty), 'blue', Boxes],
              ['Total Weight', `${data.summary.totalWeight.toFixed(1)}g`, 'violet', Gem],
              ['In Stock', String(data.summary.inStock), 'green', Package],
              ['Low Stock', String(data.summary.lowStock), 'amber', AlertTriangle],
              ['Out of Stock', String(data.summary.outOfStock), 'red', AlertTriangle],
              ['Stock Value', inr(data.summary.totalValue), 'cyan', TrendingUp],
            ] as const).map(([label, val, color, Icon]) => {
              const IconComponent = Icon as ComponentType<{ size?: number }>;
              return <div key={label} className={`rounded-lg p-3 text-white shadow-sm bg-${color}`}><div className="mb-2 flex items-center justify-between"><span className="text-[9px] font-medium">{label}</span><IconComponent size={14} /></div><p className="text-sm font-bold">{val}</p></div>;
            })}
          </div>
          <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3 text-sm font-bold">Stock List</div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400"><tr>{['Product', 'SKU', 'Category', 'Purity', 'Net Wt', 'Opening', 'Purchased', 'Sold', 'Returned', 'Adjusted', 'Closing', 'Min Qty', 'Value', 'Actions'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr></thead>
                <tbody>
                  {filtered.map((p) => {
                    const status = p.closing === 0 ? 'Out of Stock' : p.closing <= p.minStock ? 'Low Stock' : 'In Stock';
                    const statusColor = p.closing === 0 ? 'red' : p.closing <= p.minStock ? 'amber' : 'green';
                    return <tr key={p.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                      <td className="px-3 py-2.5 font-semibold">{p.name}</td>
                      <td className="px-3 py-2.5 text-slate-500">{p.sku}</td>
                      <td className="px-3 py-2.5"><Badge color="violet">{p.category}</Badge></td>
                      <td className="px-3 py-2.5 text-slate-500">{p.purity}</td>
                      <td className="px-3 py-2.5 text-slate-500">{p.netWeight}g</td>
                      <td className="px-3 py-2.5 text-slate-500">{p.opening}</td>
                      <td className="px-3 py-2.5 text-slate-500">{p.purchased}</td>
                      <td className="px-3 py-2.5 text-slate-500">{p.sold}</td>
                      <td className="px-3 py-2.5 text-slate-500">{p.returned}</td>
                      <td className="px-3 py-2.5 text-slate-500">{p.adjusted}</td>
                      <td className="px-3 py-2.5 font-bold">{p.closing}</td>
                      <td className="px-3 py-2.5 text-slate-400">{p.minStock}</td>
                      <td className="px-3 py-2.5 font-bold">{inr(p.value)}</td>
                      <td className="px-3 py-2.5"><button onClick={() => setSelected(p)} className="grid h-6 w-6 place-items-center rounded bg-slate-100 text-slate-500 hover:bg-slate-200"><Eye size={12} /></button></td>
                    </tr>;
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && <EmptyState message="No products found" />}
            </div>
          </div>
        </div>
      )}

      {tab === 'movement' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[10px] outline-none" />
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[10px] outline-none" />
            <button onClick={load} className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"><Download size={14} /> Apply</button>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
            {['Purchase Receipt', 'Sale', 'Purchase Return', 'Adjustment'].map((type) => {
              const qty = movementSummary.byType[type] || 0;
              return <div key={type} className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm"><p className="text-[9px] font-semibold text-slate-500">{type}</p><p className={`mt-2 text-sm font-bold ${qty >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{qty > 0 ? '+' : ''}{qty}</p></div>;
            })}
            <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm"><p className="text-[9px] font-semibold text-slate-500">Closing Stock</p><p className="mt-2 text-sm font-bold text-[#5419b5]">{data.summary.totalQty}</p></div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3 text-sm font-bold">Stock Movement History</div>
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400 sticky top-0"><tr>{['Date', 'Product', 'Movement Type', 'Qty Change', 'Resulting Qty', 'Reference', 'Notes'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr></thead>
                <tbody>
                  {movementSummary.total.map((h) => <tr key={h.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                    <td className="px-3 py-2.5 text-slate-500">{h.created_at.slice(0, 10)}</td>
                    <td className="px-3 py-2.5 font-semibold">{h.product_name}</td>
                    <td className="px-3 py-2.5"><Badge color={h.movement_type === 'Sale' ? 'red' : h.movement_type === 'Purchase Receipt' ? 'green' : 'slate'}>{h.movement_type}</Badge></td>
                    <td className={`px-3 py-2.5 font-bold ${h.quantity_change >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{h.quantity_change > 0 ? '+' : ''}{h.quantity_change}</td>
                    <td className="px-3 py-2.5 text-slate-500">{h.resulting_qty}</td>
                    <td className="px-3 py-2.5 text-slate-400">{h.reference || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-400">{h.notes || '—'}</td>
                  </tr>)}
                </tbody>
              </table>
              {movementSummary.total.length === 0 && <EmptyState message="No stock movements found" />}
            </div>
          </div>
        </div>
      )}

      {tab === 'analysis' && (
        <div className="space-y-3">
          <Panel title="Low Stock Analysis" icon={AlertTriangle}>
            <table className="w-full text-[11px]">
              <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400"><tr>{['Product', 'SKU', 'Category', 'Current', 'Minimum', 'Status'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr></thead>
              <tbody>
                {data.lowStock.map((p) => {
                  const critical = p.stock_qty <= p.min_stock_qty / 2;
                  return <tr key={p.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                    <td className="px-3 py-2.5 font-semibold">{p.name}</td>
                    <td className="px-3 py-2.5 text-slate-500">{p.sku}</td>
                    <td className="px-3 py-2.5"><Badge color="violet">{p.category}</Badge></td>
                    <td className="px-3 py-2.5 font-bold text-amber-600">{p.stock_qty}</td>
                    <td className="px-3 py-2.5 text-slate-500">{p.min_stock_qty}</td>
                    <td className="px-3 py-2.5"><Badge color={critical ? 'red' : 'amber'}>{critical ? 'Critical' : 'Low'}</Badge></td>
                  </tr>;
                })}
              </tbody>
            </table>
            {data.lowStock.length === 0 && <EmptyState message="No low-stock products" />}
          </Panel>
          <Panel title="Category-wise Stock" icon={Package}>
            <table className="w-full text-[11px]"><thead className="bg-slate-50 text-[9px] uppercase text-slate-400"><tr><th className="px-3 py-2.5 text-left font-bold">Category</th><th className="text-right">Products</th><th className="text-right">Qty</th><th className="text-right">Weight</th></tr></thead>
              <tbody>{data.categoryStock.map((c) => <tr key={c.category} className="border-t border-slate-50"><td className="px-3 py-2.5"><Badge color="violet">{c.category}</Badge></td><td className="px-3 py-2.5 text-right text-slate-500">{c.products}</td><td className="px-3 py-2.5 text-right text-slate-500">{c.qty}</td><td className="px-3 py-2.5 text-right font-bold">{c.weight.toFixed(1)}g</td></tr>)}</tbody>
            </table>
          </Panel>
        </div>
      )}
    </div>
  );
}

function ProductStockHistory({ stock, history, onBack }: { stock: InventoryResponse['stock'][0]; history: InventoryResponse['movements']; onBack: () => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">←</button>
        <h2 className="text-base font-bold">{stock.name}</h2>
        <Badge color="violet">{stock.sku}</Badge>
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        <Panel title="Product Info" icon={Gem}>
          <div className="space-y-2 text-[11px]">
            {[['Category', stock.category], ['Purity', stock.purity], ['Net Weight', `${stock.netWeight}g`], ['Making Charge', inr(stock.makingCharge)], ['Min Stock', String(stock.minStock)], ['Sold (all time)', String(stock.soldQty)]].map(([k, v]) => <div key={k} className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">{k}</span><b>{v}</b></div>)}
          </div>
        </Panel>
        <Panel title="Stock Status" icon={Package}>
          <div className="space-y-2 text-[11px]">
            {[['Opening', String(stock.opening)], ['Purchased', String(stock.purchased)], ['Sold', String(stock.sold)], ['Returned', String(stock.returned)], ['Adjusted', String(stock.adjusted)], ['Closing', String(stock.closing)]].map(([k, v]) => <div key={k} className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">{k}</span><b>{v}</b></div>)}
          </div>
        </Panel>
        <Panel title="Stock Value" icon={TrendingUp}>
          <div className="space-y-2 text-[11px]">
            {[['Net Weight Value', inr(stock.netWeight * stock.closing * (stock.value / Math.max(stock.netWeight * stock.closing, 1)))], ['Total Value', inr(stock.value)]].map(([k, v]) => <div key={k} className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">{k}</span><b>{v}</b></div>)}
          </div>
        </Panel>
      </div>
      <Panel title="Stock Movement History" icon={Boxes}>
        <table className="w-full text-[11px]">
          <thead className="bg-slate-50 text-[9px] uppercase text-slate-400"><tr>{['Date', 'Type', 'Change', 'Resulting Qty', 'Reference', 'Notes'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr></thead>
          <tbody>
            {history.map((h) => <tr key={h.id} className="border-t border-slate-50">
              <td className="px-3 py-2.5 text-slate-500">{h.created_at.slice(0, 10)}</td>
              <td className="px-3 py-2.5"><Badge color={h.movement_type === 'Sale' ? 'red' : 'green'}>{h.movement_type}</Badge></td>
              <td className={`px-3 py-2.5 font-bold ${h.quantity_change >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{h.quantity_change > 0 ? '+' : ''}{h.quantity_change}</td>
              <td className="px-3 py-2.5 text-slate-500">{h.resulting_qty}</td>
              <td className="px-3 py-2.5 text-slate-400">{h.reference || '—'}</td>
              <td className="px-3 py-2.5 text-slate-400">{h.notes || '—'}</td>
            </tr>)}
          </tbody>
        </table>
        {history.length === 0 && <EmptyState message="No stock history for this product" />}
      </Panel>
    </div>
  );
}