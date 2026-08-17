import { useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import { TrendingUp, ShoppingBag, Users, Package, CreditCard, Gem, Percent, Download, Award, AlertTriangle, Store } from 'lucide-react';
import { api } from '@/lib/api';
import { inr } from '@/lib/supabase';
import { Panel, EmptyState, Badge } from '@/components/ui';

type AnalyticsResponse = {
  kpis: {
    revenue: number;
    orders: number;
    aov: number;
    discounts: number;
    collected: number;
    discountRate: number;
    returnRate: number;
    returnsValue: number;
  };
  trend: { bucket: string; orders: number; revenue: number }[];
  topProducts: { product: string; sku: string; qty_sold: number; revenue: number; weight_sold: number }[];
  topCustomers: { customer: string; orders: number; revenue: number }[];
  categoryPerformance: { category: string; qty_sold: number; revenue: number }[];
  paymentMethods: { method: string; orders: number; revenue: number }[];
  sourcePerformance: { source: string | null; orders: number; revenue: number }[];
};

export default function SalesAnalytics({ permissions }: { permissions: string[] }) {
  const can = (perm: string) => permissions.includes('*') || permissions.includes(perm);
  const [tab, setTab] = useState<'dashboard' | 'product' | 'customer' | 'channel' | 'payment' | 'time' | 'silver'>('dashboard');
  const [period, setPeriod] = useState<'monthly' | 'daily' | 'weekly' | 'yearly'>('monthly');
  const [source, setSource] = useState('All');
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { load(); }, [period, source]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('period', period);
      if (source !== 'All') params.set('source', source);
      const res = await api<AnalyticsResponse>(`/api/reports/analytics?${params.toString()}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sales analytics');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const productAnalysis = useMemo(() => {
    if (!data) return { best: [] as [string, { qty: number; revenue: number; weight: number }][], slow: [] as [string, { qty: number; revenue: number; weight: number }][], all: [] as [string, { qty: number; revenue: number; weight: number }][] };
    const all = data.topProducts.map((p) => [p.product, { qty: p.qty_sold, revenue: p.revenue, weight: p.weight_sold }] as [string, { qty: number; revenue: number; weight: number }]);
    return { best: all.slice(0, 5), slow: all.slice(-5).reverse(), all };
  }, [data]);

  const categoryAnalysis = useMemo(() => {
    if (!data) return [] as [string, { qty: number; revenue: number }][];
    return data.categoryPerformance.map((c) => [c.category, { qty: c.qty_sold, revenue: c.revenue }] as [string, { qty: number; revenue: number }]);
  }, [data]);

  const paymentAnalysis = useMemo(() => {
    if (!data) return [] as [string, number][];
    return data.paymentMethods.map((p) => [p.method, p.revenue] as [string, number]);
  }, [data]);

  const channelAnalysis = useMemo(() => {
    if (!data) return { internal: { count: 0, revenue: 0 }, shopify: { count: 0, revenue: 0 } };
    const shopify = data.sourcePerformance.find((s) => s.source === 'Shopify');
    const internal = data.sourcePerformance.find((s) => s.source === 'Internal');
    return {
      internal: { count: internal?.orders || 0, revenue: internal?.revenue || 0 },
      shopify: { count: shopify?.orders || 0, revenue: shopify?.revenue || 0 },
    };
  }, [data]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-slate-500">Loading sales analytics...</div>;
  }

  if (!can('reports.analytics.view')) {
    return <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-[11px] text-amber-800">You do not have permission to view Sales Analytics.</div>;
  }

  if (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>;
  }

  if (!data) return null;

  const trendMax = Math.max(...data.trend.map((t) => t.revenue), 1);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {['dashboard', 'product', 'customer', 'channel', 'payment', 'time', 'silver'].map((t) => (
          <button key={t} onClick={() => setTab(t as typeof tab)} className={`rounded-md px-3 py-1.5 text-[10px] font-bold capitalize ${tab === t ? 'bg-[#4714a1] text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{t === 'silver' ? 'Silver / Jewellery' : t}</button>
        ))}
        <select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">
          {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">
          {['All', 'Internal', 'Shopify'].map((s) => <option key={s}>{s}</option>)}
        </select>
        <button onClick={load} className="ml-auto flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"><Download size={14} /> Generate</button>
        <button className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"><Download size={14} /> Export</button>
      </div>

      {tab === 'dashboard' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            {([
              ['Revenue', inr(data.kpis.revenue), 'green', TrendingUp],
              ['Orders', String(data.kpis.orders), 'blue', ShoppingBag],
              ['Avg Order Value', inr(data.kpis.aov), 'violet', CreditCard],
              ['Collected', inr(data.kpis.collected), 'navy', Package],
              ['Return Rate', `${data.kpis.returnRate.toFixed(1)}%`, 'orange', Percent],
              ['Discount Rate', `${data.kpis.discountRate.toFixed(1)}%`, 'cyan', TrendingUp],
            ] as const).map(([label, val, color, Icon]) => {
              const IconComponent = Icon as ComponentType<{ size?: number }>;
              return <div key={label} className={`rounded-lg p-3 text-white shadow-sm bg-${color}`}><div className="mb-2 flex items-center justify-between"><span className="text-[9px] font-medium">{label}</span><IconComponent size={14} /></div><p className="text-sm font-bold">{val}</p></div>;
            })}
          </div>
          <Panel title="Sales Trend" icon={TrendingUp}>
            <div className="h-48">
              <svg viewBox="0 0 600 180" className="h-full w-full">
                {[0, 45, 90, 135, 180].map((y) => <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="#f1f5f9" strokeWidth="1" />)}
                <polyline points={data.trend.map((t, i) => `${(i / Math.max(data.trend.length - 1, 1)) * 600},${180 - (t.revenue / trendMax) * 160}`).join(' ')} fill="none" stroke="#10b981" strokeWidth="2" />
              </svg>
            </div>
            <div className="flex flex-wrap gap-2 text-[9px] text-slate-500">
              {data.trend.map((t) => <span key={t.bucket} className="rounded bg-slate-50 px-1.5 py-0.5">{t.bucket}</span>)}
            </div>
          </Panel>
          <div className="grid gap-3 xl:grid-cols-2">
            <Panel title="Best-Selling Products" icon={Award}>
              <div className="space-y-2 text-[10px]">
                {productAnalysis.best.map(([name, d], i) => <div key={name} className="flex items-center justify-between border-b border-slate-50 pb-2"><span className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-100 text-[9px] font-bold text-emerald-600">{i + 1}</span>{name}</span><b>{inr(d.revenue)}</b></div>)}
                {productAnalysis.best.length === 0 && <EmptyState message="No product data" />}
              </div>
            </Panel>
            <Panel title="Top Customers" icon={Users}>
              <div className="space-y-2 text-[10px]">
                {data.topCustomers.map((c, i) => <div key={c.customer} className="flex items-center justify-between border-b border-slate-50 pb-2"><span className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-violet-100 text-[9px] font-bold text-violet-600">{i + 1}</span>{c.customer}</span><b>{inr(c.revenue)}</b></div>)}
                {data.topCustomers.length === 0 && <EmptyState message="No customer data" />}
              </div>
            </Panel>
          </div>
        </div>
      )}

      {tab === 'product' && (
        <div className="grid gap-3 xl:grid-cols-2">
          <Panel title="Top Products" icon={Award}>
            <table className="w-full text-[11px]"><thead className="text-[9px] uppercase text-slate-400"><tr><th className="py-2 text-left font-bold">Product</th><th className="text-right">Qty</th><th className="text-right">Revenue</th><th className="text-right">Weight</th></tr></thead>
              <tbody>{data.topProducts.map((p) => <tr key={p.product} className="border-t border-slate-50"><td className="py-2 font-semibold">{p.product}<p className="text-[9px] text-slate-400">{p.sku}</p></td><td className="text-right text-slate-500">{p.qty_sold}</td><td className="text-right font-bold">{inr(p.revenue)}</td><td className="text-right text-slate-500">{p.weight_sold.toFixed(1)}g</td></tr>)}</tbody>
            </table>
            {data.topProducts.length === 0 && <EmptyState message="No product data" />}
          </Panel>
          <Panel title="Category Performance" icon={Package}>
            <table className="w-full text-[11px]"><thead className="text-[9px] uppercase text-slate-400"><tr><th className="py-2 text-left font-bold">Category</th><th className="text-right">Qty</th><th className="text-right">Revenue</th><th className="text-right">Share</th></tr></thead>
              <tbody>{categoryAnalysis.map(([cat, d]) => <tr key={cat} className="border-t border-slate-50"><td className="py-2"><Badge color="violet">{cat}</Badge></td><td className="text-right text-slate-500">{d.qty}</td><td className="text-right font-bold">{inr(d.revenue)}</td><td className="text-right text-slate-500">{data.kpis.revenue ? ((d.revenue / data.kpis.revenue) * 100).toFixed(1) : 0}%</td></tr>)}</tbody>
            </table>
            {categoryAnalysis.length === 0 && <EmptyState message="No category data" />}
          </Panel>
        </div>
      )}

      {tab === 'customer' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {([
              ['Revenue', inr(data.kpis.revenue), 'green', TrendingUp],
              ['Orders', String(data.kpis.orders), 'blue', ShoppingBag],
              ['Avg Order Value', inr(data.kpis.aov), 'violet', CreditCard],
              ['Top Customers', String(data.topCustomers.length), 'navy', Users],
            ] as const).map(([label, val, color, Icon]) => {
              const IconComponent = Icon as ComponentType<{ size?: number }>;
              return <div key={label} className={`rounded-lg p-3 text-white shadow-sm bg-${color}`}><div className="mb-2 flex items-center justify-between"><span className="text-[9px] font-medium">{label}</span><IconComponent size={14} /></div><p className="text-sm font-bold">{val}</p></div>;
            })}
          </div>
          <Panel title="Top Customers" icon={Award}>
            <table className="w-full text-[11px]"><thead className="bg-slate-50 text-[9px] uppercase text-slate-400"><tr><th className="px-3 py-2.5 text-left font-bold">Rank</th><th className="text-left">Customer</th><th className="text-right">Orders</th><th className="text-right">Revenue</th></tr></thead>
              <tbody>{data.topCustomers.map((c, i) => <tr key={c.customer} className="border-t border-slate-50"><td className="px-3 py-2.5 font-bold text-[#5419b5]">#{i + 1}</td><td className="font-semibold">{c.customer}</td><td className="text-right text-slate-500">{c.orders}</td><td className="text-right font-bold">{inr(c.revenue)}</td></tr>)}</tbody>
            </table>
            {data.topCustomers.length === 0 && <EmptyState message="No customer data" />}
          </Panel>
        </div>
      )}

      {tab === 'channel' && (
        <div className="grid gap-3 xl:grid-cols-2">
          <Panel title="Sales Source: Internal vs Shopify" icon={Store}>
            <div className="space-y-4 py-2">
              {([
                { label: 'Internal', data: channelAnalysis.internal, color: 'bg-emerald-500' },
                { label: 'Shopify', data: channelAnalysis.shopify, color: 'bg-[#4714a1]' },
              ]).map(({ label, data, color }) => {
                const total = channelAnalysis.internal.revenue + channelAnalysis.shopify.revenue || 1;
                const pct = (data.revenue / total) * 100;
                return <div key={label}>
                  <div className="mb-1 flex justify-between text-[10px]"><span className="font-semibold">{label}</span><b>{inr(data.revenue)} ({pct.toFixed(0)}%)</b></div>
                  <div className="h-3 rounded-full bg-slate-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} /></div>
                  <p className="mt-1 text-[9px] text-slate-400">{data.count} orders</p>
                </div>;
              })}
            </div>
          </Panel>
          <Panel title="Channel Summary" icon={TrendingUp}>
            <table className="w-full text-[11px]">
              <thead className="text-[9px] uppercase text-slate-400"><tr><th className="py-2 text-left font-bold">Channel</th><th className="text-right">Orders</th><th className="text-right">Revenue</th><th className="text-right">AOV</th></tr></thead>
              <tbody>
                <tr className="border-t border-slate-50"><td className="py-2 font-semibold">Internal</td><td className="text-right text-slate-500">{channelAnalysis.internal.count}</td><td className="text-right font-bold">{inr(channelAnalysis.internal.revenue)}</td><td className="text-right text-slate-500">{inr(channelAnalysis.internal.count ? channelAnalysis.internal.revenue / channelAnalysis.internal.count : 0)}</td></tr>
                <tr className="border-t border-slate-50"><td className="py-2 font-semibold">Shopify</td><td className="text-right text-slate-500">{channelAnalysis.shopify.count}</td><td className="text-right font-bold">{inr(channelAnalysis.shopify.revenue)}</td><td className="text-right text-slate-500">{inr(channelAnalysis.shopify.count ? channelAnalysis.shopify.revenue / channelAnalysis.shopify.count : 0)}</td></tr>
              </tbody>
            </table>
          </Panel>
        </div>
      )}

      {tab === 'payment' && (
        <Panel title="Payment Method Analysis" icon={CreditCard}>
          <div className="space-y-3 py-2">
            {paymentAnalysis.map(([method, amount]) => {
              const total = paymentAnalysis.reduce((s, [, a]) => s + a, 0) || 1;
              const pct = (amount / total) * 100;
              const colors: Record<string, string> = { Cash: 'bg-emerald-500', UPI: 'bg-blue-500', Card: 'bg-violet-500', 'Bank Transfer': 'bg-orange-500', Cheque: 'bg-cyan-500', Other: 'bg-slate-400' };
              return <div key={method}>
                <div className="mb-1 flex justify-between text-[10px]"><span className="font-semibold">{method}</span><b>{inr(amount)} ({pct.toFixed(1)}%)</b></div>
                <div className="h-3 rounded-full bg-slate-100"><div className={`h-full rounded-full ${colors[method] || 'bg-slate-400'}`} style={{ width: `${pct}%` }} /></div>
              </div>;
            })}
            {paymentAnalysis.length === 0 && <EmptyState message="No payment data" />}
          </div>
        </Panel>
      )}

      {tab === 'time' && (
        <Panel title={`Sales Trend — ${period[0].toUpperCase() + period.slice(1)}`} icon={TrendingUp}>
          <div className="h-48">
            <svg viewBox="0 0 600 180" className="h-full w-full">
              {[0, 45, 90, 135, 180].map((y) => <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="#f1f5f9" strokeWidth="1" />)}
              <polyline points={data.trend.map((t, i) => `${(i / Math.max(data.trend.length - 1, 1)) * 600},${180 - (t.revenue / trendMax) * 160}`).join(' ')} fill="none" stroke="#10b981" strokeWidth="2" />
            </svg>
          </div>
          <div className="flex flex-wrap gap-2 text-[9px] text-slate-500">
            {data.trend.map((t) => <span key={t.bucket} className="rounded bg-slate-50 px-1.5 py-0.5">{t.bucket}</span>)}
          </div>
        </Panel>
      )}

      {tab === 'silver' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {([
              ['Total Revenue', inr(data.kpis.revenue), 'navy', Gem],
              ['Items Sold', String(data.topProducts.reduce((s, p) => s + p.qty_sold, 0)), 'green', Package],
              ['Orders', String(data.kpis.orders), 'blue', ShoppingBag],
              ['Return Value', inr(data.kpis.returnsValue), 'orange', AlertTriangle],
            ] as const).map(([label, val, color, Icon]) => {
              const IconComponent = Icon as ComponentType<{ size?: number }>;
              return <div key={label} className={`rounded-lg p-3 text-white shadow-sm bg-${color}`}><div className="mb-2 flex items-center justify-between"><span className="text-[9px] font-medium">{label}</span><IconComponent size={14} /></div><p className="text-sm font-bold">{val}</p></div>;
            })}
          </div>
          <Panel title="Category-wise Revenue" icon={Gem}>
            <table className="w-full text-[11px]"><thead className="bg-slate-50 text-[9px] uppercase text-slate-400"><tr><th className="px-3 py-2.5 text-left font-bold">Category</th><th className="text-right">Revenue</th><th className="text-right">Share</th></tr></thead>
              <tbody>{categoryAnalysis.map(([cat, d]) => <tr key={cat} className="border-t border-slate-50"><td className="px-3 py-2.5"><Badge color="violet">{cat}</Badge></td><td className="px-3 py-2.5 text-right font-bold">{inr(d.revenue)}</td><td className="px-3 py-2.5 text-right text-slate-500">{data.kpis.revenue ? ((d.revenue / data.kpis.revenue) * 100).toFixed(1) : 0}%</td></tr>)}</tbody>
            </table>
            {categoryAnalysis.length === 0 && <EmptyState message="No weight data" />}
          </Panel>
        </div>
      )}
    </div>
  );
}