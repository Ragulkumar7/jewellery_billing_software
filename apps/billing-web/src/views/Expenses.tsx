import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, X, Wallet, Download, TrendingUp, Calendar, CheckCircle2, Ban, Eye, FileText } from 'lucide-react';
import { inr } from '@/lib/currency';
import { Badge, EmptyState, statusColor } from '@/components/ui';
import { api } from '@/lib/api';

type Permissions = string[];

const CATEGORIES = ['Rent', 'Salaries', 'Electricity', 'Internet', 'Packaging', 'Transport', 'Maintenance', 'Stationery', 'Marketing', 'Software', 'Cleaning', 'Other'];

type Expense = {
  id: string;
  expense_number: string;
  category: string;
  expense_date: string;
  amount: number;
  payment_method: string;
  payment_reference?: string | null;
  description?: string | null;
  receipt_url?: string | null;
  remarks?: string | null;
  status: string;
  created_by_name?: string | null;
  approved_by_name?: string | null;
  approved_at?: string | null;
  paid_at?: string | null;
  paid_by?: string | null;
  payment_date?: string | null;
  created_at?: string;
};

export default function Expenses({ permissions }: { permissions: Permissions }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<Expense | null>(null);

  const can = (perm: string) => permissions.includes('*') || permissions.includes(perm);

  async function load() {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (search) params.set('q', search);
      if (catFilter !== 'All') params.set('category', catFilter);
      if (statusFilter !== 'All') params.set('status', statusFilter);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      setExpenses(await api<Expense[]>(`/api/expenses?${params.toString()}`));
    } catch { setExpenses([]); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [search, catFilter, statusFilter, fromDate, toDate]);

  const filtered = expenses;
  const totalAmount = filtered.reduce((s, e) => s + e.amount, 0);
  const approvedAmount = filtered.filter((e) => e.status === 'Approved').reduce((s, e) => s + e.amount, 0);
  const pendingAmount = filtered.filter((e) => e.status === 'Pending').reduce((s, e) => s + e.amount, 0);
  const todayExpenses = filtered.filter((e) => e.expense_date === new Date().toISOString().slice(0, 10)).reduce((s, e) => s + e.amount, 0);

  if (selected) return <ExpenseDetail permissions={permissions} expense={selected} onBack={() => { setSelected(null); load(); }} onRefresh={setSelected} />;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-4">
        {[
          ['Total Expenses', inr(totalAmount), 'rose', Wallet],
          ['Approved', inr(approvedAmount), 'green', TrendingUp],
          ['Pending Approval', inr(pendingAmount), 'orange', Calendar],
          ['Today\'s Expenses', inr(todayExpenses), 'blue', FileText],
        ].map(([label, val, color, Icon]) => {
          const I = Icon as typeof Wallet;
          return <div key={label as string} className={`rounded-lg p-3 text-white shadow-sm bg-${color as string}`}><div className="mb-2 flex items-center justify-between"><span className="text-[9px] font-medium">{label as string}</span><I size={14} /></div><p className="text-sm font-bold">{val as string}</p></div>;
        })}
      </div>

      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-bold">Expenses</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-8 items-center gap-2 rounded-md bg-slate-50 px-3 text-slate-400"><Search size={14} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search expenses..." className="w-40 bg-transparent text-xs outline-none" /></div>
            <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">
              <option>All</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">
              {['All', 'Pending', 'Approved', 'Paid', 'Cancelled'].map((s) => <option key={s}>{s}</option>)}
            </select>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[10px] outline-none" />
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[10px] outline-none" />
            {can('accounts.expense.create') && <button onClick={() => setShowAdd(true)} className="flex h-8 items-center gap-1.5 rounded-md bg-[#4714a1] px-3 text-[11px] font-bold text-white hover:bg-[#5419b5]"><Plus size={14} /> Add Expense</button>}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400">
              <tr>{['Expense #', 'Date', 'Category', 'Description', 'Amount', 'Payment Method', 'Payment Ref', 'Status', 'Created By', 'Actions'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="px-3 py-2.5 font-bold text-[#5419b5]">{e.expense_number}</td>
                  <td className="px-3 py-2.5 text-slate-500">{e.expense_date}</td>
                  <td className="px-3 py-2.5"><Badge color="slate">{e.category}</Badge></td>
                  <td className="px-3 py-2.5 text-slate-500 max-w-[200px] truncate">{e.description || '—'}</td>
                  <td className="px-3 py-2.5 font-bold">{inr(e.amount)}</td>
                  <td className="px-3 py-2.5 text-slate-500">{e.payment_method}</td>
                  <td className="px-3 py-2.5 text-slate-400">{e.payment_reference || '—'}</td>
                  <td className="px-3 py-2.5"><Badge color={statusColor(e.status)}>{e.status}</Badge></td>
                  <td className="px-3 py-2.5 text-slate-400">{e.created_by_name || '—'}</td>
                  <td className="px-3 py-2.5"><button onClick={() => setSelected(e)} className="grid h-6 w-6 place-items-center rounded bg-slate-100 text-slate-500 hover:bg-slate-200"><Eye size={12} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <EmptyState message="No expenses found" />}
        </div>
      </div>

      {showAdd && <AddExpenseModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

function AddExpenseModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ category: 'Rent', expense_date: new Date().toISOString().slice(0, 10), amount: 0, payment_method: 'Cash', payment_reference: '', description: '', remarks: '', status: 'Pending' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (form.amount <= 0) { setErr('Amount must be greater than 0'); return; }
    setSaving(true);
    try {
      await api('/api/expenses', { method: 'POST', body: JSON.stringify({ ...form, payment_reference: form.payment_reference || null, description: form.description || null, remarks: form.remarks || null }) });
      onSaved();
    } catch (error) { setErr(error instanceof Error ? error.message : 'Unable to create expense'); }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><p className="text-sm font-bold">Add New Expense</p><button onClick={onClose}><X size={16} /></button></div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[9px] font-bold uppercase text-slate-400">Expense Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 text-[11px] outline-none">
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div><label className="text-[9px] font-bold uppercase text-slate-400">Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 text-[11px] outline-none">
                {['Pending', 'Paid'].map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[9px] font-bold uppercase text-slate-400">Date</label><input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-[11px] outline-none" /></div>
            <div><label className="text-[9px] font-bold uppercase text-slate-400">Amount (₹)</label><input type="number" value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: +e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-[11px] outline-none" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[9px] font-bold uppercase text-slate-400">Payment Method</label>
              <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 text-[11px] outline-none">
                {['Cash', 'UPI', 'Card', 'Bank Transfer', 'Cheque', 'Other'].map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div><label className="text-[9px] font-bold uppercase text-slate-400">Reference / UTR</label><input value={form.payment_reference} onChange={(e) => setForm({ ...form, payment_reference: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-[11px] outline-none" /></div>
          </div>
          <div><label className="text-[9px] font-bold uppercase text-slate-400">Description</label><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-[11px] outline-none" rows={2} /></div>
          <div><label className="text-[9px] font-bold uppercase text-slate-400">Remarks</label><input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-[11px] outline-none" /></div>
          {err && <p className="text-[10px] font-semibold text-red-500">{err}</p>}
          <button onClick={save} disabled={saving} className="w-full rounded-md bg-[#4714a1] py-2.5 text-[11px] font-bold text-white hover:bg-[#5419b5] disabled:opacity-50">{saving ? 'Saving...' : 'Save Expense'}</button>
        </div>
      </div>
    </div>
  );
}

function ExpenseDetail({ permissions, expense, onBack, onRefresh }: { permissions: Permissions; expense: Expense; onBack: () => void; onRefresh: (e: Expense) => void }) {
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [reason, setReason] = useState('');
  const [showPay, setShowPay] = useState(false);
  const [payMethod, setPayMethod] = useState('Cash');
  const [payRef, setPayRef] = useState('');

  const can = (perm: string) => permissions.includes('*') || permissions.includes(perm);

  async function refresh() {
    try { onRefresh(await api<Expense>(`/api/expenses/${expense.id}`)); } catch { /* keep */ }
  }

  async function setStatus(action: 'Approve' | 'Cancel') {
    if (action === 'Cancel' && !reason.trim()) { setToast('A cancellation reason is required'); return; }
    setBusy(action);
    try {
      await api(`/api/expenses/${expense.id}/status`, { method: 'POST', body: JSON.stringify({ action, reason: action === 'Cancel' ? reason.trim() : null }) });
      setShowCancel(false);
      setToast(action === 'Approve' ? 'Expense approved' : 'Expense cancelled');
      await refresh();
    } catch (error) { setToast('Error: ' + (error instanceof Error ? error.message : 'Unable to update expense')); }
    setBusy(null);
  }

  async function recordPayment() {
    setBusy('pay');
    try {
      await api(`/api/expenses/${expense.id}/payment`, { method: 'POST', body: JSON.stringify({ method: payMethod, reference: payRef || null, payment_date: new Date().toISOString().slice(0, 10), notes: null }) });
      setShowPay(false);
      setToast('Expense marked as paid');
      await refresh();
    } catch (error) { setToast('Error: ' + (error instanceof Error ? error.message : 'Unable to record payment')); }
    setBusy(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3"><button onClick={onBack} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">←</button><h2 className="text-base font-bold">{expense.expense_number}</h2><Badge color={statusColor(expense.status)}>{expense.status}</Badge><Badge color="slate">{expense.category}</Badge></div>
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
          <p className="border-b border-slate-100 px-4 py-3 text-xs font-bold">Expense Information</p>
          <div className="space-y-2 p-4 text-[11px]">
            {[['Expense Number', expense.expense_number], ['Date', expense.expense_date], ['Category', expense.category], ['Description', expense.description || '—'], ['Remarks', expense.remarks || '—'], ['Created By', expense.created_by_name || '—'], ['Approved By', expense.approved_by_name || '—'], ['Created At', expense.created_at ? String(expense.created_at).slice(0, 16) : '—']].map(([k, v]) => <div key={k} className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">{k}</span><b className="text-right max-w-[180px]">{v}</b></div>)}
          </div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
          <p className="border-b border-slate-100 px-4 py-3 text-xs font-bold">Amount</p>
          <div className="space-y-2 p-4 text-[11px]">
            <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">Amount</span><b className="text-base text-[#5419b5]">{inr(expense.amount)}</b></div>
            <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">Payment Method</span><b>{expense.payment_method}</b></div>
            <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">Payment Reference</span><b>{expense.payment_reference || '—'}</b></div>
            <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">Payment Date</span><b>{expense.payment_date || '—'}</b></div>
            <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">Paid At</span><b>{expense.paid_at ? String(expense.paid_at).slice(0, 16) : '—'}</b></div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
          <p className="border-b border-slate-100 px-4 py-3 text-xs font-bold">Actions</p>
          <div className="grid grid-cols-1 gap-2 p-3">
            {['Pending', 'Approved'].includes(expense.status) && can('accounts.expense.approve') && (
              <button onClick={() => setStatus('Approve')} disabled={!!busy} className="flex items-center justify-center gap-1.5 rounded-md bg-emerald-500 py-2.5 text-[10px] font-bold text-white hover:bg-emerald-600 disabled:opacity-50"><CheckCircle2 size={13} />{busy === 'Approve' ? 'Approving...' : 'Approve Expense'}</button>
            )}
            {['Pending', 'Approved'].includes(expense.status) && can('accounts.payment.create') && (
              <button onClick={() => setShowPay(true)} className="flex items-center justify-center gap-1.5 rounded-md bg-[#4714a1] py-2.5 text-[10px] font-bold text-white hover:bg-[#5419b5]"><Wallet size={13} /> Record Payment</button>
            )}
            {!['Paid', 'Cancelled'].includes(expense.status) && can('accounts.expense.edit') && (
              <button onClick={() => setShowCancel(true)} className="flex items-center justify-center gap-1.5 rounded-md border border-red-200 py-2.5 text-[10px] font-bold text-red-600 hover:bg-red-50"><Ban size={13} /> Cancel Expense</button>
            )}
          </div>
        </div>
      </div>

      {showCancel && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => setShowCancel(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold"><Ban size={14} className="mr-1 inline text-red-500" />Cancel Expense</p><button onClick={() => setShowCancel(false)}><X size={16} /></button></div>
            <label className="mt-3 block text-[9px] font-bold uppercase text-slate-400">Reason (required)</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-xs outline-none" rows={2} />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setShowCancel(false)} className="rounded-md border border-slate-200 py-2 text-[10px] font-bold text-slate-600">Keep Expense</button>
              <button onClick={() => setStatus('Cancel')} disabled={!!busy} className="rounded-md bg-red-500 py-2 text-[10px] font-bold text-white disabled:opacity-50">{busy === 'Cancel' ? 'Cancelling...' : 'Cancel Expense'}</button>
            </div>
          </div>
        </div>
      )}

      {showPay && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => setShowPay(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold"><Wallet size={14} className="mr-1 inline text-[#5419b5]" />Record Payment</p><button onClick={() => setShowPay(false)}><X size={16} /></button></div>
            <div className="space-y-3">
              <p className="rounded-md bg-slate-50 p-2 text-[10px] text-slate-500">Amount to pay: <b className="text-[#5419b5]">{inr(expense.amount)}</b></p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-[9px] font-bold uppercase text-slate-400">Method</label><select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 text-[11px] outline-none">{['Cash', 'Bank Transfer', 'Cheque', 'UPI', 'Card'].map((m) => <option key={m}>{m}</option>)}</select></div>
                <div><label className="text-[9px] font-bold uppercase text-slate-400">Reference</label><input value={payRef} onChange={(e) => setPayRef(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-[11px] outline-none" /></div>
              </div>
              <button onClick={recordPayment} disabled={!!busy} className="w-full rounded-md bg-[#4714a1] py-2.5 text-[11px] font-bold text-white hover:bg-[#5419b5] disabled:opacity-50">{busy === 'pay' ? 'Recording...' : 'Mark as Paid'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-[#1d2945] px-4 py-3 text-xs font-semibold text-white shadow-xl">{toast}</div>}
    </div>
  );
}
