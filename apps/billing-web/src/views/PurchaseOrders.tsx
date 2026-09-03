import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, ChevronDown, ClipboardList, FileText, Plus, Search, X, Ban,
  CheckCircle2, Send, Wallet, Eye, Truck, AlertTriangle,
} from 'lucide-react';
import { inr } from '@/lib/currency';
import { round2 } from '@/lib/math';
import { type Product } from '@/lib/types';
import { type CartItem } from '@/lib/sales';
import { Badge, EmptyState, statusColor } from '@/components/ui';
import { api } from '@/lib/api';

type Permissions = string[];

type PurchaseOrder = {
  id: string;
  po_number: string;
  supplier_id: string | null;
  supplier_name?: string | null;
  supplier_mobile?: string | null;
  status: string;
  po_date: string;
  expected_delivery?: string | null;
  subtotal: number;
  discount: number;
  gst_amount: number;
  round_off: number;
  grand_total: number;
  notes?: string | null;
  item_count?: number;
  total_received?: number;
  created_at?: string;
  submitted_at?: string | null;
  approved_at?: string | null;
  cancelled_at?: string | null;
};

type POItemRow = { id: string; product_id: string | null; sku: string | null; name: string; purity: string | null; unit: string; gross_weight: number; net_weight: number; stone_weight: number; quantity: number; unit_cost: number; line_total: number; received_qty: number };
type OrderDetailData = { order: PurchaseOrder; items: POItemRow[]; grns: any[]; invoices: any[] };
type PurchasesSummary = { pending_pos: number; pending_receipts: number; pending_invoices: number; outstanding: number; total_purchases: number; draft_grns: number };

