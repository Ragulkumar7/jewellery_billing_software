import { useEffect, useState } from 'react';
import { Search, Wallet, FileText, TrendingUp, CircleDollarSign, Receipt, X, CheckCircle2, ArrowRight, Ban, Eye } from 'lucide-react';
import { inr } from '@/lib/currency';
import { Badge, EmptyState, statusColor } from '@/components/ui';
import { api } from '@/lib/api';

type Permissions = string[];

type PurchaseInvoice = {
  id: string;
  pi_number: string;
  supplier_invoice_number?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  pi_date: string;
  due_date?: string | null;
  po_number?: string | null;
  grn_number?: string | null;
  status: string;
  payment_status: string;
  subtotal: number;
  discount: number;
  gst_amount: number;
  round_off: number;
  grand_total: number;
  amount_paid: number;
  outstanding_balance: number;
  notes?: string | null;
  created_at?: string;
};

type PIItemRow = { id: string; name: string; sku?: string | null; quantity: number; unit_cost: number; line_total: number; gst_rate: number };
type PaymentRow = { id: string; payment_number: string; amount: number; payment_method: string; payment_date?: string | null; created_at?: string };
type PIDetailData = { invoice: PurchaseInvoice; items: PIItemRow[]; payments: PaymentRow[] };

export default function PurchaseSystem({ permissions, onNavigate }: { permissions: Permissions; onNavigate: (v: string) => void }) {
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [search, setSearch] = useState('');
  const [payFilter, setPayFilter] = useState('All');
  const [selected, setSelected] = useState<PIDetailData | null>(null);

  const can = (perm: string) => permissions.includes('*') || permissions.includes(perm);

  async function load() {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (search) params.set('q', search);
      if (payFilter !== 'All') params.set('payment', payFilter);
      setInvoices(await api<PurchaseInvoice[]>(`/api/accounts/purchase-system?${params.toString()}`));
    } catch { setInvoices([]); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [search, payFilter]);

  async function openDetail(id: string) {
    try { setSelected(await api<PIDetailData>(`/api/accounts/purchase-system/${id}`)); } catch { /* keep list */ }
  }

  const totalInvoiced = invoices.filter((i) => i.status !== 'Cancelled').reduce((s, i) => s + i.grand_total, 0);
  const totalPaid = invoices.filter((i) => i.status !== 'Cancelled').reduce((s, i) => s + i.amount_paid, 0);
  const totalOutstanding = invoices.filter((i) => !['Paid', 'Cancelled'].includes(i.status)).reduce((s, i) => s + i.outstanding_balance, 0);
  const totalGst = invoices.filter((i) => i.status !== 'Cancelled').reduce((s, i) => s + i.gst_amount, 0);

  if (selected) return <InvoiceDetail permissions={permissions} data={selected} onBack={() => { setSelected(null); load(); }} onRefresh={setSelected} onNavigate={onNavigate} />;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-4">
        {[
          ['Total Invoiced', inr(totalInvoiced), 'navy', Receipt],
          ['Total Paid', inr(totalPaid), 'green', CircleDollarSign],
          ['Outstanding Payable', inr(totalOutstanding), 'orange', Wallet],
          ['GST Paid', inr(totalGst), 'blue', TrendingUp],
        ].map(([label, val, color, Icon]) => {
          const I = Icon as typeof Receipt;
          return <div key={label as string} className={`rounded-lg p-3 text-white shadow-sm bg-${color as string}`}><div className="mb-2 flex items-center justify-between"><span className="text-[9px] font-medium">{label as string}</span><I size={14} /></div><p className="text-sm font-bold">{val as string}</p></div>;
        })}
      </div>

      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-bold">Purchase Invoices — Financial View</p>
          <div className="flex items-center gap-2">
            <div className="flex h-8 items-center gap-2 rounded-md bg-slate-50 px-3 text-slate-400"><Search size={14} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search invoice, supplier..." className="w-44 bg-transparent text-xs outline-none" /></div>
            <select value={payFilter} onChange={(e) => setPayFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">
              {['All', 'Unpaid', 'Partially Paid', 'Paid'].map((s) => <option key={s}>{s}</option>)}
            </select>
            {can('accounts.purchase.export') && <button onClick={exportCsv} className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"><FileText size={14} /> Export</button>}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400">
              <tr>{['Purchase Invoice', 'Supplier', 'Invoice Date', 'Invoice Amount', 'GST', 'Paid Amount', 'Outstanding', 'Due Date', 'Payment Status', 'Actions'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="px-3 py-2.5 font-bold text-[#5419b5]">{i.pi_number}</td>
                  <td className="px-3 py-2.5 font-bold">{i.supplier_name || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500">{i.pi_date}</td>
                  <td className="px-3 py-2.5 font-bold">{inr(i.grand_total)}</td>
                  <td className="px-3 py-2.5 text-slate-500">{inr(i.gst_amount)}</td>
                  <td className="px-3 py-2.5 text-emerald-600">{inr(i.amount_paid)}</td>
                  <td className="px-3 py-2.5"><span className={i.outstanding_balance > 0 ? 'font-bold text-orange-600' : 'text-slate-400'}>{inr(i.outstanding_balance)}</span></td>
                  <td className="px-3 py-2.5 text-slate-500">{i.due_date || '—'}</td>
                  <td className="px-3 py-2.5"><Badge color={statusColor(i.payment_status)}>{i.payment_status}</Badge></td>
                  <td className="px-3 py-2.5"><div className="flex items-center gap-1">
                    <button onClick={() => openDetail(i.id)} className="grid h-6 w-6 place-items-center rounded bg-slate-100 text-slate-500 hover:bg-slate-200" title="View"><Eye size={12} /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {invoices.length === 0 && <EmptyState message="No purchase invoices found" />}
        </div>
      </div>
    </div>
  );

  function exportCsv() {
    const header = ['PI Number', 'Supplier', 'Invoice Date', 'Due Date', 'Invoice Amount', 'GST', 'Paid', 'Outstanding', 'Payment Status'];
    const lines = invoices.map((i) => [i.pi_number, i.supplier_name || '', i.pi_date, i.due_date || '', i.grand_total, i.gst_amount, i.amount_paid, i.outstanding_balance, i.payment_status].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'purchase-system.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
}

function InvoiceDetail({ permissions, data, onBack, onRefresh, onNavigate }: { permissions: Permissions; data: PIDetailData; onBack: () => void; onRefresh: (d: PIDetailData) => void; onNavigate: (v: string) => void }) {
  const { invoice, items, payments } = data;
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showPay, setShowPay] = useState(false);
  const [payAmount, setPayAmount] = useState(invoice.outstanding_balance);
  const [payMethod, setPayMethod] = useState('Cash');

  const can = (perm: string) => permissions.includes('*') || permissions.includes(perm);

  async function refresh() {
    try { onRefresh(await api<PIDetailData>(`/api/accounts/purchase-system/${invoice.id}`)); } catch { /* keep */ }
  }

  async function recordPayment() {
    if (!payAmount || payAmount <= 0) { setToast('Enter a payment amount'); return; }
    setBusy('pay');
    try {
      await api(`/api/purchase-invoices/${invoice.id}/payment`, { method: 'POST', body: JSON.stringify({ amount: payAmount, method: payMethod, notes: null }) });
      setShowPay(false);
      setToast('Payment recorded');
      await refresh();
    } catch (error) { setToast('Error: ' + (error instanceof Error ? error.message : 'Unable to record payment')); }
    setBusy(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3"><button onClick={onBack} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">←</button><h2 className="text-base font-bold">{invoice.pi_number}</h2><Badge color={statusColor(invoice.payment_status)}>{invoice.payment_status}</Badge></div>
      </div>
      <div className="grid gap-3 xl:grid-cols-[1fr_280px]">
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-4"><div><p className="text-sm font-bold">Opal Line Jewelry</p><p className="text-[9px] text-slate-400">Purchase Invoice — Financial View</p></div><div className="text-right"><p className="text-[10px] font-bold">{invoice.pi_number}</p><p className="text-[10px] text-slate-400">{invoice.pi_date}</p></div></div>
          <div className="mb-4 flex justify-between text-[11px]"><div><p className="text-[9px] font-bold uppercase text-slate-400">Supplier</p><p className="mt-1 font-bold">{invoice.supplier_name || '—'}</p><p className="text-slate-500">Inv: {invoice.supplier_invoice_number || '—'}</p></div><div className="text-right"><p className="text-[9px] font-bold uppercase text-slate-400">Due Date</p><p className="mt-1 font-bold">{invoice.due_date || '—'}</p><p className="text-slate-500">PO: {invoice.po_number || '—'} · GRN: {invoice.grn_number || '—'}</p></div></div>
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-[9px] uppercase text-slate-400"><tr>{['Item', 'Qty', 'Unit Cost', 'GST', 'Line Total'].map((h) => <th key={h} className="px-2 py-2 text-left font-bold">{h}</th>)}</tr></thead>
            <tbody>{items.map((it) => (<tr key={it.id} className="border-t border-slate-50"><td className="px-2 py-2 font-semibold">{it.name}<p className="text-[9px] text-slate-400">{it.sku}</p></td><td className="px-2 py-2">{it.quantity}</td><td className="px-2 py-2 font-bold">{inr(it.unit_cost)}</td><td className="px-2 py-2 text-slate-500">{it.gst_rate}%</td><td className="px-2 py-2 font-bold">{inr(it.line_total)}</td></tr>))}</tbody>
          </table>
          <div className="mt-4 ml-auto w-56 space-y-1.5 text-[11px]">
            <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{inr(invoice.subtotal)}</span></div>
            <div className="flex justify-between text-slate-500"><span>Discount</span><span>-{inr(invoice.discount)}</span></div>
            <div className="flex justify-between text-slate-500"><span>GST</span><span>{inr(invoice.gst_amount)}</span></div>
            <div className="flex justify-between text-slate-500"><span>Round Off</span><span>{inr(invoice.round_off)}</span></div>
            <div className="flex justify-between border-t border-slate-100 pt-1.5 text-sm font-bold"><span>Grand Total</span><span className="text-[#5419b5]">{inr(invoice.grand_total)}</span></div>
            <div className="flex justify-between text-slate-500"><span>Amount Paid</span><span>{inr(invoice.amount_paid)}</span></div>
            <div className="flex justify-between font-bold text-orange-600"><span>Outstanding</span><span>{inr(invoice.outstanding_balance)}</span></div>
          </div>
          {payments.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[10px] font-bold uppercase text-slate-400">Payments</p>
              <div className="space-y-1.5">{payments.map((p) => <div key={p.id} className="flex items-center justify-between rounded-md bg-slate-50 p-2 text-[10px]"><span className="font-bold">{p.payment_number}</span><span className="text-slate-500">{p.payment_method} · {p.payment_date || String(p.created_at || '').slice(0, 10)}</span><b>{inr(p.amount)}</b></div>)}</div>
            </div>
          )}
          {invoice.notes && <p className="mt-4 rounded-md bg-slate-50 p-2 text-[10px] text-slate-500">{invoice.notes}</p>}
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
            <p className="border-b border-slate-100 px-4 py-3 text-xs font-bold">Actions</p>
            <div className="grid grid-cols-1 gap-2 p-3">
              {['Approved', 'Partially Paid', 'Unpaid'].includes(invoice.status) && invoice.outstanding_balance > 0 && can('accounts.payment.create') && (
                <button onClick={() => { setPayAmount(invoice.outstanding_balance); setShowPay(true); }} className="flex items-center justify-center gap-1.5 rounded-md bg-[#4714a1] py-2.5 text-[10px] font-bold text-white hover:bg-[#5419b5]"><Wallet size={13} /> Record Payment</button>
              )}
              <button onClick={() => onNavigate('Payments')} className="flex items-center justify-center gap-1.5 rounded-md border border-slate-200 py-2.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50"><CircleDollarSign size={13} /> All Payments</button>
              <button onClick={() => onNavigate('Ledger')} className="flex items-center justify-center gap-1.5 rounded-md border border-slate-200 py-2.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50"><ArrowRight size={13} /> View Ledger</button>
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
            <p className="border-b border-slate-100 px-4 py-3 text-xs font-bold">Payment Summary</p>
            <div className="space-y-2 p-3 text-[10px]">
              {[['Invoice Amount', inr(invoice.grand_total)], ['GST', inr(invoice.gst_amount)], ['Paid', inr(invoice.amount_paid)], ['Outstanding', inr(invoice.outstanding_balance)]].map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-slate-500">{k}</span><b>{v}</b></div>)}
            </div>
          </div>
        </div>
      </div>

      {showPay && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => setShowPay(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold"><Wallet size={14} className="mr-1 inline text-[#5419b5]" />Record Payment</p><button onClick={() => setShowPay(false)}><X size={16} /></button></div>
            <div className="space-y-3">
              <div><label className="text-[9px] font-bold uppercase text-slate-400">Amount</label><input type="number" min={1} max={invoice.outstanding_balance} value={payAmount} onChange={(e) => setPayAmount(Math.min(invoice.outstanding_balance, Math.max(1, +e.target.value)))} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-[11px] font-bold outline-none" /></div>
              <div><label className="text-[9px] font-bold uppercase text-slate-400">Method</label><select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 text-[11px] outline-none">{['Cash', 'Bank Transfer', 'Cheque', 'UPI', 'Card'].map((m) => <option key={m}>{m}</option>)}</select></div>
              <p className="rounded-md bg-slate-50 p-2 text-[10px] text-slate-500">Outstanding after: <b className="text-orange-600">{inr(Math.max(0, invoice.outstanding_balance - payAmount))}</b></p>
              <button onClick={recordPayment} disabled={!!busy} className="w-full rounded-md bg-[#4714a1] py-2.5 text-[11px] font-bold text-white hover:bg-[#5419b5] disabled:opacity-50">{busy === 'pay' ? 'Recording...' : 'Record Payment'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-[#1d2945] px-4 py-3 text-xs font-semibold text-white shadow-xl">{toast}</div>}
    </div>
  );
}
