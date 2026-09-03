import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, ChevronDown, ClipboardList, FileText, Plus, Search, X, Ban,
  CheckCircle2, ArrowRightCircle, Wallet, AlertTriangle, Eye,
} from 'lucide-react';
import { computeCartTotals, computeUnitPrice, type CartItem } from '@/lib/sales';
import { inr } from '@/lib/currency';
import { type Product } from '@/lib/types';
import { importShopifyCustomer, searchCustomers, type CustomerSelection } from '@/lib/customer-search';
import { Badge, EmptyState, statusColor } from '@/components/ui';
import { api } from '@/lib/api';
import { useSilverRate } from '@/lib/silver-rate-context';

type Permissions = string[];

export type SalesOrder = {
  id: string;
  order_number: string;
  customer_id: string | null;
  customer_name?: string;
  customer_mobile?: string | null;
  status: string;
  order_date: string;
  subtotal: number;
  discount: number;
  gst_amount: number;
  round_off: number;
  grand_total: number;
  advance_amount: number;
  silver_rate: number;
  notes?: string | null;
  source?: string;
  shopify_order_id?: string | null;
  item_count?: number;
  confirmed_at?: string | null;
  cancelled_at?: string | null;
};

type OrderItemRow = { id: string; product_id: string | null; sku: string | null; name: string; purity: string | null; gross_weight: number; net_weight: number; stone_weight: number; silver_rate: number; making_charge: number; stone_charge: number; other_charge: number; gst_rate: number; quantity: number; unit_price: number; line_total: number };
type OrderDetailData = { order: SalesOrder; items: OrderItemRow[] };

export default function SalesOrders({ permissions }: { permissions: Permissions }) {
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sourceFilter, setSourceFilter] = useState('All');
  const [selected, setSelected] = useState<OrderDetailData | null>(null);

  const can = (perm: string) => permissions.includes('*') || permissions.includes(perm);

  async function load() {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (search) params.set('q', search);
      if (statusFilter !== 'All') params.set('status', statusFilter);
      if (sourceFilter !== 'All') params.set('source', sourceFilter);
      setOrders(await api<SalesOrder[]>(`/api/sales/orders?${params.toString()}`));
    } catch { setOrders([]); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter, sourceFilter, search]);

  const stats = useMemo(() => {
    const confirmed = orders.filter((o) => o.status === 'Confirmed').length;
    const draft = orders.filter((o) => o.status === 'Draft').length;
    const converted = orders.filter((o) => o.status === 'Converted').length;
    const cancelled = orders.filter((o) => o.status === 'Cancelled').length;
    const value = orders.filter((o) => !['Cancelled', 'Converted'].includes(o.status)).reduce((s, o) => s + o.grand_total, 0);
    return { confirmed, draft, converted, cancelled, value };
  }, [orders]);

  if (view === 'create') return <CreateOrder permissions={permissions} onBack={() => { setView('list'); load(); }} onView={(d) => { setSelected(d); setView('detail'); }} />;
  if (view === 'detail' && selected) return <OrderDetail permissions={permissions} data={selected} onBack={() => { setView('list'); load(); }} onRefresh={(d) => setSelected(d)} />;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
        {[
          ['Open Value', inr(stats.value), 'violet', Wallet],
          ['Drafts', String(stats.draft), 'amber', FileText],
          ['Confirmed', String(stats.confirmed), 'blue', CheckCircle2],
          ['Converted', String(stats.converted), 'green', ArrowRightCircle],
          ['Cancelled', String(stats.cancelled), 'red', Ban],
          ['Total Orders', String(orders.length), 'cyan', ClipboardList],
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
          <p className="text-sm font-bold">Sales Orders</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-8 items-center gap-2 rounded-md bg-slate-50 px-3 text-slate-400"><Search size={14}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order #, customer, mobile..." className="w-48 bg-transparent text-xs outline-none" /></div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">
              {['All', 'Draft', 'Confirmed', 'Converted', 'Cancelled'].map((s) => <option key={s}>{s}</option>)}
            </select>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">
              {['All', 'Internal', 'Shopify'].map((s) => <option key={s}>{s}</option>)}
            </select>
            {can('sales.order.create') && <button onClick={() => setView('create')} className="flex h-8 items-center gap-1.5 rounded-md bg-[#4714a1] px-3 text-[11px] font-bold text-white hover:bg-[#5419b5]"><Plus size={14}/> New Order</button>}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400">
              <tr>{['Order #', 'Date', 'Customer', 'Source', 'Items', 'Grand Total', 'Status', 'Actions'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="px-3 py-2.5 font-bold text-[#5419b5]">{o.order_number}</td>
                  <td className="px-3 py-2.5 text-slate-500">{o.order_date}</td>
                  <td className="px-3 py-2.5"><p className="font-semibold">{o.customer_name || '—'}</p><p className="text-[9px] text-slate-400">{o.customer_mobile || '—'}</p></td>
                  <td className="px-3 py-2.5"><Badge color={o.source === 'Shopify' ? 'cyan' : 'violet'}>{o.source || 'Internal'}</Badge></td>
                  <td className="px-3 py-2.5 text-slate-500">{o.item_count ?? 0} item(s)</td>
                  <td className="px-3 py-2.5 font-bold">{inr(o.grand_total)}</td>
                  <td className="px-3 py-2.5"><Badge color={statusColor(o.status)}>{o.status}</Badge></td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => openDetail(o.id)} className="grid h-6 w-6 place-items-center rounded bg-slate-100 text-slate-500 hover:bg-slate-200" title="View"><Eye size={12}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && <EmptyState message="No sales orders found. Create one to get started." />}
        </div>
      </div>
    </div>
  );

  async function openDetail(id: string) {
    try { setSelected(await api<OrderDetailData>(`/api/sales/orders/${id}`)); setView('detail'); } catch { /* keep list */ }
  }
}