export default function PurchaseOrders({ permissions }: { permissions: Permissions }) {
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [summary, setSummary] = useState<PurchasesSummary | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selected, setSelected] = useState<OrderDetailData | null>(null);

  const can = (perm: string) => permissions.includes('*') || permissions.includes(perm);

  async function load() {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (search) params.set('q', search);
      if (statusFilter !== 'All') params.set('status', statusFilter);
      setOrders(await api<PurchaseOrder[]>(`/api/purchase-orders?${params.toString()}`));
      setSummary(await api<PurchasesSummary>('/api/purchases/summary'));
    } catch { setOrders([]); setSummary(null); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter, search]);

  if (view === 'create') return <CreatePO permissions={permissions} onBack={() => { setView('list'); load(); }} onView={(d) => { setSelected(d); setView('detail'); }} />;
  if (view === 'detail' && selected) return <OrderDetail permissions={permissions} data={selected} onBack={() => { setView('list'); load(); }} onRefresh={(d) => setSelected(d)} />;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
        {[
          ['Pending POs', String(summary?.pending_pos ?? 0), 'amber', FileText],
          ['Pending Receipts', String(summary?.pending_receipts ?? 0), 'blue', Truck],
          ['Draft GRNs', String(summary?.draft_grns ?? 0), 'slate', ClipboardList],
          ['Pending Invoices', String(summary?.pending_invoices ?? 0), 'orange', FileText],
          ['Outstanding Payable', inr(summary?.outstanding ?? 0), 'red', Wallet],
          ['Total Purchases', inr(summary?.total_purchases ?? 0), 'violet', FileText],
        ].map(([label, val, color, Icon]) => {
          const I = Icon as typeof CalendarDays;
          return (
            <div key={label as string} className={`rounded-lg p-3 text-white shadow-sm bg-${color as string}`}>
              <div className="mb-2 flex items-center justify-between"><span className="text-[9px] font-medium">{label as string}</span><I size={14}/></div>
              <p className="text-sm font-bold">{val as string}</p>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-bold">Purchase Orders</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-8 items-center gap-2 rounded-md bg-slate-50 px-3 text-slate-400"><Search size={14}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="PO #, supplier, SKU..." className="w-48 bg-transparent text-xs outline-none" /></div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">
              {['All', 'Draft', 'Submitted', 'Approved', 'Ordered', 'Partially Received', 'Fully Received', 'Closed', 'Cancelled'].map((s) => <option key={s}>{s}</option>)}
            </select>
            {can('purchase.order.create') && <button onClick={() => setView('create')} className="flex h-8 items-center gap-1.5 rounded-md bg-[#4714a1] px-3 text-[11px] font-bold text-white hover:bg-[#5419b5]"><Plus size={14}/> New PO</button>}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400">
              <tr>{['PO Number', 'Date', 'Supplier', 'Items', 'Received', 'Status', 'Grand Total', 'Actions'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="px-3 py-2.5 font-bold text-[#5419b5]">{o.po_number}</td>
                  <td className="px-3 py-2.5 text-slate-500">{o.po_date}</td>
                  <td className="px-3 py-2.5"><p className="font-semibold">{o.supplier_name || '—'}</p><p className="text-[9px] text-slate-400">{o.supplier_mobile || ''}</p></td>
                  <td className="px-3 py-2.5 text-slate-500">{o.item_count ?? 0}</td>
                  <td className="px-3 py-2.5 text-slate-500">{o.total_received ?? 0}</td>
                  <td className="px-3 py-2.5"><Badge color={statusColor(o.status)}>{o.status}</Badge></td>
                  <td className="px-3 py-2.5 font-bold">{inr(o.grand_total)}</td>
                  <td className="px-3 py-2.5"><button onClick={() => openDetail(o.id)} className="grid h-6 w-6 place-items-center rounded bg-slate-100 text-slate-500 hover:bg-slate-200" title="View"><Eye size={12}/></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && <EmptyState message="No purchase orders found. Create one to get started." />}
        </div>
      </div>
    </div>
  );

  async function openDetail(id: string) {
    try { setSelected(await api<OrderDetailData>(`/api/purchase-orders/${id}`)); setView('detail'); } catch { /* keep list */ }
  }
}

// ---------------- Create PO ----------------

type Supplier = { id: string; name: string; mobile?: string | null; email?: string | null; gst_number?: string | null; payment_terms?: string | null; status?: string; credit_limit?: number; outstanding_balance?: number };
type PoLine = CartItem & { quantity: number; unit_cost: number };

function CreatePO({ permissions, onBack, onView }: { permissions: Permissions; onBack: () => void; onView: (d: OrderDetailData) => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [cart, setCart] = useState<PoLine[]>([]);
  const [discount, setDiscount] = useState(0);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [search, setSearch] = useState('');
  const [supSearch, setSupSearch] = useState('');
  const [showSup, setShowSup] = useState(false);
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    api<Product[]>('/api/products').then(setProducts).catch(() => setProducts([]));
    api<Supplier[]>('/api/suppliers').then(setSuppliers).catch(() => setSuppliers([]));
  }, []);

  const subtotal = round2(cart.reduce((s, l) => s + l.unit_cost * l.quantity, 0));
  const gstAmount = round2(cart.reduce((s, l) => s + round2(l.unit_cost * l.quantity * (l.gst_rate / 100)), 0));
  const grandTotal = Math.round(subtotal - discount + gstAmount);
  const roundOff = round2(grandTotal - (subtotal - discount + gstAmount));

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter((p) => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
  }, [products, search]);
  const filteredSuppliers = useMemo(() => {
    const q = supSearch.toLowerCase();
    return suppliers.filter((s) => s.status !== 'Inactive' && (!q || s.name.toLowerCase().includes(q) || (s.mobile || '').includes(q)));
  }, [suppliers, supSearch]);

  function addProduct(p: Product) {
    setCart((prev) => {
      const ex = prev.find((i) => i.product_id === p.id);
      if (ex) return prev.map((i) => i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product_id: p.id, sku: p.sku, name: p.name, category: p.category, purity: p.purity, gross_weight: p.gross_weight, net_weight: p.net_weight, stone_weight: p.stone_weight, making_charge: p.making_charge, stone_charge: p.stone_charge, other_charge: p.other_charge, gst_rate: p.gst_rate, quantity: 1, silver_rate: 0, unit_cost: 0 }];
    });
  }
  function updateLine(id: string, patch: Partial<PoLine>) { setCart((prev) => prev.map((i) => i.product_id === id ? { ...i, ...patch } : i)); }
  function removeLine(id: string) { setCart((prev) => prev.filter((i) => i.product_id !== id)); }

  async function save(action: 'Submit' | 'Draft') {
    if (cart.length === 0 || !supplier) { setToast('Select a supplier and add products first'); return; }
    setBusy(true);
    try {
      const lines = cart.map((l) => ({ productId: l.product_id, quantity: l.quantity, unitCost: l.unit_cost }));
      const po = await api<PurchaseOrder>('/api/purchase-orders', {
        method: 'POST',
        body: JSON.stringify({ supplierId: supplier.id, expectedDelivery: expectedDelivery || null, discount, notes: notes || null, lines }),
      });
      setToast(`PO ${po.po_number} created as Draft`);
      if (action === 'Submit') {
        try { await api(`/api/purchase-orders/${po.id}/status`, { method: 'POST', body: JSON.stringify({ action: 'Submit' }) }); setToast(`PO ${po.po_number} submitted for approval`); } catch { /* keep draft */ }
      }
      setTimeout(() => onBack(), 900);
    } catch (error) {
      setToast('Error: ' + (error instanceof Error ? error.message : 'Unable to create PO'));
    }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3"><button onClick={onBack} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">←</button><h2 className="text-base font-bold">Create Purchase Order</h2></div>
      <div className="grid gap-3 xl:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
            <div className="flex h-9 items-center gap-2 rounded-md bg-slate-50 px-3 text-slate-400"><Search size={15}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products by SKU, name, category..." className="w-full bg-transparent text-xs outline-none" /></div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {filteredProducts.map((p) => (
                <button key={p.id} onClick={() => addProduct(p)} className="rounded-lg border border-slate-100 p-2.5 text-left hover:border-[#cab4f3]">
                  <p className="text-[10px] font-bold leading-tight">{p.name}</p>
                  <p className="text-[9px] text-slate-400">{p.sku}</p>
                  <p className="mt-1 text-[11px] font-bold text-[#5419b5]">Stock: {p.stock_qty}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><p className="text-xs font-bold">PO Line Items <span className="text-[9px] font-semibold text-slate-400">{cart.length} item(s)</span></p>{cart.length > 0 && <button onClick={() => setCart([])} className="text-[9px] font-semibold text-red-500 hover:underline">Clear</button>}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 text-[9px] uppercase text-slate-400"><tr>{['Product', 'Purity', 'Qty', 'Unit Cost', 'Line Total', ''].map((h) => <th key={h} className="px-2 py-2 text-left font-bold">{h}</th>)}</tr></thead>
                <tbody>
                  {cart.map((l) => (
                    <tr key={l.product_id} className="border-t border-slate-50">
                      <td className="px-2 py-2 font-semibold">{l.name}<p className="text-[9px] text-slate-400">{l.sku}</p></td>
                      <td className="px-2 py-2 text-slate-500">{l.purity}</td>
                      <td className="px-2 py-2"><input type="number" min={1} value={l.quantity} onChange={(e) => updateLine(l.product_id, { quantity: Math.max(1, +e.target.value) })} className="h-6 w-12 rounded border border-slate-200 px-1 text-right outline-none" /></td>
                      <td className="px-2 py-2"><input type="number" min={0} value={l.unit_cost} onChange={(e) => updateLine(l.product_id, { unit_cost: Math.max(0, +e.target.value) })} className="h-6 w-16 rounded border border-slate-200 px-1 text-right outline-none" /></td>
                      <td className="px-2 py-2 font-bold">{inr(round2(l.unit_cost * l.quantity))}</td>
                      <td className="px-2 py-2"><button onClick={() => removeLine(l.product_id)} className="text-slate-300 hover:text-red-500"><X size={12}/></button></td>
                    </tr>
                  ))}
                  {cart.length === 0 && <tr><td colSpan={6}><EmptyState message="Add products to the PO" /></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
            <p className="border-b border-slate-100 px-4 py-3 text-xs font-bold">Supplier & Delivery</p>
            <div className="space-y-3 p-4">
              <button onClick={() => setShowSup(true)} className="flex w-full items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-left text-[11px]">
                <span>{supplier ? <><span className="font-bold">{supplier.name}</span><p className="text-[9px] text-slate-400">{supplier.payment_terms || '—'} · {supplier.gst_number || 'No GST'}</p></> : 'Select Supplier (required)'}</span>
                <ChevronDown size={14} className="text-slate-400"/>
              </button>
              <div><label className="text-[9px] font-bold uppercase text-slate-400">Expected Delivery</label><input type="date" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-[11px] outline-none" /></div>
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
            <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-3">
              <button onClick={() => save('Draft')} disabled={busy} className="rounded-md bg-slate-100 py-2.5 text-[10px] font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-50">{busy ? 'Saving...' : 'Save Draft'}</button>
              <button onClick={() => save('Submit')} disabled={busy} className="flex items-center justify-center gap-1 rounded-md bg-[#4714a1] py-2.5 text-[10px] font-bold text-white hover:bg-[#5419b5] disabled:opacity-50"><Send size={12}/>{busy ? 'Submitting...' : 'Submit for Approval'}</button>
            </div>
          </div>
        </div>
      </div>

      {showSup && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => setShowSup(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold">Select Supplier</p><button onClick={() => setShowSup(false)}><X size={16}/></button></div>
            <div className="mb-3 flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2"><Search size={14}/><input value={supSearch} onChange={(e) => setSupSearch(e.target.value)} placeholder="Search supplier..." className="w-full bg-transparent text-xs outline-none" /></div>
            <div className="max-h-60 overflow-y-auto">
              {filteredSuppliers.map((s) => <button key={s.id} onClick={() => { setSupplier(s); setShowSup(false); }} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-slate-50"><div><p className="text-[11px] font-bold">{s.name}</p><p className="text-[9px] text-slate-400">{s.mobile || '—'} · {s.payment_terms || '—'}</p></div><span className="text-[9px] text-slate-400">Outstanding: {inr(s.outstanding_balance ?? 0)}</span></button>)}
            </div>
          </div>
        </div>
      )}
      {toast && <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-[#1d2945] px-4 py-3 text-xs font-semibold text-white shadow-xl">{toast}</div>}
    </div>
  );
}

// ---------------- PO detail ----------------

function OrderDetail({ permissions, data, onBack, onRefresh }: { permissions: Permissions; data: OrderDetailData; onBack: () => void; onRefresh: (d: OrderDetailData) => void }) {
  const { order, items, grns, invoices } = data;
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const can = (perm: string) => permissions.includes('*') || permissions.includes(perm);

  async function refresh() {
    try { onRefresh(await api<OrderDetailData>(`/api/purchase-orders/${order.id}`)); } catch { /* keep */ }
  }

  async function setStatus(action: 'Submit' | 'Approve' | 'Cancel') {
    if (action === 'Cancel' && !cancelReason.trim()) { setToast('A cancellation reason is required'); return; }
    setBusy(action);
    try {
      await api(`/api/purchase-orders/${order.id}/status`, { method: 'POST', body: JSON.stringify({ action, reason: action === 'Cancel' ? cancelReason.trim() : null }) });
      setShowCancel(false);
      setToast(action === 'Submit' ? 'PO submitted' : action === 'Approve' ? 'PO approved' : 'PO cancelled');
      await refresh();
    } catch (error) { setToast('Error: ' + (error instanceof Error ? error.message : 'Unable to update PO')); }
    setBusy(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3"><button onClick={onBack} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">←</button><h2 className="text-base font-bold">PO {order.po_number}</h2><Badge color={statusColor(order.status)}>{order.status}</Badge></div>
      </div>
      <div className="grid gap-3 xl:grid-cols-[1fr_280px]">
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-4">
            <div><p className="text-sm font-bold">Opal Line Jewelry</p><p className="text-[9px] text-slate-400">92.5 Sterling Silver Jewellery</p></div>
            <div className="text-right"><p className="text-[10px] text-slate-400">{order.po_number}</p><p className="text-[10px] text-slate-400">{order.po_date}</p></div>
          </div>
          <div className="mb-4 text-[11px]"><p className="text-[9px] font-bold uppercase text-slate-400">Supplier</p><p className="mt-1 font-bold">{order.supplier_name || '—'}</p><p className="text-slate-500">{order.supplier_mobile || '—'}</p>{order.expected_delivery && <p className="mt-1 text-slate-500">Expected delivery: <b>{order.expected_delivery}</b></p>}</div>
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-[9px] uppercase text-slate-400"><tr>{['Item', 'Purity', 'Qty', 'Received', 'Unit Cost', 'Line Total'].map((h) => <th key={h} className="px-2 py-2 text-left font-bold">{h}</th>)}</tr></thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t border-slate-50">
                  <td className="px-2 py-2 font-semibold">{it.name}<p className="text-[9px] text-slate-400">{it.sku}</p></td>
                  <td className="px-2 py-2 text-slate-500">{it.purity}</td>
                  <td className="px-2 py-2">{it.quantity}</td>
                  <td className="px-2 py-2 font-bold text-emerald-600">{it.received_qty}</td>
                  <td className="px-2 py-2 font-bold">{inr(it.unit_cost)}</td>
                  <td className="px-2 py-2 font-bold">{inr(it.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 ml-auto w-56 space-y-1.5 text-[11px]">
            <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{inr(order.subtotal)}</span></div>
            <div className="flex justify-between text-slate-500"><span>Discount</span><span>-{inr(order.discount)}</span></div>
            <div className="flex justify-between text-slate-500"><span>GST</span><span>{inr(order.gst_amount)}</span></div>
            <div className="flex justify-between text-slate-500"><span>Round Off</span><span>{inr(order.round_off)}</span></div>
            <div className="flex justify-between border-t border-slate-100 pt-1.5 text-sm font-bold"><span>Grand Total</span><span className="text-[#5419b5]">{inr(order.grand_total)}</span></div>
          </div>
          {order.notes && <p className="mt-4 rounded-md bg-slate-50 p-2 text-[10px] text-slate-500">{order.notes}</p>}
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
            <p className="border-b border-slate-100 px-4 py-3 text-xs font-bold">Actions</p>
            <div className="grid grid-cols-1 gap-2 p-3">
              {order.status === 'Draft' && can('purchase.order.edit') && (
                <button onClick={() => setStatus('Submit')} disabled={!!busy} className="flex items-center justify-center gap-1.5 rounded-md bg-[#4714a1] py-2.5 text-[10px] font-bold text-white hover:bg-[#5419b5] disabled:opacity-50"><Send size={13}/>{busy === 'Submit' ? 'Submitting...' : 'Submit for Approval'}</button>
              )}
              {['Draft', 'Submitted'].includes(order.status) && can('purchase.order.approve') && (
                <button onClick={() => setStatus('Approve')} disabled={!!busy} className="flex items-center justify-center gap-1.5 rounded-md bg-emerald-500 py-2.5 text-[10px] font-bold text-white hover:bg-emerald-600 disabled:opacity-50"><CheckCircle2 size={13}/>{busy === 'Approve' ? 'Approving...' : 'Approve PO'}</button>
              )}
              {!['Fully Received', 'Closed', 'Cancelled'].includes(order.status) && can('purchase.order.cancel') && (
                <button onClick={() => setShowCancel(true)} className="flex items-center justify-center gap-1.5 rounded-md border border-red-200 py-2.5 text-[10px] font-bold text-red-600 hover:bg-red-50"><Ban size={13}/> Cancel PO</button>
              )}
            </div>
          </div>
          {(grns.length > 0 || invoices.length > 0) && (
            <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
              <p className="border-b border-slate-100 px-4 py-3 text-xs font-bold">Linked Documents</p>
              <div className="space-y-2 p-3 text-[10px]">
                {grns.map((g) => <div key={g.id} className="flex justify-between"><span className="text-slate-500">GRN {g.grn_number}</span><Badge color={statusColor(g.status)}>{g.status}</Badge></div>)}
                {invoices.map((i) => <div key={i.id} className="flex justify-between"><span className="text-slate-500">Invoice {i.pi_number}</span><span className="font-bold">{inr(i.grand_total)}</span></div>)}
              </div>
            </div>
          )}
          <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
            <p className="border-b border-slate-100 px-4 py-3 text-xs font-bold">Audit</p>
            <div className="space-y-2 p-3 text-[10px]">
              {[['Created', String(order.created_at || '').slice(0, 16) || '—'], ['Submitted', String(order.submitted_at || '').slice(0, 16) || '—'], ['Approved', String(order.approved_at || '').slice(0, 16) || '—'], ['Cancelled', String(order.cancelled_at || '').slice(0, 16) || '—']].map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-slate-500">{k}</span><b>{v}</b></div>)}
            </div>
          </div>
        </div>
      </div>

      {showCancel && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => setShowCancel(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold"><AlertTriangle size={14} className="mr-1 inline text-red-500"/>Cancel PO</p><button onClick={() => setShowCancel(false)}><X size={16}/></button></div>
            <label className="mt-3 block text-[9px] font-bold uppercase text-slate-400">Reason (required)</label>
            <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-xs outline-none" rows={2} />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setShowCancel(false)} className="rounded-md border border-slate-200 py-2 text-[10px] font-bold text-slate-600">Keep PO</button>
              <button onClick={() => setStatus('Cancel')} disabled={!!busy} className="rounded-md bg-red-500 py-2 text-[10px] font-bold text-white disabled:opacity-50">{busy === 'Cancel' ? 'Cancelling...' : 'Cancel PO'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-[#1d2945] px-4 py-3 text-xs font-semibold text-white shadow-xl">{toast}</div>}
    </div>
  );
}
