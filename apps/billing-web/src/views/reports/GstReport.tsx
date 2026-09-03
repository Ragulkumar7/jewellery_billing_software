import { useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import { Download, Printer, FileText, Percent, TrendingUp, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { inr } from '@/lib/currency';
import { Panel, EmptyState } from '@/components/ui';

type GstReportResponse = {
  summary: {
    salesTaxable: number;
    salesCgst: number;
    salesSgst: number;
    salesIgst: number;
    salesTotalGst: number;
    purchaseTaxable: number;
    purchaseCgst: number;
    purchaseSgst: number;
    purchaseIgst: number;
    purchaseTotalGst: number;
    netGst: number;
  };
  sales: { invoice_number: string; invoice_date: string; party: string; taxable_value: number; discount: number; gst_amount: number; grand_total: number; status: string }[];
  purchases: { pi_number: string; pi_date: string; party: string; taxable_value: number; discount: number; gst_amount: number; grand_total: number; status: string }[];
};

export default function GstReport({ permissions }: { permissions: string[] }) {
  const can = (perm: string) => permissions.includes('*') || permissions.includes(perm);
  const [tab, setTab] = useState<'sales' | 'purchase' | 'summary'>('summary');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [data, setData] = useState<GstReportResponse | null>(null);
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
      const res = await api<GstReportResponse>(`/api/reports/gst?${params.toString()}`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load GST report');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const summary = useMemo(() => data?.summary || null, [data]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-slate-500">Loading GST report...</div>;
  }

  if (!can('reports.gst.view')) {
    return <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-[11px] text-amber-800">You do not have permission to view the GST Report.</div>;
  }

  if (error) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>;
  }

  if (!data || !summary) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(['summary', 'sales', 'purchase'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1.5 text-[10px] font-bold capitalize ${tab === t ? 'bg-[#4714a1] text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{t === 'sales' ? 'Sales GST' : t === 'purchase' ? 'Purchase GST' : 'Summary'}</button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[10px] outline-none" />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[10px] outline-none" />
          <button onClick={load} className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"><Download size={14} /> Generate</button>
          {can('reports.gst.export') && <><button className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"><Printer size={14} /> Print</button>
          <button className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"><Download size={14} /> Export</button></>}
        </div>
      </div>

      {tab === 'summary' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {([
              ['Taxable Sales', inr(summary.salesTaxable), 'green', TrendingUp],
              ['Output GST', inr(summary.salesTotalGst), 'blue', ArrowUpRight],
              ['Taxable Purchases', inr(summary.purchaseTaxable), 'navy', FileText],
              ['Input GST', inr(summary.purchaseTotalGst), 'violet', ArrowDownLeft],
              ['Net GST Position', inr(summary.netGst), summary.netGst >= 0 ? 'orange' : 'green', Percent],
            ] as const).map(([label, val, color, Icon]) => {
              const IconComponent = Icon as ComponentType<{ size?: number }>;
              return <div key={label} className={`rounded-lg p-3 text-white shadow-sm bg-${color}`}><div className="mb-2 flex items-center justify-between"><span className="text-[9px] font-medium">{label}</span><IconComponent size={14} /></div><p className="text-sm font-bold">{val}</p></div>;
            })}
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <Panel title="Sales Tax Summary" icon={FileText}>
              <div className="space-y-2 text-[11px]">
                {([['Sales Taxable Value', inr(summary.salesTaxable)], ['CGST', inr(summary.salesCgst)], ['SGST', inr(summary.salesSgst)], ['IGST', inr(summary.salesIgst)], ['Total Output GST', inr(summary.salesTotalGst)]] as const).map(([k, v]) => <div key={k} className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">{k}</span><b>{v}</b></div>)}
              </div>
            </Panel>
            <Panel title="Purchase Tax Summary" icon={FileText}>
              <div className="space-y-2 text-[11px]">
                {([['Purchase Taxable Value', inr(summary.purchaseTaxable)], ['Input CGST', inr(summary.purchaseCgst)], ['Input SGST', inr(summary.purchaseSgst)], ['Input IGST', inr(summary.purchaseIgst)], ['Total Input GST', inr(summary.purchaseTotalGst)]] as const).map(([k, v]) => <div key={k} className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">{k}</span><b>{v}</b></div>)}
              </div>
            </Panel>
          </div>

          <Panel title="GST Summary Comparison" icon={Percent}>
            <div className="space-y-3 py-2">
              {([['Output GST (Sales)', summary.salesTotalGst, 'bg-blue-500'], ['Input GST (Purchases)', summary.purchaseTotalGst, 'bg-violet-500'], ['Net GST Payable', summary.netGst, summary.netGst >= 0 ? 'bg-orange-500' : 'bg-emerald-500']] as const).map(([label, val, color]) => {
                const maxVal = Math.max(summary.salesTotalGst, summary.purchaseTotalGst, Math.abs(summary.netGst), 1);
                const pct = (Math.abs(val) / maxVal) * 100;
                return <div key={label}>
                  <div className="mb-1 flex justify-between text-[10px]"><span className="font-semibold text-slate-600">{label}</span><b>{inr(val)}</b></div>
                  <div className="h-3 rounded-full bg-slate-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} /></div>
                </div>;
              })}
            </div>
          </Panel>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[10px] text-amber-800">
            <b>Disclaimer:</b> The exact GST reporting format and compliance requirements should be validated against your business's accountant or tax advisor before filing. This report is for informational purposes only.
          </div>
        </div>
      )}

      {tab === 'sales' && (
        <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-bold">Sales GST</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400">
                <tr>{['Invoice #', 'Date', 'Customer', 'Taxable Amount', 'CGST', 'SGST', 'IGST', 'Total GST', 'Invoice Total'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {data.sales.map((s) => {
                  const halfGst = s.gst_amount / 2;
                  return <tr key={s.invoice_number} className="border-t border-slate-50 hover:bg-slate-50/50">
                    <td className="px-3 py-2.5 font-bold text-[#5419b5]">{s.invoice_number}</td>
                    <td className="px-3 py-2.5 text-slate-500">{s.invoice_date}</td>
                    <td className="px-3 py-2.5 text-slate-500">{s.party}</td>
                    <td className="px-3 py-2.5 font-bold">{inr(s.taxable_value)}</td>
                    <td className="px-3 py-2.5 text-slate-500">{inr(halfGst)}</td>
                    <td className="px-3 py-2.5 text-slate-500">{inr(halfGst)}</td>
                    <td className="px-3 py-2.5 text-slate-400">—</td>
                    <td className="px-3 py-2.5 font-bold text-blue-600">{inr(s.gst_amount)}</td>
                    <td className="px-3 py-2.5 font-bold">{inr(s.grand_total)}</td>
                  </tr>;
                })}
              </tbody>
            </table>
            {data.sales.length === 0 && <EmptyState message="No sales invoices found" />}
          </div>
        </div>
      )}

      {tab === 'purchase' && (
        <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-bold">Purchase GST</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400">
                <tr>{['Purchase Invoice', 'Supplier', 'Date', 'Taxable Amount', 'CGST', 'SGST', 'IGST', 'Total GST', 'Invoice Total'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {data.purchases.map((p) => {
                  const halfGst = p.gst_amount / 2;
                  return <tr key={p.pi_number} className="border-t border-slate-50 hover:bg-slate-50/50">
                    <td className="px-3 py-2.5 font-bold text-[#5419b5]">{p.pi_number}</td>
                    <td className="px-3 py-2.5 text-slate-500">{p.party}</td>
                    <td className="px-3 py-2.5 text-slate-500">{p.pi_date}</td>
                    <td className="px-3 py-2.5 font-bold">{inr(p.taxable_value)}</td>
                    <td className="px-3 py-2.5 text-slate-500">{inr(halfGst)}</td>
                    <td className="px-3 py-2.5 text-slate-500">{inr(halfGst)}</td>
                    <td className="px-3 py-2.5 text-slate-400">—</td>
                    <td className="px-3 py-2.5 font-bold text-violet-600">{inr(p.gst_amount)}</td>
                    <td className="px-3 py-2.5 font-bold">{inr(p.grand_total)}</td>
                  </tr>;
                })}
              </tbody>
            </table>
            {data.purchases.length === 0 && <EmptyState message="No purchase invoices found" />}
          </div>
        </div>
      )}
    </div>
  );
}