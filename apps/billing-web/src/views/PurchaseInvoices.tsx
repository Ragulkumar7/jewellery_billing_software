import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Eye, X, FileText, CheckCircle2, Wallet, Ban, AlertTriangle, ChevronDown } from 'lucide-react';
import { inr } from '@/lib/currency';
import { round2 } from '@/lib/math';
import { type Product } from '@/lib/types';
import { Badge, EmptyState, statusColor } from '@/components/ui';
import { api } from '@/lib/api';

type Permissions = string[];

type PurchaseInvoice = {
  id: string;
  pi_number: string;
  supplier_id: string | null;
  supplier_name?: string | null;
  supplier_invoice_number?: string | null;
  status: string;
  payment_status: string;
  pi_date: string;
  due_date?: string | null;
  po_id?: string | null;
  po_number?: string | null;
  grn_id?: string | null;
  grn_number?: string | null;
  subtotal: number;
  discount: number;
  gst_amount: number;
  round_off: number;
  grand_total: number;
  amount_paid: number;
  outstanding_balance: number;
  notes?: string | null;
  item_count?: number;
  approved_at?: string | null;
  cancelled_at?: string | null;
};

type PIItemRow = { id: string; pi_id: string; product_id: string | null; sku: string | null; name: string; quantity: number; unit_cost: number; line_total: number; gst_rate: number; gst_amount: number };
type PaymentRow = { id: string; payment_number: string; amount: number; payment_method: string; reference: string | null; created_at: string };
type PIDetailData = { invoice: PurchaseInvoice; items: PIItemRow[]; payments: PaymentRow[] };

type Supplier = { id: string; name: string; mobile?: string | null; email?: string | null; gst_number?: string | null; payment_terms?: string | null; status?: string; outstanding_balance?: number };
type GRN = { id: string; grn_number: string; po_id: string | null; po_number?: string | null; supplier_id: string | null; supplier_name?: string | null; status: string; grn_date: string };
type CartLine = { product_id: string; sku: string; name: string; gst_rate: number; quantity: number; unit_cost: number };