// ---------------- Create order ----------------

function CreateOrder({ permissions, onBack, onView }: { permissions: Permissions; onBack: () => void; onView: (d: OrderDetailData) => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<CustomerSelection[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [customer, setCustomer] = useState<CustomerSelection | null>(null);
  const [search, setSearch] = useState('');
  const [custSearch, setCustSearch] = useState('');
  const [showCust, setShowCust] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const { currentRate } = useSilverRate();
  const [silverRate, setSilverRate] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const can = (perm: string) => permissions.includes('*') || permissions.includes(perm);
  const effectiveRate = silverRate ?? currentRate;

  useEffect(() => {
    api<Product[]>('/api/products').then(setProducts).catch(() => setProducts([]));
    searchCustomers('').then(setCustomers);
  }, []);

  const totals = useMemo(() => computeCartTotals(cart, discount), [cart, discount]);
  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter((p) => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q));
  }, [products, search]);
  const filteredCustomers = useMemo(() => {
    const q = custSearch.toLowerCase();
    return customers.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.mobile || '').includes(q) || (c.email || '').toLowerCase().includes(q));
  }, [customers, custSearch]);

  useEffect(() => { setCart((prev) => prev.map((i) => ({ ...i, silver_rate: effectiveRate }))); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [effectiveRate]);

  function addToCart(p: Product) {
    setCart((prev) => {
      const ex = prev.find((i) => i.product_id === p.id);
      if (ex) return prev.map((i) => i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product_id: p.id, sku: p.sku, name: p.name, category: p.category, purity: p.purity, gross_weight: p.gross_weight, net_weight: p.net_weight, stone_weight: p.stone_weight, making_charge: p.making_charge, stone_charge: p.stone_charge, other_charge: p.other_charge, gst_rate: p.gst_rate, quantity: 1, silver_rate: effectiveRate }];
    });
  }
  function updateQty(id: string, delta: number) { setCart((prev) => prev.map((i) => i.product_id === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i)); }
  function removeItem(id: string) { setCart((prev) => prev.filter((i) => i.product_id !== id)); }

  async function save() {
    if (cart.length === 0 || !customer) { setToast('Select a customer and add products first'); return; }
    if (discount > 0 && !can('sales.invoice.discount')) { setToast('You do not have permission to apply discounts'); return; }
    setBusy(true);
    try {
      const lines = totals.lines.map((l) => ({ productId: l.product_id, quantity: l.quantity }));
      const order = await api<SalesOrder>('/api/sales/orders', {
        method: 'POST',
        body: JSON.stringify({ customerId: customer.id, discount, silverRate: effectiveRate, notes: notes || null, source: 'Internal', lines }),
      });
      setToast(`Order ${order.order_number} created`);
      setTimeout(() => onBack(), 900);
    } catch (error) {
      setToast('Error: ' + (error instanceof Error ? error.message : 'Unable to create order'));
    }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3"><button onClick={onBack} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">←</button><h2 className="text-base font-bold">Create New Sales Order</h2></div>
      <div className="grid gap-3 xl:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
            <div className="flex h-9 items-center gap-2 rounded-md bg-slate-50 px-3 text-slate-400"><Search size={15}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products by SKU, barcode, name, category..." className="w-full bg-transparent text-xs outline-none" /></div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {filteredProducts.map((p) => (
                <button key={p.id} onClick={() => addToCart(p)} className="rounded-lg border border-slate-100 p-2.5 text-left hover:border-[#cab4f3]">
                  <p className="text-[10px] font-bold leading-tight">{p.name}</p>
                  <p className="text-[9px] text-slate-400">{p.sku}</p>
                  <p className="mt-1 text-[11px] font-bold text-[#5419b5]">{inr(computeUnitPrice({ net_weight: p.net_weight, silver_rate: effectiveRate, making_charge: p.making_charge, stone_charge: p.stone_charge, other_charge: p.other_charge }))}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><p className="text-xs font-bold">Order Items <span className="text-[9px] font-semibold text-slate-400">{cart.length} item(s)</span></p>{cart.length > 0 && <button onClick={() => setCart([])} className="text-[9px] font-semibold text-red-500 hover:underline">Clear</button>}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 text-[9px] uppercase text-slate-400"><tr>{['Product', 'Purity', 'Net Wt', 'Rate', 'Qty', 'Price', 'Total', ''].map((h) => <th key={h} className="px-2 py-2 text-left font-bold">{h}</th>)}</tr></thead>
                <tbody>
                  {totals.lines.map((l) => (
                    <tr key={l.product_id} className="border-t border-slate-50">
                      <td className="px-2 py-2 font-semibold">{l.name}<p className="text-[9px] text-slate-400">{l.sku}</p></td>
                      <td className="px-2 py-2 text-slate-500">{l.purity}</td>
                      <td className="px-2 py-2 text-slate-500">{l.net_weight}g</td>
                      <td className="px-2 py-2 text-slate-500">{inr(l.silver_rate)}</td>
                      <td className="px-2 py-2"><div className="flex items-center gap-1"><button onClick={() => updateQty(l.product_id, -1)} className="grid h-5 w-5 place-items-center rounded bg-slate-100">-</button><span className="w-5 text-center font-bold">{l.quantity}</span><button onClick={() => updateQty(l.product_id, 1)} className="grid h-5 w-5 place-items-center rounded bg-slate-100">+</button></div></td>
                      <td className="px-2 py-2 font-bold">{inr(l.unit_price)}</td>
                      <td className="px-2 py-2 font-bold">{inr(l.line_total)}</td>
                      <td className="px-2 py-2"><button onClick={() => removeItem(l.product_id)} className="text-slate-300 hover:text-red-500"><X size={12}/></button></td>
                    </tr>
                  ))}
                  {cart.length === 0 && <tr><td colSpan={8}><EmptyState message="Add products to the order" /></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
            <p className="border-b border-slate-100 px-4 py-3 text-xs font-bold">Customer & Order</p>
            <div className="space-y-3 p-4">
              <button onClick={() => setShowCust(true)} className="flex w-full items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-left text-[11px]">
                <span>{customer ? <><span className="font-bold">{customer.name}</span><p className="text-[9px] text-slate-400">{customer.source} · {customer.mobile || customer.email || 'No contact'}</p></> : 'Select Customer (required)'}</span>
                <ChevronDown size={14} className="text-slate-400"/>
              </button>
              <div><label className="text-[9px] font-bold uppercase text-slate-400">Silver Rate (₹/g) — frozen at this rate</label>
                <input type="number" value={effectiveRate} onChange={(e) => { const r = +e.target.value; setSilverRate(r); setCart((prev) => prev.map((i) => ({ ...i, silver_rate: r }))); }} className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-[11px] font-bold outline-none" />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500"><span>Discount</span>
                {can('sales.invoice.discount') ? <input type="number" value={discount || ''} onChange={(e) => setDiscount(Math.max(0, +e.target.value))} className="w-20 rounded border border-slate-200 px-2 py-0.5 text-right outline-none" placeholder="0"/> : <span className="font-bold">{inr(discount)}</span>}
              </div>
              <div className="flex justify-between text-[11px] text-slate-500"><span>GST</span><span>{inr(totals.gstAmount)}</span></div>
              <div className="flex justify-between text-[11px] text-slate-500"><span>Round Off</span><span>{inr(totals.roundOff)}</span></div>
              <div className="flex justify-between border-t border-slate-100 pt-2 text-sm font-bold"><span>Grand Total</span><span className="text-[#5419b5]">{inr(totals.grandTotal)}</span></div>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes / remarks..." className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-[10px] outline-none" rows={2} />
            </div>
            <div className="border-t border-slate-100 p-3"><button onClick={save} disabled={busy} className="flex w-full items-center justify-center gap-1.5 rounded-md bg-[#4714a1] py-2.5 text-[11px] font-bold text-white hover:bg-[#5419b5] disabled:opacity-50"><ClipboardList size={14}/>{busy ? 'Saving...' : 'Save Order (Draft)'}</button></div>
          </div>
        </div>
      </div>

      {showCust && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => setShowCust(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold">Select Customer</p><button onClick={() => setShowCust(false)}><X size={16}/></button></div>
            <div className="mb-3 flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2"><Search size={14}/><input value={custSearch} onChange={(e) => setCustSearch(e.target.value)} placeholder="Search customer by name, mobile, email..." className="w-full bg-transparent text-xs outline-none" /></div>
            <div className="max-h-60 overflow-y-auto">
              {filteredCustomers.map((c) => <button key={`${c.source}-${c.id}`} onClick={async () => { try { setCustomer(await importShopifyCustomer(c)); setShowCust(false); } catch (error) { setToast(error instanceof Error ? error.message : 'Unable to link Shopify customer'); } }} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-slate-50"><div><p className="text-[11px] font-bold">{c.name} <span className="ml-1 rounded bg-purple-50 px-1 text-[8px] font-bold text-[#6f39bd]">{c.source}</span></p><p className="text-[9px] text-slate-400">{c.mobile || c.email || '—'}</p></div><span className="text-[9px] text-slate-400">{c.total_orders ?? 0} purchases</span></button>)}
            </div>
          </div>
        </div>
      )}
      {toast && <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-[#1d2945] px-4 py-3 text-xs font-semibold text-white shadow-xl">{toast}</div>}
    </div>
  );
}

// ---------------- Order detail ----------------

function OrderDetail({ permissions, data, onBack, onRefresh }: { permissions: Permissions; data: OrderDetailData; onBack: () => void; onRefresh: (d: OrderDetailData) => void }) {
  const { order, items } = data;
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const can = (perm: string) => permissions.includes('*') || permissions.includes(perm);

  async function refresh() {
    try { onRefresh(await api<OrderDetailData>(`/api/sales/orders/${order.id}`)); } catch { /* keep */ }
  }

  async function setStatus(action: 'Confirm' | 'Cancel') {
    if (action === 'Cancel' && !cancelReason.trim()) { setToast('A cancellation reason is required'); return; }
    setBusy(action === 'Confirm' ? 'confirm' : 'cancel');
    try {
      await api(`/api/sales/orders/${order.id}/status`, { method: 'POST', body: JSON.stringify({ action, reason: action === 'Cancel' ? cancelReason.trim() : null }) });
      setShowCancel(false);
      setToast(action === 'Confirm' ? 'Order confirmed' : 'Order cancelled');
      await refresh();
    } catch (error) { setToast('Error: ' + (error instanceof Error ? error.message : 'Unable to update order')); }
    setBusy(null);
  }

  async function convert() {
    setBusy('convert');
    try {
      await api(`/api/sales/orders/${order.id}/convert`, { method: 'POST' });
      setToast('Order converted to invoice');
      await refresh();
    } catch (error) { setToast('Error: ' + (error instanceof Error ? error.message : 'Unable to convert order')); }
    setBusy(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3"><button onClick={onBack} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">←</button><h2 className="text-base font-bold">Order {order.order_number}</h2><Badge color={statusColor(order.status)}>{order.status}</Badge><Badge color={order.source === 'Shopify' ? 'cyan' : 'violet'}>{order.source || 'Internal'}</Badge></div>
      </div>
      <div className="grid gap-3 xl:grid-cols-[1fr_280px]">
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-4">
            <div><p className="text-sm font-bold">Opal Line Jewelry</p><p className="text-[9px] text-slate-400">92.5 Sterling Silver Jewellery</p></div>
            <div className="text-right"><p className="text-[10px] text-slate-400">{order.order_number}</p><p className="text-[10px] text-slate-400">{order.order_date}</p>{order.shopify_order_id && <p className="text-[10px] text-slate-400">Shopify Order: {order.shopify_order_id}</p>}</div>
          </div>
          <div className="mb-4 text-[11px]"><p className="text-[9px] font-bold uppercase text-slate-400">Customer</p><p className="mt-1 font-bold">{order.customer_name || '—'}</p><p className="text-slate-500">{order.customer_mobile || '—'}</p></div>
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-[9px] uppercase text-slate-400"><tr>{['Item', 'Purity', 'Net Wt', 'Rate', 'Qty', 'Price', 'Total'].map((h) => <th key={h} className="px-2 py-2 text-left font-bold">{h}</th>)}</tr></thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t border-slate-50">
                  <td className="px-2 py-2 font-semibold">{it.name}<p className="text-[9px] text-slate-400">{it.sku}</p></td>
                  <td className="px-2 py-2 text-slate-500">{it.purity}</td>
                  <td className="px-2 py-2 text-slate-500">{it.net_weight}g</td>
                  <td className="px-2 py-2 text-slate-500">{inr(it.silver_rate)}</td>
                  <td className="px-2 py-2">{it.quantity}</td>
                  <td className="px-2 py-2 font-bold">{inr(it.unit_price)}</td>
                  <td className="px-2 py-2 font-bold">{inr(it.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 ml-auto w-56 space-y-1.5 text-[11px]">
            <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{inr(order.subtotal + order.discount)}</span></div>
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
              {order.status === 'Draft' && can('sales.order.confirm') && (
                <button onClick={() => setStatus('Confirm')} disabled={!!busy} className="flex items-center justify-center gap-1.5 rounded-md bg-emerald-500 py-2.5 text-[10px] font-bold text-white hover:bg-emerald-600 disabled:opacity-50"><CheckCircle2 size={13}/>{busy === 'confirm' ? 'Confirming...' : 'Confirm Order'}</button>
              )}
              {order.status === 'Confirmed' && can('sales.order.convert_invoice') && (
                <button onClick={convert} disabled={!!busy} className="flex items-center justify-center gap-1.5 rounded-md bg-[#4714a1] py-2.5 text-[10px] font-bold text-white hover:bg-[#5419b5] disabled:opacity-50"><ArrowRightCircle size={13}/>{busy === 'convert' ? 'Converting...' : 'Convert to Invoice'}</button>
              )}
              {(order.status === 'Draft' || order.status === 'Confirmed') && can('sales.order.cancel') && (
                <button onClick={() => setShowCancel(true)} className="flex items-center justify-center gap-1.5 rounded-md border border-red-200 py-2.5 text-[10px] font-bold text-red-600 hover:bg-red-50"><Ban size={13}/> Cancel Order</button>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
            <p className="border-b border-slate-100 px-4 py-3 text-xs font-bold">Order Details</p>
            <div className="space-y-2 p-3 text-[10px]">
              {[['Silver Rate Used (frozen)', inr(order.silver_rate) + ' /g'], ['Item Count', String(items.length)], ['Advance', inr(order.advance_amount)], ['Created', String(order.confirmed_at || order.cancelled_at || '').slice(0, 10) || '—']].map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-slate-500">{k}</span><b>{v}</b></div>)}
            </div>
          </div>
        </div>
      </div>

      {showCancel && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => setShowCancel(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold"><AlertTriangle size={14} className="mr-1 inline text-red-500"/>Cancel Order</p><button onClick={() => setShowCancel(false)}><X size={16}/></button></div>
            <label className="mt-3 block text-[9px] font-bold uppercase text-slate-400">Reason (required)</label>
            <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-xs outline-none" rows={2} />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setShowCancel(false)} className="rounded-md border border-slate-200 py-2 text-[10px] font-bold text-slate-600">Keep Order</button>
              <button onClick={() => setStatus('Cancel')} disabled={!!busy} className="rounded-md bg-red-500 py-2 text-[10px] font-bold text-white disabled:opacity-50">{busy === 'cancel' ? 'Cancelling...' : 'Cancel Order'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-[#1d2945] px-4 py-3 text-xs font-semibold text-white shadow-xl">{toast}</div>}
    </div>
  );
}
