import { useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import { Search, Download, Printer, Eye, TrendingUp, ShoppingBag, Wallet, Percent, RotateCcw, Receipt } from 'lucide-react';
import { api } from '@/lib/api';
import { inr } from '@/lib/supabase';
import { Badge, EmptyState, Panel, statusColor } from '@/components/ui';

type SalesReportResponse = {
  summary: {
    grossSales: number;
    discounts: number;
    tax: number;
    netSales: number;
    grandTotal: number;
    invoiceCount: number;
    itemsSold: number;
    paid: number;
    outstanding: number;
    returns: number;
    returnsCount: number;
    refunds: number;
    refundsCount: number;
    avgInvoice: number;
  };
  invoices: {
    id: string;
    invoice_number: string;
    invoice_date: string;
    customer_name: string;
    customer_id: string;
    status: string;
    payment_status: string;
    payment_method: string | null;
    source: string | null;
    subtotal: number;
    discount: number;
    gst_amount: number;
    grand_total: number;
    amount_paid: number;
    outstanding_balance: number;
    silver_rate: number;
    salesperson: string | null;
    item_count: number;
    items_sold: number;
  }[];
  productPerformance: { name: string; sku: string; qty_sold: number; sales: number; weight_sold: number }[];
  categoryPerformance: { category: string; qty_sold: number; sales: number }[];
  customerPerformance: { customer: string; orders: number; total_sales: number }[];
  sourcePerformance: { source: string | null; orders: number; sales: number }[];
};

type SalesRow = {
  invoice: SalesReportResponse['invoices'][0];
  items: { name: string; quantity: number; line_total: number }[];
};

export default function SalesReport({ permissions, onNavigate }: { permissions: string[]; onNavigate: (v: string) => void }) {
  const can = (perm: string) => permissions.includes('*') || permissions.includes(perm);
  const [reportData, setReportData] = useState<SalesReportResponse | null>(null);
  const [rows, setRows] = useState<SalesRow[]>([]);
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [payMethod, setPayMethod] = useState('All');
  const [sourceFilter, setSourceFilter] = useState('All');
  const [customerFilter, setCustomerFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [salespersonFilter, setSalespersonFilter] = useState('');
  const [view, setView] = useState<'Daily' | 'Weekly' | 'Monthly' | 'Product' | 'Customer' | 'Category' | 'Salesperson'>('Daily');
  const [selected, setSelected] = useState<SalesReportResponse['invoices'][0] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      if (customerFilter) params.set('customer', customerFilter);
      if (productFilter) params.set('product', productFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (sourceFilter !== 'All') params.set('source', sourceFilter);
      if (statusFilter !== 'All') params.set('invoiceStatus', statusFilter);
      if (payMethod !== 'All') params.set('paymentStatus', payMethod);
      if (salespersonFilter) params.set('salesperson', salespersonFilter);

      const data = await api<SalesReportResponse>(`/api/reports/sales?${params.toString()}`);
      setReportData(data);
      setRows(data.invoices.map(inv => ({ invoice: inv, items: [] })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sales report');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    if (!reportData) return [];
    const q = search.toLowerCase();
    return reportData.invoices.filter((i) => {
      if (q && !i.invoice_number.toLowerCase().includes(q) && !i.customer_name.toLowerCase().includes(q)) return false;
      if (statusFilter !== 'All' && i.status !== statusFilter) return false;
      if (payMethod !== 'All' && i.payment_method !== payMethod) return false;
      if (sourceFilter !== 'All' && i.source !== sourceFilter) return false;
      if (fromDate && i.invoice_date < fromDate) return false;
      if (toDate && i.invoice_date > toDate) return false;
      return true;
    });
  }, [reportData, search, statusFilter, payMethod, sourceFilter, fromDate, toDate]);

  const summary = useMemo(() => {
    if (!reportData) return null;
    return reportData.summary;
  }, [reportData]);

  const breakdown = useMemo(() => {
    if (!reportData) return [];
    const map: Record<string, { count: number; total: number }> = {};

    if (view === 'Product') {
      for (const p of reportData.productPerformance) {
        map[p.name] = { count: p.qty_sold, total: p.sales };
      }
    } else if (view === 'Category') {
      for (const c of reportData.categoryPerformance) {
        map[c.category] = { count: c.qty_sold, total: c.sales };
      }
    } else if (view === 'Customer') {
      for (const c of reportData.customerPerformance) {
        map[c.customer] = { count: c.orders, total: c.total_sales };
      }
    } else if (view === 'Salesperson') {
      for (const inv of filtered) {
        const key = inv.salesperson || 'Unknown';
        if (!map[key]) map[key] = { count: 0, total: 0 };
        map[key].count += 1;
        map[key].total += inv.grand_total;
      }
    } else {
      for (const inv of filtered) {
        let key = '';
        if (view === 'Daily') key = inv.invoice_date;
        else if (view === 'Weekly') { const d = new Date(inv.invoice_date); const w = Math.ceil(d.getDate() / 7); key = `Week ${w}`; }
        else if (view === 'Monthly') key = inv.invoice_date.slice(0, 7);
        if (key) {
          if (!map[key]) map[key] = { count: 0, total: 0 };
          map[key].count += 1;
          map[key].total += inv.grand_total;
        }
      }
    }
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [reportData, filtered, view]);

  const detailItems = useMemo(() => {
    if (!selected) return [];
    return [];
  }, [selected]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-slate-500">Loading sales report...</div>;
  }

  if (!can('reports.sales.view')) {
    return <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-[11px] text-amber-800">You do not have permission to view the Sales Report.</div>;
  }

  if (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>;
  }

  if (selected) return <InvoiceView invoice={selected} items={detailItems} onBack={() => setSelected(null)} />;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        {summary && (
          [
            ['Total Sales', inr(summary.grossSales), 'navy', ShoppingBag],
            ['Number of Sales', String(summary.invoiceCount), 'blue', Receipt],
            ['Total Tax', inr(summary.tax), 'violet', Percent],
            ['Total Discount', inr(summary.discounts), 'orange', TrendingUp],
            ['Total Returns', inr(summary.returns), 'red', RotateCcw],
            ['Net Sales', inr(summary.netSales), 'green', Wallet],
            ['Avg Invoice', inr(summary.avgInvoice), 'cyan', TrendingUp],
          ] as const
        ).map(([label, val, color, Icon]) => {
          const IconComponent = Icon as ComponentType<{ size?: number }>;
          return <div key={label} className={`rounded-lg p-3 text-white shadow-sm bg-${color}`}><div className="mb-2 flex items-center justify-between"><span className="text-[9px] font-medium">{label}</span><IconComponent size={14} /></div><p className="text-sm font-bold">{val}</p></div>;
        })}
      </div>

      <div className="flex flex-wrap gap-1">
        {['Daily', 'Weekly', 'Monthly', 'Product', 'Customer', 'Category', 'Salesperson'].map((t) => (
          <button key={t} onClick={() => setView(t as typeof view)} className={`rounded-md px-3 py-1.5 text-[10px] font-bold transition ${view === t ? 'bg-[#4714a1] text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{t} Sales</button>
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-[1fr_320px]">
        <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-bold">{view}-wise Sales</p>
            <div className="flex items-center gap-2">
              <div className="flex h-8 items-center gap-2 rounded-md bg-slate-50 px-3 text-slate-400"><Search size={14} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="w-32 bg-transparent text-xs outline-none" /></div>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[10px] outline-none" />
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[10px] outline-none" />
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">
                {['All', 'Draft', 'Paid', 'Partially Paid', 'Unpaid', 'Overdue', 'Cancelled', 'Returned'].map((s) => <option key={s}>{s}</option>)}
              </select>
              <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">
                {['All', 'Cash', 'UPI', 'Card', 'Bank Transfer', 'Mixed', 'Credit'].map((s) => <option key={s}>{s}</option>)}
              </select>
              <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">
                {['All', 'Internal', 'Shopify'].map((s) => <option key={s}>{s}</option>)}
              </select>
              <button onClick={load} className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"><Download size={14} /> Generate</button>
              {can('reports.sales.export') && <button className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"><Download size={14} /> Export</button>}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400">
                <tr>{[view === 'Product' || view === 'Category' ? 'Item' : 'Period / Key', 'Count / Qty', 'Total Amount', 'Share'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {breakdown.map(([key, data]) => {
                  const share = summary?.netSales ? (data.total / summary.netSales * 100).toFixed(1) : '0';
                  return <tr key={key} className="border-t border-slate-50 hover:bg-slate-50/50">
                    <td className="px-3 py-2.5 font-bold text-[#5419b5]">{key}</td>
                    <td className="px-3 py-2.5 text-slate-500">{data.count}</td>
                    <td className="px-3 py-2.5 font-bold">{inr(data.total)}</td>
                    <td className="px-3 py-2.5"><div className="flex items-center gap-2"><div className="h-1.5 w-20 rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#4714a1]" style={{ width: `${share}%` }} /></div><span className="text-[9px] text-slate-400">{share}%</span></div></td>
                  </tr>;
                })}
              </tbody>
            </table>
            {breakdown.length === 0 && <EmptyState message="No sales data for the selected filters" />}
          </div>
        </div>

        <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3 text-xs font-bold">Sales Details</div>
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full text-[10px]">
              <thead className="bg-slate-50 text-[8px] uppercase text-slate-400 sticky top-0">
                <tr>{['Invoice #', 'Date', 'Customer', 'Amount', 'Status', ''].map((h) => <th key={h} className="px-2 py-2 text-left font-bold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {filtered.map((i) => (
                  <tr key={i.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                    <td className="px-2 py-2 font-bold text-[#5419b5]">{i.invoice_number}</td>
                    <td className="px-2 py-2 text-slate-500">{i.invoice_date}</td>
                    <td className="px-2 py-2 text-slate-500 truncate max-w-[80px]">{i.customer_name}</td>
                    <td className="px-2 py-2 font-bold">{inr(i.grand_total)}</td>
                    <td className="px-2 py-2"><Badge color={statusColor(i.payment_status)}>{i.payment_status}</Badge></td>
                    <td className="px-2 py-2"><button onClick={() => setSelected(i)} className="grid h-5 w-5 place-items-center rounded bg-slate-100 text-slate-500 hover:bg-slate-200"><Eye size={10} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <EmptyState message="No invoices" />}
          </div>
        </div>
      </div>
    </div>
  );
}

function InvoiceView({ invoice, items, onBack }: { invoice: SalesReportResponse['invoices'][0]; items: any[]; onBack: () => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">←</button>
        <h2 className="text-base font-bold">{invoice.invoice_number}</h2>
        <Badge color={statusColor(invoice.status)}>{invoice.status}</Badge>
        <div className="ml-auto flex gap-2">
          <button className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"><Printer size={14} /> Print</button>
          <button className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"><Download size={14} /> Download</button>
        </div>
      </div>
      <div className="grid gap-3 xl:grid-cols-[1fr_280px]">
        <Panel title="Invoice Items" icon={Receipt}>
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-[9px] uppercase text-slate-400"><tr>{['Product', 'Purity', 'Gross Wt', 'Net Wt', 'Qty', 'Unit Price', 'Line Total'].map((h) => <th key={h} className="px-2 py-2 text-left font-bold">{h}</th>)}</tr></thead>
            <tbody>
              {items.map((it) => <tr key={it.id} className="border-t border-slate-50"><td className="px-2 py-2 font-semibold">{it.name}<p className="text-[9px] text-slate-400">{it.sku}</p></td><td className="px-2 py-2 text-slate-500">{it.purity}</td><td className="px-2 py-2 text-slate-500">{it.gross_weight}g</td><td className="px-2 py-2 text-slate-500">{it.net_weight}g</td><td className="px-2 py-2">{it.quantity}</td><td className="px-2 py-2 font-bold">{inr(it.unit_price)}</td><td className="px-2 py-2 font-bold">{inr(it.line_total)}</td></tr>)}
            </tbody>
          </table>
          {items.length === 0 && <EmptyState message="No line items" />}
        </Panel>
        <div className="space-y-3">
          <Panel title="Summary" icon={Wallet}>
            <div className="space-y-2 text-[11px]">
              {[['Subtotal', inr(invoice.subtotal + invoice.discount)], ['Discount', `- ${inr(invoice.discount)}`], ['GST', inr(invoice.gst_amount)], ['Grand Total', inr(invoice.grand_total)], ['Paid', inr(invoice.amount_paid)], ['Outstanding', inr(invoice.outstanding_balance)]].map(([k, v]) => <div key={k} className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">{k}</span><b>{v}</b></div>)}
            </div>
          </Panel>
          <Panel title="Invoice Info" icon={TrendingUp}>
            <div className="space-y-2 text-[11px]">
              {[['Date', invoice.invoice_date], ['Salesperson', invoice.salesperson || '—'], ['Payment Method', invoice.payment_method || '—'], ['Source', invoice.source || '—'], ['Payment Status', invoice.payment_status]].map(([k, v]) => <div key={k} className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">{k}</span><b>{v}</b></div>)}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}