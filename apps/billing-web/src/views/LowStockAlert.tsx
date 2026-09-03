import { useEffect, useMemo, useState } from 'react';
import { Search, AlertTriangle, Package, ShoppingCart, History, Eye, CheckCircle, XCircle, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { type Product } from '@/lib/types';
import { Badge, EmptyState, Panel } from '@/components/ui';

export default function LowStockAlert({ onNavigate }: { onNavigate: (v: string) => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { load(); }, []);
  async function load() {
    try {
      setProducts(await api<Product[]>('/api/products'));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load products');
    }
  }

  async function updateMinStock(p: Product, minStockQty: number) {
    try {
      await api(`/api/products/${p.id}`, { method: 'PUT', body: JSON.stringify({ min_stock_qty: minStockQty }) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update product');
    }
  }

  const alertProducts = useMemo(() => products.filter((p) => p.stock_qty <= p.min_stock_qty), [products]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return alertProducts.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) return false;
      if (statusFilter !== 'All') {
        if (statusFilter === 'Out of Stock' && p.stock_qty > 0) return false;
        if (statusFilter === 'Critical' && (p.stock_qty > 2 || p.stock_qty === 0)) return false;
        if (statusFilter === 'Low Stock' && (p.stock_qty >= p.min_stock_qty || p.stock_qty === 0 || p.stock_qty <= 2)) return false;
      }
      return true;
    });
  }, [alertProducts, search, statusFilter]);

  function alertStatus(p: Product): { label: string; color: 'red' | 'amber' | 'green' } {
    if (p.stock_qty === 0) return { label: 'Out of Stock', color: 'red' };
    if (p.stock_qty <= 2) return { label: 'Critical', color: 'red' };
    return { label: 'Low Stock', color: 'amber' };
  }

  const critical = alertProducts.filter((p) => p.stock_qty <= 2).length;
  const lowCount = alertProducts.filter((p) => p.stock_qty > 2 && p.stock_qty < p.min_stock_qty).length;
  const outCount = alertProducts.filter((p) => p.stock_qty === 0).length;

  async function dismissAlert(p: Product) {
    await updateMinStock(p, 0);
  }

  async function markReviewed(p: Product) {
    await updateMinStock(p, p.stock_qty + 1);
  }

  return (
    <div className="space-y-3">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[11px] font-semibold text-red-600">{error}</div>}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-4">
        {[
          ['Total Alerts', String(alertProducts.length), 'orange', AlertTriangle],
          ['Low Stock', String(lowCount), 'amber', Package],
          ['Critical', String(critical), 'rose', AlertTriangle],
          ['Out of Stock', String(outCount), 'red', XCircle],
        ].map(([label, val, color, Icon]) => {
          const I = Icon as typeof AlertTriangle;
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
          <p className="text-sm font-bold">Low Stock Alerts</p>
          <div className="flex items-center gap-2">
            <div className="flex h-8 items-center gap-2 rounded-md bg-slate-50 px-3 text-slate-400"><Search size={14} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="w-40 bg-transparent text-xs outline-none" /></div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">
              {['All', 'Low Stock', 'Critical', 'Out of Stock'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400">
              <tr>{['Product', 'SKU', 'Current Stock', 'Min Level', 'Required', 'Status', 'Last Updated', 'Actions'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const st = alertStatus(p);
                const required = p.min_stock_qty * 2 - p.stock_qty;
                return (
                  <tr key={p.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                    <td className="px-3 py-2.5 font-bold">{p.name}</td>
                    <td className="px-3 py-2.5 text-slate-500">{p.sku}</td>
                    <td className="px-3 py-2.5"><span className={`text-sm font-bold ${st.color === 'red' ? 'text-red-500' : 'text-orange-600'}`}>{p.stock_qty}</span></td>
                    <td className="px-3 py-2.5 text-slate-500">{p.min_stock_qty}</td>
                    <td className="px-3 py-2.5 font-bold text-slate-600">{required}</td>
                    <td className="px-3 py-2.5"><Badge color={st.color}>{st.label}</Badge></td>
                    <td className="px-3 py-2.5 text-[9px] text-slate-400">{p.stock_updated_at ? new Date(p.stock_updated_at).toLocaleDateString() : '—'}</td>
                    <td className="px-3 py-2.5"><div className="flex items-center gap-1">
                      <button onClick={() => onNavigate('Products')} className="grid h-6 w-6 place-items-center rounded bg-slate-100 text-slate-500 hover:bg-slate-200" title="View Product"><Eye size={12} /></button>
                      <button onClick={() => onNavigate('Purchase Orders')} className="grid h-6 w-6 place-items-center rounded bg-emerald-100 text-emerald-600 hover:bg-emerald-200" title="Create PO"><Plus size={12} /></button>
                      <button onClick={() => markReviewed(p)} className="grid h-6 w-6 place-items-center rounded bg-blue-100 text-blue-600 hover:bg-blue-200" title="Mark Reviewed"><CheckCircle size={12} /></button>
                      <button onClick={() => dismissAlert(p)} className="grid h-6 w-6 place-items-center rounded bg-slate-100 text-slate-400 hover:bg-slate-200" title="Dismiss"><XCircle size={12} /></button>
                    </div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <EmptyState message="No low stock alerts — all products are well stocked" />}
        </div>
      </div>
    </div>
  );
}
