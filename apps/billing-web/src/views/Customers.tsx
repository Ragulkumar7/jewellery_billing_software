import { useEffect, useMemo, useState } from 'react';
import {
  Search, Plus, Phone, Mail, MapPin, User, ShoppingBag, Wallet, X, Eye, Download, Pencil, Link2,
  Unlink, Star, Calendar, Users, Loader2,
} from 'lucide-react';
import { inr } from '@/lib/currency';
import { type Customer, type Invoice, type Payment } from '@/lib/types';
import { Badge, EmptyState, Panel } from '@/components/ui';
import { api } from '@/lib/api';

type ShopifySyncCustomer = {
  id: string;
  shopify_customer_id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  total_orders: number;
  total_spent: number;
  synced_at: string;
};

type CustomerDetailData = {
  customer: Customer;
  summary: { orders: number; total_purchases: number; total_paid: number; outstanding: number };
  invoices: (Invoice & { item_count?: number })[];
  payments: Payment[];
  shopifyCustomer: ShopifySyncCustomer | null;
};

function SourceBadge({ source }: { source?: string }) {
  if (source === 'Linked') return <Badge color="green">Shopify + Internal</Badge>;
  if (source === 'Shopify') return <Badge color="cyan">Shopify</Badge>;
  return <Badge color="violet">Internal</Badge>;
}

function fmtDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function Customers({ permissions }: { permissions: string[] }) {
  const perms = useMemo(() => new Set(permissions), [permissions]);
  const canCreate = perms.has('*') || perms.has('sales.customer.create');
  const canEdit = perms.has('*') || perms.has('sales.customer.edit');
  const canDeactivate = perms.has('*') || perms.has('sales.customer.deactivate');
  const canLink = perms.has('*') || perms.has('sales.customer.link_shopify');
  const canExport = perms.has('*') || perms.has('sales.customer.export');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [purchaseFilter, setPurchaseFilter] = useState('all');
  const [selected, setSelected] = useState<Customer | null>(null);
  const [detail, setDetail] = useState<CustomerDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function load() {
    const params = new URLSearchParams();
    if (search.trim()) params.set('q', search.trim());
    if (sourceFilter !== 'all') params.set('source', sourceFilter);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (purchaseFilter !== 'all') params.set('purchase', purchaseFilter);
    params.set('limit', '200');
    try { setCustomers(await api<Customer[]>('/api/customers?' + params.toString())); } catch { setCustomers([]); }
  }

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, sourceFilter, statusFilter, purchaseFilter]);

  async function openDetail(c: Customer) {
    setSelected(c);
    setDetailLoading(true);
    setDetail(null);
    try {
      if (c.customer_code) {
        setDetail(await api<CustomerDetailData>(`/api/customers/${c.id}`));
      } else {
        setDetail({
          customer: c,
          summary: { orders: 0, total_purchases: c.total_purchases, total_paid: c.total_paid || 0, outstanding: 0 },
          invoices: [],
          payments: [],
          shopifyCustomer: { id: c.id, shopify_customer_id: c.shopify_customer_id || '', name: c.name, mobile: c.mobile, email: c.email, total_orders: c.shopify_total_orders || 0, total_spent: c.total_purchases, synced_at: c.last_shopify_sync_at || c.created_at },
        });
      }
    } catch { setToast('Unable to load customer details'); }
    setDetailLoading(false);
  }

  async function refreshDetail() {
    if (!selected?.customer_code) { load(); return; }
    setDetailLoading(true);
    try { setDetail(await api<CustomerDetailData>(`/api/customers/${selected.id}`)); } catch { /* keep existing */ }
    setDetailLoading(false);
    load();
  }

  function savedCustomer(saved: Customer) {
    setShowAdd(false);
    setToast(saved ? 'Customer saved' : null);
    load();
    if (selected && saved.id === selected.id) openDetail(saved);
  }

  if (selected) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <button onClick={() => { setSelected(null); setDetail(null); }} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">←</button>
          <h2 className="text-base font-bold">{selected.name}</h2>
          <span className="rounded-md bg-purple-50 px-2 py-0.5 text-[9px] font-bold text-[#6f39bd]">{selected.customer_code || 'Shopify Customer'}</span>
          <SourceBadge source={selected.source} />
          <Badge color={selected.status === 'Inactive' ? 'slate' : 'green'}>{selected.status || 'Active'}</Badge>
        </div>
        {detailLoading && !detail ? (
          <div className="grid place-items-center rounded-xl border border-slate-100 bg-white py-16 text-[11px] text-slate-400"><Loader2 size={16} className="mr-2 inline animate-spin" /> Loading customer...</div>
        ) : detail ? (
          <CustomerDetail
            data={detail}
            canEdit={canEdit}
            canDeactivate={canDeactivate}
            canLink={canLink}
            onBack={() => { setSelected(null); setDetail(null); }}
            onChanged={refreshDetail}
            onImported={(imported) => openDetail(imported)}
            onToast={setToast}
          />
        ) : (
          <div className="grid place-items-center rounded-xl border border-slate-100 bg-white py-16 text-[11px] text-slate-400">No details available</div>
        )}
        {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      </div>
    );
  }

  const totalOutstanding = customers.reduce((s, c) => s + c.outstanding_balance, 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-5">
        {[
          ['Total Customers', String(customers.length), 'navy', Users],
          ['Active Customers', String(customers.filter((c) => c.status !== 'Inactive').length), 'teal', User],
          ['Shopify + Linked', String(customers.filter((c) => c.source !== 'Internal').length), 'blue', ShoppingBag],
          ['Has Purchases', String(customers.filter((c) => (c.invoice_count || 0) > 0).length), 'violet', Star],
          ['Total Outstanding', inr(totalOutstanding), 'orange', Wallet],
        ].map(([label, val, color, Icon]) => {
          const I = Icon as typeof Users;
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
          <p className="text-sm font-bold">Customers</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-8 items-center gap-2 rounded-md bg-slate-50 px-3 text-slate-400"><Search size={14} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, mobile, email, CUS ID..." className="w-52 bg-transparent text-xs outline-none" /></div>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">
              {[['all', 'All Sources'], ['internal', 'Internal'], ['shopify', 'Shopify'], ['linked', 'Linked']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">
              {[['all', 'All Status'], ['active', 'Active'], ['inactive', 'Inactive']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select value={purchaseFilter} onChange={(e) => setPurchaseFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">
              {[['all', 'Purchase Status'], ['has_purchases', 'Has Purchases'], ['no_purchases', 'No Purchases']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            {canExport && <button onClick={() => { const a = document.createElement('a'); a.href = `${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/api/customers/export`; a.target = '_blank'; a.click(); }} className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-[11px] font-bold text-slate-600 hover:bg-slate-50"><Download size={13} /> Export</button>}
            {canCreate && <button onClick={() => setShowAdd(true)} className="flex h-8 items-center gap-1.5 rounded-md bg-[#4714a1] px-3 text-[11px] font-bold text-white hover:bg-[#5419b5]"><Plus size={14} /> Add Customer</button>}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400">
              <tr>{['Customer', 'Mobile', 'Email', 'Source', 'Total Purchases', 'Outstanding', 'Status', 'Actions'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={`${c.source}-${c.id}`} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="px-3 py-2.5">
                    <button onClick={() => openDetail(c)} className="flex items-center gap-2 text-left">
                      <div className="grid h-7 w-7 place-items-center rounded-full bg-purple-50 text-[10px] font-bold text-[#6f39bd]">{c.name.charAt(0)}</div>
                      <div><p className="font-bold text-[#1d2945]">{c.name}</p><p className="text-[9px] text-slate-400">{c.customer_code || '—'}</p></div>
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-slate-500">{c.mobile || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500">{c.email || '—'}</td>
                  <td className="px-3 py-2.5"><SourceBadge source={c.source} /></td>
                  <td className="px-3 py-2.5 font-bold">{inr(c.total_purchases)}</td>
                  <td className="px-3 py-2.5"><span className={c.outstanding_balance > 0 ? 'font-bold text-orange-600' : 'text-slate-400'}>{inr(c.outstanding_balance)}</span></td>
                  <td className="px-3 py-2.5"><Badge color={c.status === 'Inactive' ? 'slate' : 'green'}>{c.status || 'Active'}</Badge></td>
                  <td className="px-3 py-2.5"><button onClick={() => openDetail(c)} className="grid h-6 w-6 place-items-center rounded bg-slate-100 text-slate-500 hover:bg-slate-200"><Eye size={12} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {customers.length === 0 && <EmptyState message="No customers found" />}
        </div>
      </div>

      {showAdd && <CustomerFormModal customer={null} onClose={() => setShowAdd(false)} onSaved={savedCustomer} />}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function CustomerDetail({ data, canEdit, canDeactivate, canLink, onBack, onChanged, onImported, onToast }: {
  data: CustomerDetailData;
  canEdit: boolean;
  canDeactivate: boolean;
  canLink: boolean;
  onBack: () => void;
  onChanged: () => void;
  onImported: (customer: Customer) => void;
  onToast: (message: string) => void;
}) {
  const { customer, summary, invoices, payments, shopifyCustomer } = data;
  const [showEdit, setShowEdit] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [busy, setBusy] = useState(false);

  const address = [customer.address_line1, customer.address_line2, customer.city, customer.state, customer.country, customer.pin_code].filter(Boolean).join(', ') || customer.billing_address || '—';
  const outstandingInvoices = invoices.filter((i) => i.status !== 'Cancelled' && i.outstanding_balance > 0);
  const active = customer.status !== 'Inactive';

  async function toggleStatus() {
    if (!active && window.confirm('Reactivate this customer?')) {
      setBusy(true);
      try { await api(`/api/customers/${customer.id}/status`, { method: 'POST', body: JSON.stringify({ status: 'Active' }) }); onToast('Customer activated'); onChanged(); } catch (error) { onToast(error instanceof Error ? error.message : 'Unable to update status'); }
      setBusy(false);
      return;
    }
    if (active && window.confirm(`Deactivate ${customer.name}? Historical records will be preserved but the customer cannot be used for new sales.`)) {
      setBusy(true);
      try { await api(`/api/customers/${customer.id}/status`, { method: 'POST', body: JSON.stringify({ status: 'Inactive' }) }); onToast('Customer deactivated'); onChanged(); } catch (error) { onToast(error instanceof Error ? error.message : 'Unable to update status'); }
      setBusy(false);
    }
  }

  async function unlinkShopify() {
    if (!window.confirm('Unlink this Shopify customer?')) return;
    setBusy(true);
    try { await api(`/api/customers/${customer.id}/shopify-link`, { method: 'POST', body: JSON.stringify({ unlink: true }) }); onToast('Shopify customer unlinked'); onChanged(); } catch (error) { onToast(error instanceof Error ? error.message : 'Unable to unlink'); }
    setBusy(false);
  }

  async function importToInternal() {
    if (!customer.shopify_customer_id) return;
    setBusy(true);
    try {
      const imported = await api<Customer>('/api/customers/import-shopify', { method: 'POST', body: JSON.stringify({ shopifyCustomerId: customer.shopify_customer_id, name: customer.name, email: customer.email, phone: customer.mobile }) });
      onToast('Shopify customer imported to internal records');
      onImported(imported);
    } catch (error) { onToast(error instanceof Error ? error.message : 'Unable to import customer'); }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[10px] text-slate-500"><Phone size={12} />{customer.mobile ? `+91 ${customer.mobile}` : '—'}</div>
        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[10px] text-slate-500"><Mail size={12} />{customer.email || '—'}</div>
        <div className="ml-auto flex items-center gap-2">
          {canEdit && <button onClick={() => setShowEdit(true)} className="flex h-8 items-center gap-1.5 rounded-md bg-[#4714a1] px-3 text-[11px] font-bold text-white hover:bg-[#5419b5]"><Pencil size={13} /> Edit Customer</button>}
          {canDeactivate && <button onClick={toggleStatus} disabled={busy} className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">{active ? <><Unlink size={13} /> Deactivate</> : <><User size={13} /> Activate</>}</button>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          ['Total Purchases', inr(summary.total_purchases), 'navy', ShoppingBag],
          ['Total Paid', inr(summary.total_paid), 'teal', Wallet],
          ['Outstanding', inr(summary.outstanding), 'orange', Wallet],
          ['Orders', String(summary.orders), 'violet', Star],
        ].map(([label, val, color, Icon]) => {
          const I = Icon as typeof ShoppingBag;
          return (
            <div key={label as string} className={`rounded-lg p-3 text-white shadow-sm bg-${color as string}`}>
              <div className="mb-2 flex items-center justify-between"><span className="text-[9px] font-medium">{label as string}</span><I size={14} /></div>
              <p className="text-sm font-bold">{val as string}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 xl:grid-cols-[1fr_300px]">
        <div className="space-y-3">
          <Panel title="Purchase History" icon={ShoppingBag}>
            {invoices.length === 0 ? <EmptyState message="No purchases yet" /> : (
              <table className="w-full text-[11px]">
                <thead className="text-[9px] uppercase text-slate-400"><tr>{['Invoice', 'Date', 'Items', 'Total', 'Paid', 'Outstanding', 'Status'].map((h) => <th key={h} className="px-2 py-2 text-left font-bold">{h}</th>)}</tr></thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-t border-slate-50">
                      <td className="px-2 py-2 font-bold text-[#5419b5]">{inv.invoice_number}</td>
                      <td className="px-2 py-2 text-slate-500">{fmtDate(inv.invoice_date)}</td>
                      <td className="px-2 py-2 text-slate-500">{inv.item_count ?? 0}</td>
                      <td className="px-2 py-2 font-bold">{inr(inv.grand_total)}</td>
                      <td className="px-2 py-2 text-slate-500">{inr(inv.amount_paid)}</td>
                      <td className="px-2 py-2 text-orange-600">{inr(inv.outstanding_balance)}</td>
                      <td className="px-2 py-2"><Badge color={inv.payment_status === 'Paid' ? 'green' : inv.payment_status === 'Partially Paid' ? 'blue' : 'amber'}>{inv.payment_status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          {outstandingInvoices.length > 0 && (
            <Panel title="Outstanding Amount" icon={Wallet}>
              <p className="mb-2 text-[10px] text-slate-500">Total outstanding: <b className="text-orange-600">{inr(summary.outstanding)}</b></p>
              <table className="w-full text-[11px]">
                <thead className="text-[9px] uppercase text-slate-400"><tr>{['Invoice', 'Total', 'Paid', 'Balance'].map((h) => <th key={h} className="px-2 py-2 text-left font-bold">{h}</th>)}</tr></thead>
                <tbody>
                  {outstandingInvoices.map((inv) => (
                    <tr key={inv.id} className="border-t border-slate-50">
                      <td className="px-2 py-2 font-bold text-[#5419b5]">{inv.invoice_number}</td>
                      <td className="px-2 py-2 font-bold">{inr(inv.grand_total)}</td>
                      <td className="px-2 py-2 text-slate-500">{inr(inv.amount_paid)}</td>
                      <td className="px-2 py-2 font-bold text-orange-600">{inr(inv.outstanding_balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}

          <Panel title="Payment History" icon={Wallet}>
            {payments.length === 0 ? <EmptyState message="No payments received" /> : (
              <table className="w-full text-[11px]">
                <thead className="text-[9px] uppercase text-slate-400"><tr>{['Date', 'Reference', 'Method', 'Amount'].map((h) => <th key={h} className="px-2 py-2 text-left font-bold">{h}</th>)}</tr></thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-t border-slate-50">
                      <td className="px-2 py-2 text-slate-500">{fmtDate(p.created_at)}</td>
                      <td className="px-2 py-2 font-bold text-[#5419b5]">{p.reference || p.payment_number}</td>
                      <td className="px-2 py-2"><Badge color={p.payment_method === 'UPI' ? 'violet' : 'blue'}>{p.payment_method}</Badge></td>
                      <td className="px-2 py-2 font-bold text-emerald-600">{inr(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>

        <div className="space-y-3">
          <Panel title="Customer Information" icon={User}>
            <div className="space-y-3 text-[11px]">
              <div><p className="text-[9px] font-bold uppercase text-slate-400">Name</p><p className="font-bold">{customer.name}</p></div>
              <div><p className="text-[9px] font-bold uppercase text-slate-400">Mobile</p><p className="text-slate-500">{customer.mobile ? `+91 ${customer.mobile}` : '—'}</p></div>
              <div><p className="text-[9px] font-bold uppercase text-slate-400">Email</p><p className="text-slate-500">{customer.email || '—'}</p></div>
              <div><p className="text-[9px] font-bold uppercase text-slate-400">Address</p><p className="flex items-start gap-2 text-slate-500"><MapPin size={13} className="mt-0.5 shrink-0" />{address}</p></div>
              <div><p className="text-[9px] font-bold uppercase text-slate-400">GSTIN</p><p className="text-slate-500">{customer.gst_number || '—'}</p></div>
              <div><p className="text-[9px] font-bold uppercase text-slate-400">Customer Since</p><p className="flex items-center gap-1 text-slate-500"><Calendar size={12} />{fmtDate(customer.created_at)}</p></div>
              <div><p className="text-[9px] font-bold uppercase text-slate-400">Source</p><div className="mt-1"><SourceBadge source={customer.source} /></div></div>
              <div className="border-t border-slate-100 pt-2 text-[10px] text-slate-500"><p><b>Internal ID:</b> {customer.customer_code || '—'}</p><p className="mt-1"><b>Credit Limit:</b> {inr(customer.credit_limit)}</p><p className="mt-1"><b>Loyalty Points:</b> {customer.loyalty_points} pts</p></div>
            </div>
          </Panel>

          <Panel title="Shopify Information" icon={ShoppingBag}>
            {customer.shopify_customer_id ? (
              <div className="space-y-2 text-[11px]">
                <div className="flex justify-between"><span className="text-slate-500">Shopify Customer ID</span><b className="text-[10px]">#{customer.shopify_customer_id}</b></div>
                <div className="flex justify-between"><span className="text-slate-500">Shopify Status</span><Badge color={customer.shopify_status === 'Inactive' ? 'red' : 'green'}>{customer.shopify_status || 'Active'}</Badge></div>
                <div className="flex justify-between"><span className="text-slate-500">Last Shopify Sync</span><span className="text-[10px]">{fmtDate(customer.last_shopify_sync_at)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Shopify Orders</span><b>{shopifyCustomer?.total_orders ?? 0}</b></div>
                <div className="flex justify-between"><span className="text-slate-500">Shopify Spent</span><b>{inr(shopifyCustomer?.total_spent ?? 0)}</b></div>
                {canLink && (
                  <button onClick={unlinkShopify} disabled={busy} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><Unlink size={13} /> Unlink Shopify</button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[10px] text-slate-500">This customer is not linked to a Shopify profile.</p>
                {canLink && (
                  <button onClick={() => setShowLink(true)} className="flex w-full items-center justify-center gap-1.5 rounded-md border border-slate-200 py-2 text-[11px] font-bold text-[#5419b5] hover:bg-slate-50"><Link2 size={13} /> Link Shopify Customer</button>
                )}
              </div>
            )}
            {customer.source === 'Shopify' && !customer.customer_code && (
              <button onClick={importToInternal} disabled={busy} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-[#4714a1] py-2 text-[11px] font-bold text-white hover:bg-[#5419b5] disabled:opacity-50"><Plus size={13} /> Import to Internal Customers</button>
            )}
          </Panel>
        </div>
      </div>

      {showEdit && <CustomerFormModal customer={customer} onClose={() => setShowEdit(false)} onSaved={(saved) => { setShowEdit(false); onToast('Customer updated'); onChanged(); }} />}
      {showLink && <LinkShopifyModal customer={customer} onClose={() => setShowLink(false)} onLinked={() => { setShowLink(false); onToast('Shopify customer linked'); onChanged(); }} onToast={onToast} />}
    </div>
  );
}

function CustomerFormModal({ customer, onClose, onSaved }: { customer: Customer | null; onClose: () => void; onSaved: (saved: Customer) => void }) {
  const [form, setForm] = useState(() => ({
    name: customer?.name || '',
    mobile: customer?.mobile || '',
    email: customer?.email || '',
    gst_number: customer?.gst_number || '',
    date_of_birth: customer?.date_of_birth || '',
    address_line1: customer?.address_line1 || '',
    address_line2: customer?.address_line2 || '',
    city: customer?.city || '',
    state: customer?.state || '',
    country: customer?.country || 'India',
    pin_code: customer?.pin_code || '',
    billing_address: customer?.billing_address || '',
  }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!form.name.trim()) { setErr('Full Name is required'); return; }
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        ...form,
        mobile: form.mobile.trim() || null,
        email: form.email.trim() || null,
        date_of_birth: form.date_of_birth || null,
      };
      const saved = customer
        ? await api<Customer>(`/api/customers/${customer.id}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await api<Customer>('/api/customers', { method: 'POST', body: JSON.stringify(payload) });
      onSaved(saved);
    } catch (error) { setErr(error instanceof Error ? error.message : 'Unable to save customer'); }
    setSaving(false);
  }

  const personalFields: [string, string, string][] = [
    ['name', 'Full Name *', 'text'],
    ['mobile', 'Mobile Number', 'text'],
    ['email', 'Email', 'email'],
    ['date_of_birth', 'Date of Birth', 'date'],
    ['gst_number', 'GSTIN (optional)', 'text'],
  ];
  const addressFields: [string, string][] = [
    ['address_line1', 'Address Line 1'],
    ['address_line2', 'Address Line 2'],
    ['city', 'City'],
    ['state', 'State'],
    ['country', 'Country'],
    ['pin_code', 'PIN Code'],
  ];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><p className="text-sm font-bold">{customer ? 'Edit Customer' : 'Add New Customer'}</p><button onClick={onClose}><X size={16} /></button></div>
        <div className="space-y-3">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Personal Information</p>
          <div className="grid grid-cols-2 gap-3">
            {personalFields.map(([k, label, type]) => (
              <div key={k} className={k === 'name' ? 'col-span-2' : ''}>
                <label className="text-[9px] font-bold uppercase text-slate-400">{label}</label>
                <input type={type} value={(form as any)[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-[11px] outline-none focus:border-[#6f39bd]" />
              </div>
            ))}
          </div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Address</p>
          <div className="grid grid-cols-2 gap-3">
            {addressFields.map(([k, label]) => (
              <div key={k}>
                <label className="text-[9px] font-bold uppercase text-slate-400">{label}</label>
                <input value={(form as any)[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-[11px] outline-none focus:border-[#6f39bd]" />
              </div>
            ))}
          </div>
          {err && <p className="text-[10px] font-semibold text-red-500">{err}</p>}
          <button onClick={save} disabled={saving} className="w-full rounded-md bg-[#4714a1] py-2.5 text-[11px] font-bold text-white hover:bg-[#5419b5] disabled:opacity-50">{saving ? 'Saving...' : customer ? 'Save Changes' : 'Create Customer'}</button>
        </div>
      </div>
    </div>
  );
}

function LinkShopifyModal({ customer, onClose, onLinked, onToast }: { customer: Customer; onClose: () => void; onLinked: () => void; onToast: (message: string) => void }) {
  const [shopifyCustomers, setShopifyCustomers] = useState<ShopifySyncCustomer[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<ShopifySyncCustomer[]>('/api/customers/shopify-list').then(setShopifyCustomers).catch(() => setShopifyCustomers([]));
  }, []);

  async function link(item: ShopifySyncCustomer) {
    setBusy(true);
    try {
      await api(`/api/customers/${customer.id}/shopify-link`, { method: 'POST', body: JSON.stringify({ shopifyCustomerId: item.shopify_customer_id }) });
      onLinked();
    } catch (error) { onToast(error instanceof Error ? error.message : 'Unable to link'); }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><p className="text-sm font-bold">Link Shopify Customer</p><button onClick={onClose}><X size={16} /></button></div>
        {shopifyCustomers.length === 0 ? <EmptyState message="No synchronized Shopify customers available to link. Run a Shopify customer sync first." /> : (
          <div className="space-y-2">
            {shopifyCustomers.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-md border border-slate-100 p-3">
                <div><p className="text-[11px] font-bold">{item.name}</p><p className="text-[9px] text-slate-400">{item.mobile || item.email || '—'} · Shopify #{item.shopify_customer_id}</p></div>
                <button onClick={() => link(item)} disabled={busy} className="flex h-7 items-center gap-1 rounded-md bg-[#4714a1] px-2.5 text-[10px] font-bold text-white hover:bg-[#5419b5] disabled:opacity-50"><Link2 size={11} /> Link</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3500);
    return () => clearTimeout(timer);
  }, [onClose]);
  return <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-[#1d2945] px-4 py-3 text-xs font-semibold text-white shadow-xl">{message}</div>;
}
