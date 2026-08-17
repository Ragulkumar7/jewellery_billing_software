import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Eye, X, Users, Phone, Mail, MapPin, FileText, TrendingUp, Wallet, Package, Ban, CheckCircle2, Receipt, Boxes, RotateCcw } from 'lucide-react';
import { inr } from '@/lib/supabase';
import { Badge, EmptyState, Panel, statusColor } from '@/components/ui';
import { api } from '@/lib/api';

type Permissions = string[];

type Supplier = {
  id: string;
  name: string;
  company_name?: string | null;
  contact_person?: string | null;
  mobile?: string | null;
  email?: string | null;
  address?: string | null;
  gst_number?: string | null;
  pan?: string | null;
  payment_terms?: string | null;
  credit_limit?: number;
  outstanding_balance?: number;
  total_purchases?: number;
  status?: string;
  bank_name?: string | null;
  bank_account_no?: string | null;
  bank_ifsc?: string | null;
  created_at?: string;
  po_count?: number;
  pi_count?: number;
};

type SupplierDetailData = {
  supplier: Supplier;
  orders: any[];
  invoices: any[];
  payments: any[];
  grns: any[];
  returns: any[];
};

export default function Suppliers({ permissions }: { permissions: Permissions }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selected, setSelected] = useState<SupplierDetailData | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const can = (perm: string) => permissions.includes('*') || permissions.includes(perm);

  async function load() {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (search) params.set('q', search);
      if (statusFilter !== 'All') params.set('status', statusFilter);
      setSuppliers(await api<Supplier[]>(`/api/suppliers?${params.toString()}`));
    } catch { setSuppliers([]); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter, search]);

  if (selected) return <SupplierDetail permissions={permissions} data={selected} onBack={() => setSelected(null)} onRefresh={(d) => setSelected(d)} />;

  const totalPurchases = suppliers.reduce((s, sup) => s + (sup.total_purchases || 0), 0);
  const totalOutstanding = suppliers.reduce((s, sup) => s + (sup.outstanding_balance || 0), 0);
  const totalCredit = suppliers.reduce((s, sup) => s + (sup.credit_limit || 0), 0);
  const activeCount = suppliers.filter((s) => s.status !== 'Inactive').length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-5">
        {[
          ['Total Suppliers', String(suppliers.length), 'navy', Users],
          ['Active', String(activeCount), 'green', CheckCircle2],
          ['Total Purchases', inr(totalPurchases), 'violet', TrendingUp],
          ['Outstanding', inr(totalOutstanding), 'orange', Wallet],
          ['Total Credit Limit', inr(totalCredit), 'blue', Wallet],
        ].map(([label, val, color, Icon]) => {
          const I = Icon as typeof Users;
          return <div key={label as string} className={`rounded-lg p-3 text-white shadow-sm bg-${color as string}`}><div className="mb-2 flex items-center justify-between"><span className="text-[9px] font-medium">{label as string}</span><I size={14}/></div><p className="text-sm font-bold">{val as string}</p></div>;
        })}
      </div>
      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-bold">Suppliers</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-8 items-center gap-2 rounded-md bg-slate-50 px-3 text-slate-400"><Search size={14}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, mobile, GST..." className="w-48 bg-transparent text-xs outline-none" /></div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">{['All', 'Active', 'Inactive'].map((s) => <option key={s}>{s}</option>)}</select>
            {can('purchase.supplier.create') && <button onClick={() => setShowAdd(true)} className="flex h-8 items-center gap-1.5 rounded-md bg-[#4714a1] px-3 text-[11px] font-bold text-white hover:bg-[#5419b5]"><Plus size={14}/> Add Supplier</button>}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400"><tr>{['Name', 'Contact', 'Mobile', 'GST', 'Payment Terms', 'POs', 'Total Purchases', 'Outstanding', 'Status', 'Actions'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr></thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="px-3 py-2.5"><div className="flex items-center gap-2"><div className="grid h-7 w-7 place-items-center rounded-full bg-blue-50 text-[10px] font-bold text-blue-600">{s.name.charAt(0)}</div><div><p className="font-bold">{s.name}</p><p className="text-[9px] text-slate-400">{s.company_name || s.contact_person || '—'}</p></div></div></td>
                  <td className="px-3 py-2.5 text-slate-500">{s.email || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500">{s.mobile || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500">{s.gst_number || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500">{s.payment_terms || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500">{s.po_count ?? 0}</td>
                  <td className="px-3 py-2.5 font-bold">{inr(s.total_purchases || 0)}</td>
                  <td className="px-3 py-2.5"><span className={(s.outstanding_balance ?? 0) > 0 ? 'font-bold text-orange-600' : 'text-slate-400'}>{inr(s.outstanding_balance || 0)}</span></td>
                  <td className="px-3 py-2.5"><Badge color={s.status === 'Inactive' ? 'slate' : 'green'}>{s.status || 'Active'}</Badge></td>
                  <td className="px-3 py-2.5"><button onClick={() => openDetail(s.id)} className="grid h-6 w-6 place-items-center rounded bg-slate-100 text-slate-500 hover:bg-slate-200"><Eye size={12}/></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {suppliers.length === 0 && <EmptyState message="No suppliers found. Add your first supplier." />}
        </div>
      </div>
      {showAdd && <AddSupplierModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
    </div>
  );

  async function openDetail(id: string) {
    try { setSelected(await api<SupplierDetailData>(`/api/suppliers/${id}`)); } catch { /* keep list */ }
  }
}

function SupplierDetail({ permissions, data, onBack, onRefresh }: { permissions: Permissions; data: SupplierDetailData; onBack: () => void; onRefresh: (d: SupplierDetailData) => void }) {
  const { supplier: s, orders, invoices, payments, grns, returns } = data;
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showToggle, setShowToggle] = useState(false);

  const can = (perm: string) => permissions.includes('*') || permissions.includes(perm);
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  async function toggleStatus() {
    const next = s.status === 'Inactive' ? 'Active' : 'Inactive';
    setBusy(true);
    try {
      await api(`/api/suppliers/${s.id}/status`, { method: 'POST', body: JSON.stringify({ status: next }) });
      setShowToggle(false);
      setToast(next === 'Active' ? 'Supplier activated' : 'Supplier deactivated');
      onRefresh(await api<SupplierDetailData>(`/api/suppliers/${s.id}`));
    } catch (error) { setToast('Error: ' + (error instanceof Error ? error.message : 'Unable to update status')); }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3"><button onClick={onBack} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">←</button><h2 className="text-base font-bold">{s.name}</h2><Badge color={s.status === 'Inactive' ? 'slate' : 'green'}>{s.status || 'Active'}</Badge></div>
      </div>
      <div className="grid gap-3 xl:grid-cols-[1fr_300px]">
        <div className="space-y-3">
          <Panel title={`Purchase Orders (${orders.length})`} icon={Package}>
            {orders.length === 0 ? <EmptyState message="No purchase orders" /> : <table className="w-full text-[11px]"><thead className="text-[9px] uppercase text-slate-400"><tr>{['PO #', 'Date', 'Status', 'Total'].map((h) => <th key={h} className="px-2 py-2 text-left font-bold">{h}</th>)}</tr></thead><tbody>{orders.map((p) => (<tr key={p.id} className="border-t border-slate-50"><td className="px-2 py-2 font-bold text-[#5419b5]">{p.po_number}</td><td className="px-2 py-2 text-slate-500">{String(p.po_date || '').slice(0, 10)}</td><td className="px-2 py-2"><Badge color={statusColor(p.status)}>{p.status}</Badge></td><td className="px-2 py-2 font-bold">{inr(p.grand_total)}</td></tr>))}</tbody></table>}
          </Panel>
          <Panel title={`Purchase Invoices (${invoices.length})`} icon={Receipt}>
            {invoices.length === 0 ? <EmptyState message="No purchase invoices" /> : <table className="w-full text-[11px]"><thead className="text-[9px] uppercase text-slate-400"><tr>{['Invoice #', 'Date', 'Payment', 'Total', 'Outstanding'].map((h) => <th key={h} className="px-2 py-2 text-left font-bold">{h}</th>)}</tr></thead><tbody>{invoices.map((p) => (<tr key={p.id} className="border-t border-slate-50"><td className="px-2 py-2 font-bold text-[#5419b5]">{p.pi_number}</td><td className="px-2 py-2 text-slate-500">{String(p.pi_date || '').slice(0, 10)}</td><td className="px-2 py-2"><Badge color={statusColor(p.payment_status || p.status)}>{p.payment_status || p.status}</Badge></td><td className="px-2 py-2 font-bold">{inr(p.grand_total)}</td><td className="px-2 py-2 text-orange-600">{inr(p.outstanding_balance)}</td></tr>))}</tbody></table>}
          </Panel>
          <Panel title={`Payment History (${payments.length})`} icon={Wallet}>
            {payments.length === 0 ? <EmptyState message="No payments recorded" /> : <table className="w-full text-[11px]"><thead className="text-[9px] uppercase text-slate-400"><tr>{['Payment #', 'Date', 'Method', 'Type', 'Amount'].map((h) => <th key={h} className="px-2 py-2 text-left font-bold">{h}</th>)}</tr></thead><tbody>{payments.map((p) => (<tr key={p.id} className="border-t border-slate-50"><td className="px-2 py-2 font-bold text-[#5419b5]">{p.payment_number}</td><td className="px-2 py-2 text-slate-500">{String(p.created_at || '').slice(0, 10)}</td><td className="px-2 py-2 text-slate-500">{p.payment_method}</td><td className="px-2 py-2"><Badge color="blue">{p.payment_type}</Badge></td><td className="px-2 py-2 font-bold">{inr(p.amount)}</td></tr>))}</tbody></table>}
          </Panel>
          <Panel title={`GRNs (${grns.length})`} icon={Boxes}>
            {grns.length === 0 ? <EmptyState message="No GRNs" /> : <div className="space-y-1.5 text-[10px]">{grns.map((g) => <div key={g.id} className="flex justify-between rounded-md bg-slate-50 p-2"><span className="font-bold text-[#5419b5]">{g.grn_number}</span><span className="text-slate-500">{g.item_count ?? 0} item(s)</span><Badge color={statusColor(g.status)}>{g.status}</Badge></div>)}</div>}
          </Panel>
          <Panel title={`Returns (${returns.length})`} icon={RotateCcw}>
            {returns.length === 0 ? <EmptyState message="No returns" /> : <div className="space-y-1.5 text-[10px]">{returns.map((r) => <div key={r.id} className="flex justify-between rounded-md bg-slate-50 p-2"><span className="font-bold text-[#5419b5]">{r.return_number}</span><span className="font-bold">{inr(r.grand_total)}</span><Badge color={statusColor(r.status)}>{r.status}</Badge></div>)}</div>}
          </Panel>
        </div>
        <div className="space-y-3">
          <Panel title="Supplier Info" icon={Users}>
            <div className="space-y-2 text-[11px]">
              {s.company_name && <p className="font-bold">{s.company_name}</p>}
              <div className="flex items-center gap-2 text-slate-500"><Phone size={13}/>{s.mobile || '—'}</div>
              <div className="flex items-center gap-2 text-slate-500"><Mail size={13}/>{s.email || '—'}</div>
              <div className="flex items-center gap-2 text-slate-500"><MapPin size={13}/>{s.address || '—'}</div>
              <div className="flex items-center gap-2 text-slate-500"><FileText size={13}/>GST: {s.gst_number || '—'} · PAN: {s.pan || '—'}</div>
              {s.bank_name && <div className="rounded-md bg-slate-50 p-2 text-[10px] text-slate-500">Bank: {s.bank_name}<br/>A/C: {s.bank_account_no || '—'} · IFSC: {s.bank_ifsc || '—'}</div>}
            </div>
          </Panel>
          <Panel title="Account Summary" icon={Wallet}>
            <div className="space-y-2 text-[11px]">
              {[['Total Purchases', inr(s.total_purchases || 0)], ['Total Paid', inr(totalPaid)], ['Outstanding Balance', inr(s.outstanding_balance || 0)], ['Credit Limit', inr(s.credit_limit || 0)], ['Payment Terms', s.payment_terms || '—']].map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-slate-500">{k}</span><b>{v}</b></div>)}
            </div>
          </Panel>
          {can('purchase.supplier.deactivate') && (
            <div className="rounded-xl border border-slate-100 bg-white p-3">
              <button onClick={() => setShowToggle(true)} className={`flex w-full items-center justify-center gap-1.5 rounded-md py-2.5 text-[10px] font-bold ${s.status === 'Inactive' ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'border border-red-200 text-red-600 hover:bg-red-50'}`}>{s.status === 'Inactive' ? <><CheckCircle2 size={13}/> Activate Supplier</> : <><Ban size={13}/> Deactivate Supplier</>}</button>
            </div>
          )}
        </div>
      </div>

      {showToggle && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => setShowToggle(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold"><Ban size={14} className="mr-1 inline text-red-500"/>Confirm</p><button onClick={() => setShowToggle(false)}><X size={16}/></button></div>
            <p className="text-[11px] text-slate-500">{s.status === 'Inactive' ? `Activate "${s.name}"?` : `Deactivate "${s.name}"? Inactive suppliers cannot be used on new purchase orders.`}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setShowToggle(false)} className="rounded-md border border-slate-200 py-2 text-[10px] font-bold text-slate-600">Keep</button>
              <button onClick={toggleStatus} disabled={busy} className="rounded-md bg-[#4714a1] py-2 text-[10px] font-bold text-white disabled:opacity-50">{busy ? 'Updating...' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-[#1d2945] px-4 py-3 text-xs font-semibold text-white shadow-xl">{toast}</div>}
    </div>
  );
}

function AddSupplierModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', company_name: '', contact_person: '', mobile: '', email: '', gst_number: '', pan: '', address: '', payment_terms: 'Net 30', credit_limit: 0, bank_name: '', bank_account_no: '', bank_ifsc: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!form.name.trim()) { setErr('Name is required'); return; }
    setSaving(true);
    setErr(null);
    try {
      await api('/api/suppliers', {
        method: 'POST',
        body: JSON.stringify({ ...form, name: form.name.trim(), company_name: form.company_name || null, contact_person: form.contact_person || null, mobile: form.mobile || null, email: form.email || null, gst_number: form.gst_number || null, pan: form.pan || null, address: form.address || null, bank_name: form.bank_name || null, bank_account_no: form.bank_account_no || null, bank_ifsc: form.bank_ifsc || null, payment_terms: form.payment_terms, credit_limit: Number(form.credit_limit) || 0 }),
      });
      onSaved();
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Unable to save supplier');
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><p className="text-sm font-bold">Add New Supplier</p><button onClick={onClose}><X size={16}/></button></div>
        <div className="space-y-3">
          {[['name', 'Supplier Name *'], ['company_name', 'Company Name'], ['contact_person', 'Contact Person'], ['mobile', 'Mobile Number'], ['email', 'Email'], ['gst_number', 'GST Number'], ['pan', 'PAN'], ['address', 'Address']].map(([k, label]) => (
            <div key={k}><label className="text-[9px] font-bold uppercase text-slate-400">{label}</label><input value={(form as any)[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-[11px] outline-none focus:border-[#6f39bd]" /></div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[9px] font-bold uppercase text-slate-400">Payment Terms</label><select value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-2 text-[11px] outline-none">{['Net 15', 'Net 30', 'Net 45', 'Net 60', 'Advance', 'COD', 'Immediate'].map((t) => <option key={t}>{t}</option>)}</select></div>
            <div><label className="text-[9px] font-bold uppercase text-slate-400">Credit Limit</label><input type="number" min={0} value={form.credit_limit || ''} onChange={(e) => setForm({ ...form, credit_limit: +e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-[11px] outline-none" /></div>
          </div>
          <p className="text-[9px] font-bold uppercase text-slate-400">Bank Details (optional)</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[9px] font-bold uppercase text-slate-400">Bank Name</label><input value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-[11px] outline-none" /></div>
            <div><label className="text-[9px] font-bold uppercase text-slate-400">A/C No</label><input value={form.bank_account_no} onChange={(e) => setForm({ ...form, bank_account_no: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-[11px] outline-none" /></div>
            <div><label className="text-[9px] font-bold uppercase text-slate-400">IFSC</label><input value={form.bank_ifsc} onChange={(e) => setForm({ ...form, bank_ifsc: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-[11px] outline-none" /></div>
          </div>
          {err && <p className="text-[10px] font-semibold text-red-500">{err}</p>}
          <button onClick={save} disabled={saving} className="w-full rounded-md bg-[#4714a1] py-2.5 text-[11px] font-bold text-white hover:bg-[#5419b5] disabled:opacity-50">{saving ? 'Saving...' : 'Save Supplier'}</button>
        </div>
      </div>
    </div>
  );
}
