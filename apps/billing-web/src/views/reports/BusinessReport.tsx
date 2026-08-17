import { useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import { TrendingUp, ShoppingBag, Wallet, Receipt, Users, Package, Download, ArrowUpRight, ArrowDownLeft, Percent, Building2, Store, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { inr } from '@/lib/supabase';
import { Panel, EmptyState } from '@/components/ui';

type BusinessReportResponse = {
  period: { from: string; to: string; previous: { from: string; to: string } };
  current: {
    sales: number;
    orders: number;
    collected: number;
    netSales: number;
    returns: number;
    returnsCount: number;
    purchases: number;
    purchaseOrders: number;
    expenses: number;
    expenseCount: number;
    shopifySales: number;
    shopifyOrders: number;
  };
  previous: {
    sales: number;
    orders: number;
    collected: number;
    netSales: number;
    returns: number;
    returnsCount: number;
    purchases: number;
    purchaseOrders: number;
    expenses: number;
    expenseCount: number;
    shopifySales: number;
    shopifyOrders: number;
  };
  comparison: { metric: string; current: number; previous: number; changePct: number }[];
  receivables: number;
  payables: number;
  activeCustomers: number;
  totalCustomers: number;
  activeSuppliers: number;
  totalSuppliers: number;
  inventory: { products: number; stockQty: number; totalWeight: number; value: number };
  expenseByCategory: { category: string; count: number; amount: number }[];
  purchaseBySupplier: { supplier: string; invoices: number; purchases: number }[];
  syncStatus: Record<string, number>;
};

type PeriodOption = 'Today' | 'Week' | 'Month' | 'Year' | 'Custom';

export default function BusinessReport({ permissions }: { permissions: string[] }) {
  const can = (perm: string) => permissions.includes('*') || permissions.includes(perm);
  const [period, setPeriod] = useState<PeriodOption>('Month');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [data, setData] = useState<BusinessReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { load(); }, [period, fromDate, toDate]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      const { from, to } = periodRange(period, fromDate, toDate);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await api<BusinessReportResponse>(`/api/reports/business?${params.toString()}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load business report');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(() => {
    if (!data) return null;
    const c = data.current;
    const grossProfit = c.sales - c.purchases - c.expenses;
    return {
      sales: c.sales,
      orders: c.orders,
      netSales: c.netSales,
      returns: c.returns,
      returnsCount: c.returnsCount,
      purchases: c.purchases,
      purchaseOrders: c.purchaseOrders,
      expenses: c.expenses,
      expenseCount: c.expenseCount,
      grossProfit,
      receivables: data.receivables,
      payables: data.payables,
      inventoryValue: data.inventory.value,
      stockQty: data.inventory.stockQty,
      margin: c.sales ? (grossProfit / c.sales) * 100 : 0,
      shopifySales: c.shopifySales,
      shopifyOrders: c.shopifyOrders,
    };
  }, [data]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-slate-500">Loading business report...</div>;
  }

  if (!can('reports.business.view')) {
    return <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-[11px] text-amber-800">You do not have permission to view the Business Report.</div>;
  }

  if (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>;
  }

  if (!data || !stats) return null;

  const totalExpenseCat = data.expenseByCategory.reduce((s, e) => s + e.amount, 0);
  const totalPurchaseSup = data.purchaseBySupplier.reduce((s, p) => s + p.purchases, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(['Today', 'Week', 'Month', 'Year', 'Custom'] as PeriodOption[]).map((p) => (
          <button key={p} onClick={() => setPeriod(p)} className={`rounded-md px-3 py-1.5 text-[10px] font-bold ${period === p ? 'bg-[#4714a1] text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{p}</button>
        ))}
        {period === 'Custom' && <>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[10px] outline-none" />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[10px] outline-none" />
        </>}
        <button onClick={load} className="ml-auto flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"><Download size={14} /> Generate</button>
        {can('reports.business.export') && <button className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"><Download size={14} /> Export Report</button>}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
        {([
          ['Revenue', inr(stats.sales), 'green', ShoppingBag],
          ['Purchases', inr(stats.purchases), 'navy', Receipt],
          ['Expenses', inr(stats.expenses), 'rose', Wallet],
          ['Gross Profit', inr(stats.grossProfit), 'violet', TrendingUp],
          ['Receivables', inr(stats.receivables), 'orange', ArrowDownLeft],
          ['Payables', inr(stats.payables), 'cyan', ArrowUpRight],
          ['Stock Value', inr(stats.inventoryValue), 'blue', Package],
          ['Profit Margin', `${stats.margin.toFixed(1)}%`, 'teal', Percent],
        ] as const).map(([label, val, color, Icon]) => {
          const IconComponent = Icon as ComponentType<{ size?: number }>;
          return <div key={label} className={`rounded-lg p-3 text-white shadow-sm bg-${color}`}><div className="mb-2 flex items-center justify-between"><span className="text-[9px] font-medium">{label}</span><IconComponent size={14} /></div><p className="text-sm font-bold">{val}</p></div>;
        })}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
        {([
          ['Active Customers', String(data.activeCustomers), Users],
          ['Total Customers', String(data.totalCustomers), Users],
          ['Active Suppliers', String(data.activeSuppliers), Building2],
          ['Total Suppliers', String(data.totalSuppliers), Building2],
          ['Products', String(data.inventory.products), Package],
          ['Stock Items', String(data.inventory.stockQty), Package],
        ] as const).map(([label, val, Icon]) => {
          const IconComponent = Icon as ComponentType<{ size?: number }>;
          return <div key={label} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-4 shadow-sm"><div><p className="text-[9px] font-semibold text-slate-500">{label}</p><p className="mt-2 text-base font-bold">{val}</p></div><div className="grid h-8 w-8 place-items-center rounded-lg bg-purple-50 text-[#6f39bd]"><IconComponent size={16} /></div></div>;
        })}
      </div>

      <Panel title="Business Comparison" icon={TrendingUp}>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400">
              <tr>{['Metric', `This Period (${data.period.from} → ${data.period.to})`, `Last Period (${data.period.previous.from} → ${data.period.previous.to})`, 'Change'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.comparison.map((row) => (
                <tr key={row.metric} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="px-3 py-2.5 font-bold">{row.metric}</td>
                  <td className="px-3 py-2.5">{inr(row.current)}</td>
                  <td className="px-3 py-2.5 text-slate-500">{inr(row.previous)}</td>
                  <td className={`px-3 py-2.5 font-bold ${row.changePct >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{row.changePct >= 0 ? '+' : ''}{row.changePct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="Expense Analysis" icon={Wallet}>
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400">
              <tr>{['Category', 'Count', 'Amount', 'Share'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.expenseByCategory.map((e) => (
                <tr key={e.category} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="px-3 py-2.5 font-bold text-[#5419b5]">{e.category}</td>
                  <td className="px-3 py-2.5 text-slate-500">{e.count}</td>
                  <td className="px-3 py-2.5 font-bold">{inr(e.amount)}</td>
                  <td className="px-3 py-2.5"><div className="flex items-center gap-2"><div className="h-1.5 w-20 rounded-full bg-slate-100"><div className="h-full rounded-full bg-rose-500" style={{ width: `${totalExpenseCat ? (e.amount / totalExpenseCat * 100) : 0}%` }} /></div><span className="text-[9px] text-slate-400">{totalExpenseCat ? ((e.amount / totalExpenseCat) * 100).toFixed(1) : 0}%</span></div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.expenseByCategory.length === 0 && <EmptyState message="No expenses in this period" />}
        </Panel>

        <Panel title="Purchase Analysis by Supplier" icon={Receipt}>
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400">
              <tr>{['Supplier', 'Invoices', 'Purchases', 'Share'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.purchaseBySupplier.map((p) => (
                <tr key={p.supplier} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="px-3 py-2.5 font-bold text-[#5419b5]">{p.supplier}</td>
                  <td className="px-3 py-2.5 text-slate-500">{p.invoices}</td>
                  <td className="px-3 py-2.5 font-bold">{inr(p.purchases)}</td>
                  <td className="px-3 py-2.5"><div className="flex items-center gap-2"><div className="h-1.5 w-20 rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#4714a1]" style={{ width: `${totalPurchaseSup ? (p.purchases / totalPurchaseSup * 100) : 0}%` }} /></div><span className="text-[9px] text-slate-400">{totalPurchaseSup ? ((p.purchases / totalPurchaseSup) * 100).toFixed(1) : 0}%</span></div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.purchaseBySupplier.length === 0 && <EmptyState message="No purchases in this period" />}
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="Shopify vs Internal" icon={Store}>
          <div className="space-y-3 py-2">
            {([
              ['Shopify Sales', stats.shopifySales, 'bg-violet-500'],
              ['Shopify Orders', stats.shopifyOrders, 'bg-purple-500'],
            ] as const).map(([label, val, color]) => {
              const maxVal = Math.max(stats.sales, 1);
              const pct = (Number(val) / maxVal) * 100;
              return <div key={label}>
                <div className="mb-1 flex justify-between text-[10px]"><span className="font-semibold text-slate-600">{label}</span><b>{typeof val === 'number' && label.includes('Sales') ? inr(val) : val}</b></div>
                <div className="h-3 rounded-full bg-slate-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} /></div>
              </div>;
            })}
            <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500"><RefreshCw size={12} /> {data.syncStatus.success || 0} successful · {data.syncStatus.failed || 0} failed syncs</div>
          </div>
        </Panel>

        <Panel title="Inventory Overview" icon={Package}>
          <div className="grid grid-cols-2 gap-3 text-[11px] md:grid-cols-4">
            {([
              ['Products', String(data.inventory.products)],
              ['Stock Qty', String(data.inventory.stockQty)],
              ['Total Weight (g)', String(Math.round(data.inventory.totalWeight))],
              ['Stock Value', inr(data.inventory.value)],
            ] as const).map(([label, val]) => <div key={label} className="rounded-lg border border-slate-100 p-3"><p className="text-[9px] text-slate-500">{label}</p><p className="mt-1 text-sm font-bold">{val}</p></div>)}
          </div>
        </Panel>
      </div>

      <Panel title="Profit Breakdown" icon={Wallet}>
        <div className="grid grid-cols-2 gap-3 text-[11px] md:grid-cols-4">
          {([
            ['Revenue', inr(stats.sales), 'text-emerald-600'],
            ['Purchases', `- ${inr(stats.purchases)}`, 'text-[#4714a1]'],
            ['Expenses', `- ${inr(stats.expenses)}`, 'text-rose-500'],
            ['Gross Profit', inr(stats.grossProfit), stats.grossProfit >= 0 ? 'text-emerald-600' : 'text-rose-500'],
          ] as const).map(([label, val, color]) => <div key={label} className="rounded-lg border border-slate-100 p-3"><p className="text-[9px] text-slate-500">{label}</p><p className={`mt-1 text-sm font-bold ${color}`}>{val}</p></div>)}
        </div>
      </Panel>
    </div>
  );
}

function periodRange(period: PeriodOption, fromDate: string, toDate: string): { from: string; to: string } {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  if (period === 'Today') return { from: todayStr, to: todayStr };
  if (period === 'Week') { const d = new Date(today); d.setDate(d.getDate() - 7); return { from: d.toISOString().slice(0, 10), to: todayStr }; }
  if (period === 'Month') { const d = new Date(today); d.setDate(d.getDate() - 30); return { from: d.toISOString().slice(0, 10), to: todayStr }; }
  if (period === 'Year') { const d = new Date(today); d.setDate(d.getDate() - 365); return { from: d.toISOString().slice(0, 10), to: todayStr }; }
  return { from: fromDate, to: toDate };
}