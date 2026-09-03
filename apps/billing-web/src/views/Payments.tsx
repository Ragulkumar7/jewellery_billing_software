import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, X, ArrowDownLeft, ArrowUpRight, Download, Wallet, CreditCard, TrendingUp, Ban, Eye } from 'lucide-react';
import { inr } from '@/lib/currency';
import { Badge, EmptyState, statusColor } from '@/components/ui';
import { api } from '@/lib/api';

type Permissions = string[];

type Payment = {
  id: string;
  payment_number: string;
  payment_date: string;
  direction: string;
  payment_type: string;
  party_name?: string | null;
  party_type?: string | null;
  reference?: string | null;
  amount: number;
  payment_method: string;
  status: string;
  notes?: string | null;
  created_by_name?: string | null;
  created_at?: string;
};

const INCOMING_TYPES = ['Customer Payment', 'Invoice Payment', 'Advance Payment', 'Other Receipt'];
const OUTGOING_TYPES = ['Supplier Payment', 'Expense Payment', 'Refund'];
const METHODS = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Cheque', 'Other'];

export default function Payments({ permissions }: { permissions: Permissions }) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [search, setSearch] = useState('');
  const [dirFilter, setDirFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [methodFilter, setMethodFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<Payment | null>(null);

  const can = (perm: string) => permissions.includes('*') || permissions.includes(perm);

  async function load() {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (search) params.set('q', search);
      if (dirFilter !== 'All') params.set('direction', dirFilter);
      if (typeFilter !== 'All') params.set('type', typeFilter);
      if (methodFilter !== 'All') params.set('method', methodFilter);
      if (statusFilter !== 'All') params.set('status', statusFilter);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      setPayments(await api<Payment[]>(`/api/payments?${params.toString()}`));
    } catch { setPayments([]); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [search, dirFilter, typeFilter, methodFilter, statusFilter, fromDate, toDate]);

  const filtered = payments;
  const incoming = filtered.filter((p) => p.direction === 'Incoming' && p.status !== 'Cancelled').reduce((s, p) => s + p.amount, 0);
  const outgoing = filtered.filter((p) => p.direction === 'Outgoing' && p.status !== 'Cancelled').reduce((s, p) => s + p.amount, 0);
  const todayPayments = filtered.filter((p) => p.payment_date === new Date().toISOString().slice(0, 10)).length;
  const pendingPayments = filtered.filter((p) => p.status === 'Pending').length;

  if (selected) return <PaymentDetail permissions={permissions} payment={selected} onBack={() => { setSelected(null); load(); }} onRefresh={setSelected} />;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-4">
        {[
          ['Total Incoming', inr(incoming), 'green', ArrowDownLeft],
          ['Total Outgoing', inr(outgoing), 'rose', ArrowUpRight],
          ['Net Flow', inr(incoming - outgoing), 'blue', TrendingUp],
          ['Today\'s Payments', String(todayPayments), 'orange', Wallet],
        ].map(([label, val, color, Icon]) => {
          const I = Icon as typeof Wallet;
          return <div key={label as string} className={`rounded-lg p-3 text-white shadow-sm bg-${color as string}`}><div className="mb-2 flex items-center justify-between"><span className="text-[9px] font-medium">{label as string}</span><I size={14} /></div><p className="text-sm font-bold">{val as string}</p></div>;
        })}
      </div>

      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-bold">Payments</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-8 items-center gap-2 rounded-md bg-slate-50 px-3 text-slate-400"><Search size={14} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search party, ref..." className="w-32 bg-transparent text-xs outline-none" /></div>
            <select value={dirFilter} onChange={(e) => setDirFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">
              {['All', 'Incoming', 'Outgoing'].map((s) => <option key={s}>{s}</option>)}
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">
              <option>All</option>{[...INCOMING_TYPES, ...OUTGOING_TYPES].map((s) => <option key={s}>{s}</option>)}
            </select>
            <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">
              <option>All</option>{METHODS.map((s) => <option key={s}>{s}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">
              {['All', 'Completed', 'Cancelled'].map((s) => <option key={s}>{s}</option>)}
            </select>
            {can('accounts.payment.create') && <button onClick={() => setShowAdd(true)} className="flex h-8 items-center gap-1.5 rounded-md bg-[#4714a1] px-3 text-[11px] font-bold text-white hover:bg-[#5419b5]"><Plus size={14} /> New Payment</button>}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400">
              <tr>{['Payment #', 'Date', 'Type', 'Direction', 'Party', 'Reference', 'Amount', 'Method', 'Status', 'Notes', 'Actions'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="px-3 py-2.5 font-bold text-[#5419b5]">{p.payment_number}</td>
                  <td className="px-3 py-2.5 text-slate-500">{p.payment_date}</td>
                  <td className="px-3 py-2.5 text-slate-500">{p.payment_type}</td>
                  <td className="px-3 py-2.5">{p.direction === 'Incoming' ? <span className="flex items-center gap-1 text-emerald-600"><ArrowDownLeft size={12} /> In</span> : <span className="flex items-center gap-1 text-red-500"><ArrowUpRight size={12} /> Out</span>}</td>
                  <td className="px-3 py-2.5 font-bold">{p.party_name || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500">{p.reference || '—'}</td>
                  <td className={`px-3 py-2.5 font-bold ${p.direction === 'Incoming' ? 'text-emerald-600' : 'text-red-500'}`}>{p.direction === 'Incoming' ? '+' : '-'}{inr(p.amount)}</td>
                  <td className="px-3 py-2.5"><Badge color="slate">{p.payment_method}</Badge></td>
                  <td className="px-3 py-2.5"><Badge color={statusColor(p.status)}>{p.status}</Badge></td>
                  <td className="px-3 py-2.5 text-slate-400 max-w-[150px] truncate">{p.notes || '—'}</td>
                  <td className="px-3 py-2.5"><button onClick={() => setSelected(p)} className="grid h-6 w-6 place-items-center rounded bg-slate-100 text-slate-500 hover:bg-slate-200"><Eye size={12} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <EmptyState message="No payments found" />}
        </div>
      </div>

      {showAdd && <AddPaymentModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

function AddPaymentModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ direction: 'Incoming', payment_type: 'Customer Payment', party_name: '', party_type: 'Customer', reference: '', amount: 0, payment_method: 'Cash', payment_date: new Date().toISOString().slice(0, 10), notes: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (form.amount <= 0) { setErr('Amount must be greater than 0'); return; }
    if (!form.party_name) { setErr('Party name is required'); return; }
    setSaving(true);
    try {
      await api('/api/payments', { method: 'POST', body: JSON.stringify({ ...form, party_type: form.party_type, reference: form.reference || null, notes: form.notes || null }) });
      onSaved();
    } catch (error) { setErr(error instanceof Error ? error.message : 'Unable to create payment'); }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><p className="text-sm font-bold">{form.direction === 'Incoming' ? 'Receive Payment' : 'Make Payment'}</p><button onClick={onClose}><X size={16} /></button></div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[9px] font-bold uppercase text-slate-400">Direction</label>
              <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value, payment_type: e.target.value === 'Incoming' ? 'Customer Payment' : 'Supplier Payment' })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 text-[11px] outline-none">
                {['Incoming', 'Outgoing'].map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div><label className="text-[9px] font-bold uppercase text-slate-400">Payment Type</label>
              <select value={form.payment_type} onChange={(e) => setForm({ ...form, payment_type: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 text-[11px] outline-none">
                {(form.direction === 'Incoming' ? INCOMING_TYPES : OUTGOING_TYPES).map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[9px] font-bold uppercase text-slate-400">Party Name *</label><input value={form.party_name} onChange={(e) => setForm({ ...form, party_name: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-[11px] outline-none" /></div>
            <div><label className="text-[9px] font-bold uppercase text-slate-400">Party Type</label>
              <select value={form.party_type} onChange={(e) => setForm({ ...form, party_type: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 text-[11px] outline-none">
                {['Customer', 'Supplier', 'Other'].map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[9px] font-bold uppercase text-slate-400">Amount (₹) *</label><input type="number" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: +e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-[11px] outline-none" /></div>
            <div><label className="text-[9px] font-bold uppercase text-slate-400">Date</label><input type="date" value={form.payment_date} onChange={(e) => setForm({ ...form, payment_date: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-[11px] outline-none" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[9px] font-bold uppercase text-slate-400">Payment Method</label>
              <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 text-[11px] outline-none">
                {METHODS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div><label className="text-[9px] font-bold uppercase text-slate-400">Reference Number</label><input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-[11px] outline-none" /></div>
          </div>
          <div><label className="text-[9px] font-bold uppercase text-slate-400">Notes</label><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-[11px] outline-none" /></div>
          {err && <p className="text-[10px] font-semibold text-red-500">{err}</p>}
          <button onClick={save} disabled={saving} className="w-full rounded-md bg-[#4714a1] py-2.5 text-[11px] font-bold text-white hover:bg-[#5419b5] disabled:opacity-50">{saving ? 'Saving...' : form.direction === 'Incoming' ? 'Receive Payment' : 'Make Payment'}</button>
        </div>
      </div>
    </div>
  );
}

function PaymentDetail({ permissions, payment, onBack, onRefresh }: { permissions: Permissions; payment: Payment; onBack: () => void; onRefresh: (p: Payment) => void }) {
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const can = (perm: string) => permissions.includes('*') || permissions.includes(perm);

  async function cancelPayment() {
    if (!window.confirm(`Cancel payment ${payment.payment_number} of ${inr(payment.amount)}?`)) return;
    setBusy(true);
    try {
      await api(`/api/payments/${payment.id}/cancel`, { method: 'POST' });
      onRefresh(await api<Payment>(`/api/payments/${payment.id}`));
      setToast('Payment cancelled and any settlement reversed');
    } catch (error) { setToast('Error: ' + (error instanceof Error ? error.message : 'Unable to cancel payment')); }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3"><button onClick={onBack} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">←</button><h2 className="text-base font-bold">{payment.payment_number}</h2><Badge color={statusColor(payment.status)}>{payment.status}</Badge><Badge color="slate">{payment.payment_type}</Badge></div>
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
          <p className="border-b border-slate-100 px-4 py-3 text-xs font-bold">Payment Information</p>
          <div className="space-y-2 p-4 text-[11px]">
            {[['Payment Number', payment.payment_number], ['Date', payment.payment_date], ['Direction', payment.direction], ['Type', payment.payment_type], ['Party', payment.party_name || '—'], ['Party Type', payment.party_type || '—'], ['Reference', payment.reference || '—'], ['Notes', payment.notes || '—'], ['Created By', payment.created_by_name || '—'], ['Created At', payment.created_at ? String(payment.created_at).slice(0, 16) : '—']].map(([k, v]) => <div key={k} className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">{k}</span><b className="text-right max-w-[200px]">{v}</b></div>)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
          <p className="border-b border-slate-100 px-4 py-3 text-xs font-bold">Amount</p>
          <div className="space-y-2 p-4 text-[11px]">
            <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">Amount</span><b className={`text-base ${payment.direction === 'Incoming' ? 'text-emerald-600' : 'text-red-500'}`}>{payment.direction === 'Incoming' ? '+' : '-'}{inr(payment.amount)}</b></div>
            <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">Method</span><b>{payment.payment_method}</b></div>
            <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">Reference</span><b>{payment.reference || '—'}</b></div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
          <p className="border-b border-slate-100 px-4 py-3 text-xs font-bold">Actions</p>
          <div className="grid grid-cols-1 gap-2 p-3">
            {payment.status !== 'Cancelled' && can('accounts.payment.cancel') && (
              <button onClick={cancelPayment} disabled={busy} className="flex items-center justify-center gap-1.5 rounded-md border border-red-200 py-2.5 text-[10px] font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"><Ban size={13} /> {busy ? 'Cancelling...' : 'Cancel / Void Payment'}</button>
            )}
          </div>
        </div>
      </div>
      {toast && <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-[#1d2945] px-4 py-3 text-xs font-semibold text-white shadow-xl">{toast}</div>}
    </div>
  );
}