export default function PurchaseInvoices({ permissions }: { permissions: Permissions }) {
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [paymentFilter, setPaymentFilter] = useState('All');
  const [selected, setSelected] = useState<PIDetailData | null>(null);

  const can = (perm: string) => permissions.includes('*') || permissions.includes(perm);

  async function load() {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (search) params.set('q', search);
      if (statusFilter !== 'All') params.set('status', statusFilter);
      if (paymentFilter !== 'All') params.set('payment', paymentFilter);
      setInvoices(await api<PurchaseInvoice[]>(`/api/purchase-invoices?${params.toString()}`));
    } catch { setInvoices([]); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter, paymentFilter, search]);

  if (view === 'create') return <CreatePI permissions={permissions} onBack={() => { setView('list'); load(); }} onView={(d) => { setSelected(d); setView('detail'); }} />;
  if (view === 'detail' && selected) return <PIDetail permissions={permissions} data={selected} onBack={() => { setView('list'); load(); }} onRefresh={(d) => setSelected(d)} />;

  const outstanding = invoices.filter((i) => !['Cancelled', 'Paid'].includes(i.status)).reduce((s, i) => s + i.outstanding_balance, 0);
  const totalValue = invoices.filter((i) => i.status !== 'Cancelled').reduce((s, i) => s + i.grand_total, 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
        {[
          ['Total Invoices', String(invoices.length), 'navy', FileText],
          ['Draft', String(invoices.filter((i) => i.status === 'Draft').length), 'amber', FileText],
          ['Approved', String(invoices.filter((i) => i.status === 'Approved').length), 'green', CheckCircle2],
          ['Paid', String(invoices.filter((i) => i.payment_status === 'Paid').length), 'green', Wallet],
          ['Outstanding', inr(outstanding), 'orange', Wallet],
          ['Total Value', inr(totalValue), 'violet', FileText],
        ].map(([label, val, color, Icon]) => {
          const I = Icon as typeof FileText;
          return <div key={label as string} className={`rounded-lg p-3 text-white shadow-sm bg-${color as string}`}><div className="mb-2 flex items-center justify-between"><span className="text-[9px] font-medium">{label as string}</span><I size={14}/></div><p className="text-sm font-bold">{val as string}</p></div>;
        })}
      </div>
      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-bold">Purchase Invoices</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-8 items-center gap-2 rounded-md bg-slate-50 px-3 text-slate-400"><Search size={14}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Invoice #, supplier, item..." className="w-48 bg-transparent text-xs outline-none" /></div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">{['All', 'Draft', 'Approved', 'Partially Paid', 'Paid', 'Cancelled'].map((s) => <option key={s}>{s}</option>)}</select>
            <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">{['All', 'Unpaid', 'Partially Paid', 'Paid'].map((s) => <option key={s}>{s}</option>)}</select>
            {can('purchase.invoice.create') && <button onClick={() => setView('create')} className="flex h-8 items-center gap-1.5 rounded-md bg-[#4714a1] px-3 text-[11px] font-bold text-white hover:bg-[#5419b5]"><Plus size={14}/> New Invoice</button>}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400"><tr>{['PI Number', 'Supplier Inv #', 'Date', 'Supplier', 'PO', 'GRN', 'Status', 'Payment', 'Grand Total', 'Outstanding', 'Actions'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr></thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="px-3 py-2.5 font-bold text-[#5419b5]">{inv.pi_number}</td>
                  <td className="px-3 py-2.5 text-slate-500">{inv.supplier_invoice_number || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500">{inv.pi_date}</td>
                  <td className="px-3 py-2.5 font-semibold">{inv.supplier_name || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500">{inv.po_number || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500">{inv.grn_number || '—'}</td>
                  <td className="px-3 py-2.5"><Badge color={statusColor(inv.status)}>{inv.status}</Badge></td>
                  <td className="px-3 py-2.5"><Badge color={statusColor(inv.payment_status)}>{inv.payment_status}</Badge></td>
                  <td className="px-3 py-2.5 font-bold">{inr(inv.grand_total)}</td>
                  <td className="px-3 py-2.5 text-orange-600">{inr(inv.outstanding_balance)}</td>
                  <td className="px-3 py-2.5"><button onClick={() => openDetail(inv.id)} className="grid h-6 w-6 place-items-center rounded bg-slate-100 text-slate-500 hover:bg-slate-200"><Eye size={12}/></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {invoices.length === 0 && <EmptyState message="No purchase invoices found. Create one to get started." />}
        </div>
      </div>
    </div>
  );

  async function openDetail(id: string) {
    try { setSelected(await api<PIDetailData>(`/api/purchase-invoices/${id}`)); setView('detail'); } catch { /* keep list */ }
  }
}

// ---------------- Create PI ----------------

function CreatePI({ permissions, onBack, onView }: { permissions: Permissions; onBack: () => void; onView: (d: PIDetailData) => void }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [grns, setGrns] = useState<GRN[]>([]);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [grn, setGrn] = useState<GRN | null>(null);
  const [showSup, setShowSup] = useState(false);
  const [showGRN, setShowGRN] = useState(false);
  const [supSearch, setSupSearch] = useState('');
  const [grnSearch, setGrnSearch] = useState('');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [supplierInvNo, setSupplierInvNo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    api<Supplier[]>('/api/suppliers').then(setSuppliers).catch(() => setSuppliers([]));
    api<Product[]>('/api/products').then(setProducts).catch(() => setProducts([]));
    api<GRN[]>('/api/grns?status=Approved').then(setGrns).catch(() => setGrns([]));
  }, []);

  const subtotal = round2(lines.reduce((s, l) => s + l.unit_cost * l.quantity, 0));
  const gstAmount = round2(lines.reduce((s, l) => s + round2(l.unit_cost * l.quantity * (l.gst_rate / 100)), 0));
  const grandTotal = Math.round(subtotal - discount + gstAmount);
  const roundOff = round2(grandTotal - (subtotal - discount + gstAmount));

  const filteredSuppliers = useMemo(() => { const q = supSearch.toLowerCase(); return suppliers.filter((s) => s.status !== 'Inactive' && (!q || s.name.toLowerCase().includes(q) || (s.mobile || '').includes(q))); }, [suppliers, supSearch]);
  const filteredGRNs = useMemo(() => { const q = grnSearch.toLowerCase(); return grns.filter((g) => !q || g.grn_number.toLowerCase().includes(q) || (g.supplier_name || '').toLowerCase().includes(q) || (g.po_number || '').toLowerCase().includes(q)); }, [grns, grnSearch]);
  const filteredProducts = useMemo(() => { const q = productSearch.toLowerCase(); return products.filter((p) => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)); }, [products, productSearch]);

  function addProduct(p: Product) {
    setLines((prev) => {
      const ex = prev.find((l) => l.product_id === p.id);
      if (ex) return prev.map((l) => l.product_id === p.id ? { ...l, quantity: l.quantity + 1 } : l);
      return [...prev, { product_id: p.id, sku: p.sku, name: p.name, gst_rate: p.gst_rate, quantity: 1, unit_cost: 0 }];
    });
  }
  function updateLine(i: number, patch: Partial<CartLine>) { setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l)); }
  function removeLine(i: number) { setLines((prev) => prev.filter((_, idx) => idx !== i)); }

  async function save() {
    if (!supplier || lines.length === 0) { setToast('Select supplier and add items'); return; }
    setBusy(true);
    try {
      const payload = {
        supplierId: supplier.id,
        supplierInvoiceNumber: supplierInvNo || null,
        dueDate: dueDate || null,
        poId: grn?.po_id || null,
        grnId: grn?.id || null,
        discount,
        notes: notes || null,
        lines: lines.map((l) => ({ productId: l.product_id, quantity: l.quantity, unitCost: l.unit_cost, gstRate: l.gst_rate })),
      };
      const invoice = await api<PurchaseInvoice>('/api/purchase-invoices', { method: 'POST', body: JSON.stringify(payload) });
      setToast(`Invoice ${invoice.pi_number} created as Draft`);
      setTimeout(() => onBack(), 900);
    } catch (error) {
      setToast('Error: ' + (error instanceof Error ? error.message : 'Unable to create invoice'));
    }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3"><button onClick={onBack} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">←</button><h2 className="text-base font-bold">Create Purchase Invoice</h2></div>
      <div className="grid gap-3 xl:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
            <div className="flex h-9 items-center gap-2 rounded-md bg-slate-50 px-3 text-slate-400"><Search size={15}/><input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Search products..." className="w-full bg-transparent text-xs outline-none" /></div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {filteredProducts.map((p) => (<button key={p.id} onClick={() => addProduct(p)} className="rounded-lg border border-slate-100 p-2.5 text-left hover:border-[#cab4f3]"><p className="text-[10px] font-bold leading-tight">{p.name}</p><p className="text-[9px] text-slate-400">{p.sku}</p><p className="mt-1 text-[11px] font-bold text-[#5419b5]">GST {p.gst_rate}%</p></button>))}
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><p className="text-xs font-bold">Invoice Items <span className="text-[9px] font-semibold text-slate-400">{lines.length} item(s)</span></p>{lines.length > 0 && <button onClick={() => setLines([])} className="text-[9px] font-semibold text-red-500 hover:underline">Clear</button>}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 text-[9px] uppercase text-slate-400"><tr>{['Item', 'GST %', 'Qty', 'Unit Cost', 'Line Total', ''].map((h) => <th key={h} className="px-2 py-2 text-left font-bold">{h}</th>)}</tr></thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className="border-t border-slate-50">
                      <td className="px-2 py-2 font-semibold">{l.name}<p className="text-[9px] text-slate-400">{l.sku}</p></td>
                      <td className="px-2 py-2 text-slate-500">{l.gst_rate}%</td>
                      <td className="px-2 py-2"><input type="number" min={1} value={l.quantity} onChange={(e) => updateLine(i, { quantity: Math.max(1, +e.target.value) })} className="h-6 w-12 rounded border border-slate-200 px-1 text-right outline-none" /></td>
                      <td className="px-2 py-2"><input type="number" min={0} value={l.unit_cost} onChange={(e) => updateLine(i, { unit_cost: Math.max(0, +e.target.value) })} className="h-6 w-16 rounded border border-slate-200 px-1 text-right outline-none" /></td>
                      <td className="px-2 py-2 font-bold">{inr(round2(l.unit_cost * l.quantity))}</td>
                      <td className="px-2 py-2"><button onClick={() => removeLine(i)} className="text-slate-300 hover:text-red-500"><X size={12}/></button></td>
                    </tr>
                  ))}
                  {lines.length === 0 && <tr><td colSpan={6}><EmptyState message="Add products to the invoice" /></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
            <p className="border-b border-slate-100 px-4 py-3 text-xs font-bold">Invoice Details</p>
            <div className="space-y-3 p-4">
              <button onClick={() => setShowSup(true)} className="flex w-full items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-left text-[11px]">
                <span>{supplier ? <><span className="font-bold">{supplier.name}</span><p className="text-[9px] text-slate-400">{supplier.payment_terms || '—'} · Outstanding: {inr(supplier.outstanding_balance ?? 0)}</p></> : 'Select supplier (required)'}</span>
                <ChevronDown size={14} className="text-slate-400"/>
              </button>
              <button onClick={() => setShowGRN(true)} className="flex w-full items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-left text-[11px]">
                <span>{grn ? <><span className="font-bold">{grn.grn_number}</span><p className="text-[9px] text-slate-400">PO: {grn.po_number || '—'} · {grn.supplier_name}</p></> : 'Link GRN (optional — enables quantity check)'}</span>
                <ChevronDown size={14} className="text-slate-400"/>
              </button>
              <div><label className="text-[9px] font-bold uppercase text-slate-400">Supplier Invoice #</label><input value={supplierInvNo} onChange={(e) => setSupplierInvNo(e.target.value)} className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-[11px] outline-none" /></div>
              <div><label className="text-[9px] font-bold uppercase text-slate-400">Due Date</label><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-[11px] outline-none" /></div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
            <p className="border-b border-slate-100 px-4 py-3 text-xs font-bold">Totals</p>
            <div className="space-y-2 p-4 text-[11px]">
              <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{inr(subtotal)}</span></div>
              <div className="flex justify-between text-slate-500"><span>Discount</span><input type="number" min={0} value={discount || ''} onChange={(e) => setDiscount(Math.max(0, +e.target.value))} className="w-20 rounded border border-slate-200 px-1 text-right outline-none" placeholder="0"/></div>
              <div className="flex justify-between text-slate-500"><span>GST</span><span>{inr(gstAmount)}</span></div>
              <div className="flex justify-between text-slate-500"><span>Round Off</span><span>{inr(roundOff)}</span></div>
              <div className="flex justify-between border-t border-slate-100 pt-2 text-sm font-bold"><span>Grand Total</span><span className="text-[#5419b5]">{inr(grandTotal)}</span></div>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes / remarks..." className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-[10px] outline-none" rows={2} />
            </div>
            <div className="border-t border-slate-100 p-3"><button onClick={save} disabled={busy} className="w-full rounded-md bg-[#4714a1] py-2.5 text-[11px] font-bold text-white hover:bg-[#5419b5] disabled:opacity-50">{busy ? 'Saving...' : 'Save Invoice (Draft)'}</button></div>
          </div>
        </div>
      </div>

      {showSup && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => setShowSup(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold">Select Supplier</p><button onClick={() => setShowSup(false)}><X size={16}/></button></div>
            <div className="mb-3 flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2"><Search size={14}/><input value={supSearch} onChange={(e) => setSupSearch(e.target.value)} placeholder="Search supplier..." className="w-full bg-transparent text-xs outline-none" /></div>
            <div className="max-h-60 overflow-y-auto">
              {filteredSuppliers.map((s) => <button key={s.id} onClick={() => { setSupplier(s); setShowSup(false); }} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-slate-50"><div><p className="text-[11px] font-bold">{s.name}</p><p className="text-[9px] text-slate-400">{s.mobile || '—'} · {s.payment_terms || '—'}</p></div><span className="text-[9px] text-slate-400">{inr(s.outstanding_balance ?? 0)}</span></button>)}
            </div>
          </div>
        </div>
      )}

      {showGRN && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => setShowGRN(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold">Link GRN</p><button onClick={() => setShowGRN(false)}><X size={16}/></button></div>
            <div className="mb-3 flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2"><Search size={14}/><input value={grnSearch} onChange={(e) => setGrnSearch(e.target.value)} placeholder="Search GRN..." className="w-full bg-transparent text-xs outline-none" /></div>
            <div className="max-h-60 overflow-y-auto">
              {filteredGRNs.map((g) => <button key={g.id} onClick={() => { setGrn(g); setShowGRN(false); }} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-slate-50"><div><p className="text-[11px] font-bold text-[#5419b5]">{g.grn_number}</p><p className="text-[9px] text-slate-400">{g.supplier_name || '—'} · PO: {g.po_number || '—'}</p></div><Badge color="green">Approved</Badge></button>)}
            </div>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-[#1d2945] px-4 py-3 text-xs font-semibold text-white shadow-xl">{toast}</div>}
    </div>
  );
}

// ---------------- PI detail ----------------

function PIDetail({ permissions, data, onBack, onRefresh }: { permissions: Permissions; data: PIDetailData; onBack: () => void; onRefresh: (d: PIDetailData) => void }) {
  const { invoice, items, payments } = data;
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [payAmount, setPayAmount] = useState(invoice.outstanding_balance);
  const [payMethod, setPayMethod] = useState('Cash');
  const [showPay, setShowPay] = useState(false);

  const can = (perm: string) => permissions.includes('*') || permissions.includes(perm);

  async function refresh() {
    try { onRefresh(await api<PIDetailData>(`/api/purchase-invoices/${invoice.id}`)); } catch { /* keep */ }
  }

  async function setStatus(action: 'Approve' | 'Cancel') {
    if (action === 'Cancel' && !cancelReason.trim()) { setToast('A cancellation reason is required'); return; }
    setBusy(action);
    try {
      await api(`/api/purchase-invoices/${invoice.id}/status`, { method: 'POST', body: JSON.stringify({ action, reason: action === 'Cancel' ? cancelReason.trim() : null }) });
      setShowCancel(false);
      setToast(action === 'Approve' ? 'Invoice approved — payable posted' : 'Invoice cancelled');
      await refresh();
    } catch (error) { setToast('Error: ' + (error instanceof Error ? error.message : 'Unable to update invoice')); }
    setBusy(null);
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
        <div className="flex items-center gap-3"><button onClick={onBack} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">←</button><h2 className="text-base font-bold">Invoice {invoice.pi_number}</h2><Badge color={statusColor(invoice.status)}>{invoice.status}</Badge><Badge color={statusColor(invoice.payment_status)}>{invoice.payment_status}</Badge></div>
      </div>
      <div className="grid gap-3 xl:grid-cols-[1fr_280px]">
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-4"><div><p className="text-sm font-bold">Opal Line Jewelry</p><p className="text-[9px] text-slate-400">Purchase Invoice</p></div><div className="text-right"><p className="text-[10px] font-bold">{invoice.pi_number}</p><p className="text-[10px] text-slate-400">{invoice.pi_date}</p></div></div>
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
              <div className="space-y-1.5">{payments.map((p) => <div key={p.id} className="flex items-center justify-between rounded-md bg-slate-50 p-2 text-[10px]"><span className="font-bold">{p.payment_number}</span><span className="text-slate-500">{p.payment_method} · {String(p.created_at || '').slice(0, 16)}</span><b>{inr(p.amount)}</b></div>)}</div>
            </div>
          )}
          {invoice.notes && <p className="mt-4 rounded-md bg-slate-50 p-2 text-[10px] text-slate-500">{invoice.notes}</p>}
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
            <p className="border-b border-slate-100 px-4 py-3 text-xs font-bold">Actions</p>
            <div className="grid grid-cols-1 gap-2 p-3">
              {invoice.status === 'Draft' && can('purchase.invoice.approve') && (
                <button onClick={() => setStatus('Approve')} disabled={!!busy} className="flex items-center justify-center gap-1.5 rounded-md bg-emerald-500 py-2.5 text-[10px] font-bold text-white hover:bg-emerald-600 disabled:opacity-50"><CheckCircle2 size={13}/>{busy === 'Approve' ? 'Approving...' : 'Approve Invoice'}</button>
              )}
              {['Approved', 'Partially Paid', 'Unpaid'].includes(invoice.status) && invoice.outstanding_balance > 0 && can('accounts.payment.create') && (
                <button onClick={() => { setPayAmount(invoice.outstanding_balance); setShowPay(true); }} className="flex items-center justify-center gap-1.5 rounded-md bg-[#4714a1] py-2.5 text-[10px] font-bold text-white hover:bg-[#5419b5]"><Wallet size={13}/> Record Payment</button>
              )}
              {!['Approved', 'Partially Paid', 'Paid', 'Cancelled'].includes(invoice.status) && can('purchase.invoice.cancel') && (
                <button onClick={() => setShowCancel(true)} className="flex items-center justify-center gap-1.5 rounded-md border border-red-200 py-2.5 text-[10px] font-bold text-red-600 hover:bg-red-50"><Ban size={13}/> Cancel Invoice</button>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
            <p className="border-b border-slate-100 px-4 py-3 text-xs font-bold">Invoice Info</p>
            <div className="space-y-2 p-3 text-[10px]">
              {[['Items', String(items.length)], ['Supplier GST', '—'], ['Approved', String(invoice.approved_at || '').slice(0, 16) || '—'], ['Cancelled', String(invoice.cancelled_at || '').slice(0, 16) || '—']].map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-slate-500">{k}</span><b>{v}</b></div>)}
            </div>
          </div>
        </div>
      </div>

      {showCancel && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => setShowCancel(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold"><AlertTriangle size={14} className="mr-1 inline text-red-500"/>Cancel Invoice</p><button onClick={() => setShowCancel(false)}><X size={16}/></button></div>
            <label className="mt-3 block text-[9px] font-bold uppercase text-slate-400">Reason (required)</label>
            <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-xs outline-none" rows={2} />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setShowCancel(false)} className="rounded-md border border-slate-200 py-2 text-[10px] font-bold text-slate-600">Keep Invoice</button>
              <button onClick={() => setStatus('Cancel')} disabled={!!busy} className="rounded-md bg-red-500 py-2 text-[10px] font-bold text-white disabled:opacity-50">{busy === 'Cancel' ? 'Cancelling...' : 'Cancel Invoice'}</button>
            </div>
          </div>
        </div>
      )}

      {showPay && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => setShowPay(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold"><Wallet size={14} className="mr-1 inline text-[#5419b5]"/>Record Payment</p><button onClick={() => setShowPay(false)}><X size={16}/></button></div>
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
