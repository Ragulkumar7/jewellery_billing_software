import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, ChevronDown, Eye, FileText, Plus, Printer, Search,
  TrendingUp, Wallet, ShoppingCart, Receipt, X, Ban, RotateCcw, PauseCircle,
  PlayCircle, CreditCard, Settings2, AlertTriangle,
} from 'lucide-react';
import { supabase, computeCartTotals, computeUnitPrice, inr, type Product, type CartItem, type HeldBill, type Payment } from '@/lib/supabase';
import { importShopifyCustomer, searchCustomers, type CustomerSelection } from '@/lib/customer-search';
import { Badge, EmptyState, Panel, statusColor } from '@/components/ui';
import { API_URL, api } from '@/lib/api';
import { useSilverRate } from '@/lib/silver-rate-context';

type Permissions = string[];

export type SalesInvoice = {
  id: string;
  invoice_number: string;
  customer_id: string | null;
  customer_name: string;
  customer_mobile: string | null;
  invoice_type: string;
  invoice_date: string;
  status: string;
  payment_status: string;
  payment_method: string | null;
  subtotal: number;
  discount: number;
  gst_amount: number;
  round_off: number;
  grand_total: number;
  amount_paid: number;
  outstanding_balance: number;
  silver_rate: number;
  source?: string;
  shopify_order_id?: string | null;
  notes?: string | null;
  salesperson?: string | null;
  confirmed_at?: string | null;
  price_override_reason?: string | null;
  cancel_reason?: string | null;
  item_count?: number;
};

type InvoiceDetailData = { invoice: SalesInvoice; items: InvoiceItemRow[]; payments: Payment[] };
type InvoiceItemRow = { id: string; product_id: string | null; sku: string | null; name: string; purity: string | null; gross_weight: number; net_weight: number; stone_weight: number; silver_rate: number; making_charge: number; stone_charge: number; other_charge: number; gst_rate: number; quantity: number; unit_price: number; line_total: number };

export default function SalesInvoices({ permissions, onNavigate }: { permissions: Permissions; onNavigate: (v: string) => void }) {
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [sourceFilter, setSourceFilter] = useState('All');
  const [paymentFilter, setPaymentFilter] = useState('All');
  const [selected, setSelected] = useState<InvoiceDetailData | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  const can = (perm: string) => permissions.includes('*') || permissions.includes(perm);

  async function load(offset = 0) {
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (search) params.set('q', search);
      if (statusFilter !== 'All') params.set('status', statusFilter);
      if (sourceFilter !== 'All') params.set('source', sourceFilter);
      if (paymentFilter !== 'All') params.set('payment', paymentFilter);
      if (offset) params.set('offset', String(offset));
      const data = await api<SalesInvoice[]>(`/api/invoices?${params.toString()}`);
      if (offset) setInvoices((prev) => [...prev, ...data]); else setInvoices(data);
      setTotalCount(data.length);
    } catch { setInvoices([]); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter, sourceFilter, paymentFilter, search]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    const todaySales = invoices.filter((i) => i.invoice_date === today).reduce((s, i) => s + i.grand_total, 0);
    const monthSales = invoices.filter((i) => i.invoice_date?.startsWith(month)).reduce((s, i) => s + i.grand_total, 0);
    const outstanding = invoices.filter((i) => i.status !== 'Cancelled').reduce((s, i) => s + i.outstanding_balance, 0);
    const paid = invoices.filter((i) => i.payment_status === 'Paid').length;
    const draft = invoices.filter((i) => i.status === 'Draft').length;
    const cancelled = invoices.filter((i) => i.status === 'Cancelled').length;
    const totalRev = invoices.filter((i) => i.status !== 'Cancelled').reduce((s, i) => s + i.grand_total, 0);
    const avg = invoices.length ? totalRev / invoices.length : 0;
    return { todaySales, monthSales, outstanding, paid, draft, cancelled, totalRev, avg, count: invoices.length };
  }, [invoices]);

  if (view === 'create') return <CreateInvoice permissions={permissions} onBack={() => { setView('list'); load(); }} onView={(d) => { setSelected(d); setView('detail'); }} />;
  if (view === 'detail' && selected) return <InvoiceDetail permissions={permissions} data={selected} onBack={() => { setView('list'); load(); }} onRefresh={(d) => setSelected(d)} />;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
        {[
          ['Today\'s Sales', inr(stats.todaySales), 'orange', CalendarDays],
          ['Monthly Sales', inr(stats.monthSales), 'navy', TrendingUp],
          ['Outstanding', inr(stats.outstanding), 'cyan', Wallet],
          ['Paid Invoices', String(stats.paid), 'green', Receipt],
          ['Drafts', String(stats.draft), 'amber', FileText],
          ['Cancelled', String(stats.cancelled), 'red', Ban],
          ['Total Revenue', inr(stats.totalRev), 'violet', TrendingUp],
          ['Avg Invoice', inr(stats.avg), 'blue', ShoppingCart],
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
          <p className="text-sm font-bold">Invoice List <span className="ml-1 text-[9px] font-semibold text-slate-400">{invoices.length} shown</span></p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-8 items-center gap-2 rounded-md bg-slate-50 px-3 text-slate-400"><Search size={14}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Invoice #, customer, mobile, SKU, Shopify order..." className="w-52 bg-transparent text-xs outline-none" /></div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">
              {['All', 'Draft', 'Unpaid', 'Partially Paid', 'Paid', 'Cancelled', 'Returned'].map((s) => <option key={s}>{s}</option>)}
            </select>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">
              {['All', 'Internal', 'Shopify'].map((s) => <option key={s}>{s}</option>)}
            </select>
            <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">
              {['All', 'Paid', 'Partially Paid', 'Unpaid'].map((s) => <option key={s}>{s}</option>)}
            </select>
            <button onClick={() => setView('create')} className="flex h-8 items-center gap-1.5 rounded-md bg-[#4714a1] px-3 text-[11px] font-bold text-white hover:bg-[#5419b5]"><Plus size={14}/> New Invoice</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400">
              <tr>{['Invoice #', 'Date', 'Customer', 'Source', 'Type', 'Payment', 'Total', 'Outstanding', 'Status', 'Actions'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="px-3 py-2.5 font-bold text-[#5419b5]">{inv.invoice_number}</td>
                  <td className="px-3 py-2.5 text-slate-500">{inv.invoice_date}</td>
                  <td className="px-3 py-2.5"><p className="font-semibold">{inv.customer_name}</p><p className="text-[9px] text-slate-400">{inv.customer_mobile || '—'}</p></td>
                  <td className="px-3 py-2.5"><Badge color={inv.source === 'Shopify' ? 'cyan' : inv.source === 'Linked' ? 'green' : 'violet'}>{inv.source || 'Internal'}</Badge></td>
                  <td className="px-3 py-2.5 text-slate-500">{inv.invoice_type}</td>
                  <td className="px-3 py-2.5"><Badge color={statusColor(inv.payment_status)}>{inv.payment_status}</Badge></td>
                  <td className="px-3 py-2.5 font-bold">{inr(inv.grand_total)}</td>
                  <td className="px-3 py-2.5 text-slate-500">{inr(inv.outstanding_balance)}</td>
                  <td className="px-3 py-2.5"><Badge color={statusColor(inv.status)}>{inv.status}</Badge></td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => openDetail(inv.id)} className="grid h-6 w-6 place-items-center rounded bg-slate-100 text-slate-500 hover:bg-slate-200" title="View"><Eye size={12}/></button>
                      <button onClick={() => window.open(`${API_URL}/api/sales/invoices/${inv.id}/print`, '_blank')} className="grid h-6 w-6 place-items-center rounded bg-slate-100 text-slate-500 hover:bg-slate-200" title="Print"><Printer size={12}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {invoices.length === 0 && <EmptyState message="No invoices found. Create one to get started." />}
        </div>
        {invoices.length > 0 && (
          <button onClick={() => load(invoices.length)} className="w-full border-t border-slate-100 py-2.5 text-[10px] font-bold text-[#6f39bd] hover:bg-purple-50">
            {totalCount < 50 ? 'End of results' : 'Load more invoices'}
          </button>
        )}
      </div>
    </div>
  );

  async function openDetail(id: string) {
    try {
      const data = await api<InvoiceDetailData>(`/api/sales/invoices/${id}`);
      setSelected(data);
      setView('detail');
    } catch { /* keep list */ }
  }
}

// ---------------- Create invoice (with held bills) ----------------

function CreateInvoice({ permissions, onBack, onView }: { permissions: Permissions; onBack: () => void; onView: (d: InvoiceDetailData) => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<CustomerSelection[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [customer, setCustomer] = useState<CustomerSelection | null>(null);
  const [search, setSearch] = useState('');
  const [custSearch, setCustSearch] = useState('');
  const [showCust, setShowCust] = useState(false);
  const [invoiceType, setInvoiceType] = useState('Tax Invoice');
  const [payMethod, setPayMethod] = useState('Cash');
  const [amountPaid, setAmountPaid] = useState(0);
  const [notes, setNotes] = useState('');
  const [heldBills, setHeldBills] = useState<HeldBill[]>([]);
  const [showHeld, setShowHeld] = useState(false);
  const [overrideLine, setOverrideLine] = useState<CartItem | null>(null);
  const [overridePrice, setOverridePrice] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const { currentRate } = useSilverRate();
  const [silverRate, setSilverRate] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const can = (perm: string) => permissions.includes('*') || permissions.includes(perm);
  const effectiveRate = silverRate ?? currentRate;

  useEffect(() => {
    api<Product[]>('/api/products').then(setProducts).catch(() => setProducts([]));
    searchCustomers('').then(setCustomers);
    loadHeld();
  }, []);

  const totals = useMemo(() => computeCartTotals(cart, discount), [cart, discount]);
  const change = Math.max(0, amountPaid - totals.grandTotal);

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter((p) => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q));
  }, [products, search]);
  const filteredCustomers = useMemo(() => {
    const q = custSearch.toLowerCase();
    return customers.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.mobile || '').includes(q) || (c.email || '').toLowerCase().includes(q) || (c.gst_number || '').includes(q));
  }, [customers, custSearch]);

  useEffect(() => {
    if (amountPaid === 0 && cart.length > 0) setAmountPaid(totals.grandTotal);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [cart.length, totals.grandTotal]);

  useEffect(() => { setCart((prev) => prev.map((i) => ({ ...i, silver_rate: effectiveRate }))); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [effectiveRate]);

  async function loadHeld() {
    const { data } = await supabase.from('held_bills').select('*').eq('status', 'Held').order('created_at', { ascending: false });
    if (data) setHeldBills(data as HeldBill[]);
  }

  function addToCart(p: Product) {
    setCart((prev) => {
      const ex = prev.find((i) => i.product_id === p.id);
      if (p.stock_qty < 1 || (ex && ex.quantity >= p.stock_qty)) return prev;
      if (ex) return prev.map((i) => i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product_id: p.id, sku: p.sku, name: p.name, category: p.category, purity: p.purity, gross_weight: p.gross_weight, net_weight: p.net_weight, stone_weight: p.stone_weight, making_charge: p.making_charge, stone_charge: p.stone_charge, other_charge: p.other_charge, gst_rate: p.gst_rate, quantity: 1, silver_rate: effectiveRate }];
    });
  }
  function updateQty(id: string, delta: number) { setCart((prev) => prev.map((i) => i.product_id === id ? { ...i, quantity: Math.min(products.find((p) => p.id === id)?.stock_qty ?? i.quantity, Math.max(1, i.quantity + delta)) } : i)); }
  function removeItem(id: string) { setCart((prev) => prev.filter((i) => i.product_id !== id)); }
  function clearCart() { setCart([]); setDiscount(0); setCustomer(null); setAmountPaid(0); setNotes(''); }

  async function holdBill() {
    if (cart.length === 0 || !customer) { setToast('Select a customer before holding the bill'); return; }
    await supabase.from('held_bills').insert({
      customer_id: customer.id, customer_name: customer.name, cart: JSON.stringify(cart),
      subtotal: totals.subtotal, discount: totals.discount, grand_total: totals.grandTotal,
      payment_method: payMethod, amount_paid: amountPaid, staff_name: 'Staff', notes,
    });
    setToast('Bill held successfully');
    clearCart();
    loadHeld();
    setTimeout(() => setToast(null), 2000);
  }

  async function resumeBill(b: HeldBill) {
    const items: CartItem[] = typeof b.cart === 'string' ? JSON.parse(b.cart) : b.cart;
    setCart(items);
    setDiscount(Number(b.discount || 0));
    setPayMethod(b.payment_method || 'Cash');
    setAmountPaid(Number(b.amount_paid || 0));
    setCustomer(b.customer_id ? customers.find((c) => c.id === b.customer_id) || null : null);
    await supabase.from('held_bills').update({ status: 'Resumed' }).eq('id', b.id);
    loadHeld();
    setToast(`Bill ${b.reference} resumed`);
    setTimeout(() => setToast(null), 2000);
  }

  async function save(draft: boolean) {
    if (cart.length === 0) return;
    if (!customer) { setToast('Select a customer before saving the invoice'); return; }
    if (draft && !can('sales.invoice.create')) { setToast('You do not have permission to create invoices'); return; }
    if (!draft && !can('sales.invoice.confirm')) { setToast('You do not have permission to confirm invoices'); return; }
    if (discount > 0 && !can('sales.invoice.discount')) { setToast('You do not have permission to apply discounts'); return; }
    if (!draft && amountPaid > 0 && !can('sales.invoice.record_payment')) { setToast('You do not have permission to record payments'); return; }
    setBusy(draft ? 'draft' : 'save');
    try {
      const lines = totals.lines.map((l) => ({
        productId: l.product_id,
        quantity: l.quantity,
        ...(l.priceOverride !== undefined ? { priceOverride: l.priceOverride, overrideReason: l.overrideReason } : {}),
      }));
      const payload = {
        customerId: customer.id,
        invoiceType,
        paymentMethod: payMethod,
        discount,
        silverRate: effectiveRate,
        notes: notes || null,
        draft,
        source: 'Internal',
        amountPaid: draft ? 0 : amountPaid,
        lines,
      };
      const invoice = await api<SalesInvoice>('/api/sales/invoices', { method: 'POST', body: JSON.stringify(payload) });
      setToast(draft ? `Draft ${invoice.invoice_number} saved` : `Invoice ${invoice.invoice_number} confirmed`);
      setTimeout(() => onBack(), 900);
    } catch (error) {
      setToast('Error: ' + (error instanceof Error ? error.message : 'Unable to save invoice'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3"><button onClick={onBack} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">←</button><h2 className="text-base font-bold">Create New Invoice</h2></div>
      </div>
      <div className="grid gap-3 xl:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
            <div className="flex h-9 items-center gap-2 rounded-md bg-slate-50 px-3 text-slate-400"><Search size={15}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products by SKU, barcode, name, category..." className="w-full bg-transparent text-xs outline-none" /></div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {filteredProducts.map((p) => (
                <button key={p.id} disabled={p.stock_qty < 1} onClick={() => addToCart(p)} className="rounded-lg border border-slate-100 p-2.5 text-left hover:border-[#cab4f3] disabled:cursor-not-allowed disabled:opacity-50">
                  <p className="text-[10px] font-bold leading-tight">{p.name}</p>
                  <p className="text-[9px] text-slate-400">{p.sku}</p>
                  <p className="mt-1 text-[11px] font-bold text-[#5419b5]">{inr(computeUnitPrice({ net_weight: p.net_weight, silver_rate: effectiveRate, making_charge: p.making_charge, stone_charge: p.stone_charge, other_charge: p.other_charge }))}</p>
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="text-xs font-bold">Line Items <span className="text-[9px] font-semibold text-slate-400">{cart.length} item(s)</span></p>
              {cart.length > 0 && <button onClick={clearCart} className="text-[9px] font-semibold text-red-500 hover:underline">Clear cart</button>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 text-[9px] uppercase text-slate-400"><tr>{['Product', 'Purity', 'Net Wt', 'Rate', 'GST', 'Qty', 'Price', 'Total', ''].map((h) => <th key={h} className="px-2 py-2 text-left font-bold">{h}</th>)}</tr></thead>
                <tbody>
                  {totals.lines.map((l) => (
                    <tr key={l.product_id} className="border-t border-slate-50">
                      <td className="px-2 py-2 font-semibold">{l.name}<p className="text-[9px] text-slate-400">{l.sku}</p></td>
                      <td className="px-2 py-2 text-slate-500">{l.purity}</td>
                      <td className="px-2 py-2 text-slate-500">{l.net_weight}g</td>
                      <td className="px-2 py-2 text-slate-500">{inr(l.silver_rate)}</td>
                      <td className="px-2 py-2 text-slate-500">{l.gst_rate}%</td>
                      <td className="px-2 py-2"><div className="flex items-center gap-1"><button onClick={() => updateQty(l.product_id, -1)} className="grid h-5 w-5 place-items-center rounded bg-slate-100">-</button><span className="w-5 text-center font-bold">{l.quantity}</span><button onClick={() => updateQty(l.product_id, 1)} className="grid h-5 w-5 place-items-center rounded bg-slate-100">+</button></div></td>
                      <td className="px-2 py-2">
                        {can('sales.invoice.price_override') ? (
                          <button onClick={() => { setOverrideLine(l); setOverridePrice(String(l.unit_price)); setOverrideReason(''); }} title="Override price" className="flex items-center gap-1 font-bold text-[#6f39bd] hover:underline">{inr(l.unit_price)}<Settings2 size={10}/></button>
                        ) : <span className="font-bold">{inr(l.unit_price)}</span>}
                      </td>
                      <td className="px-2 py-2 font-bold">{inr(l.line_total)}</td>
                      <td className="px-2 py-2"><button onClick={() => removeItem(l.product_id)} className="text-slate-300 hover:text-red-500"><X size={12}/></button></td>
                    </tr>
                  ))}
                  {cart.length === 0 && <tr><td colSpan={9}><EmptyState message="Add products to the invoice" /></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
            <p className="border-b border-slate-100 px-4 py-3 text-xs font-bold">Customer & Invoice</p>
            <div className="space-y-3 p-4">
              <button onClick={() => setShowCust(true)} className="flex w-full items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-left text-[11px]">
                <span>{customer ? <><span className="font-bold">{customer.name}</span><p className="text-[9px] text-slate-400">{customer.source} · {customer.mobile || customer.email || 'No contact'}</p></> : 'Select Customer (required)'}</span>
                <ChevronDown size={14} className="text-slate-400"/>
              </button>
              {customer && <div className="rounded-md bg-slate-50 p-2 text-[9px] text-slate-500">
                <p><b>Billing:</b> {customer.billing_address || '—'}</p>
                <p className="mt-1"><b>Outstanding:</b> {inr(customer.outstanding_balance)} · <b>Credit Limit:</b> {inr(customer.credit_limit)} · <b>Loyalty:</b> {customer.loyalty_points} pts</p>
              </div>}
              <div><label className="text-[9px] font-bold uppercase text-slate-400">Invoice Type</label>
                <select value={invoiceType} onChange={(e) => setInvoiceType(e.target.value)} className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-[11px] outline-none">
                  {['Tax Invoice', 'Retail Invoice', 'Wholesale Invoice', 'GST Invoice', 'Credit Invoice', 'Proforma Invoice', 'Estimate'].map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div><label className="text-[9px] font-bold uppercase text-slate-400">Silver Rate (₹/g) — price frozen at this rate</label>
                <input type="number" value={effectiveRate} onChange={(e) => { const r = +e.target.value; setSilverRate(r); setCart((prev) => prev.map((i) => ({ ...i, silver_rate: r }))); }} className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-[11px] font-bold outline-none" />
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
            <p className="border-b border-slate-100 px-4 py-3 text-xs font-bold">Pricing & Payment</p>
            <div className="space-y-2 p-4 text-[11px]">
              <div className="flex justify-between text-slate-500"><span>Metal + Making + Stone</span><span>{inr(totals.subtotal + discount)}</span></div>
              <div className="flex items-center justify-between text-slate-500"><span>Discount</span>
                {can('sales.invoice.discount') ? (
                  <input type="number" value={discount || ''} onChange={(e) => setDiscount(Math.max(0, +e.target.value))} className="w-20 rounded border border-slate-200 px-2 py-0.5 text-right outline-none" placeholder="0"/>
                ) : <span className="font-bold">{inr(discount)}</span>}
              </div>
              <div className="flex justify-between text-slate-500"><span>GST</span><span>{inr(totals.gstAmount)}</span></div>
              <div className="flex justify-between text-slate-500"><span>Round Off</span><span>{inr(totals.roundOff)}</span></div>
              <div className="flex justify-between border-t border-slate-100 pt-2 text-sm font-bold"><span>Grand Total</span><span className="text-[#5419b5]">{inr(totals.grandTotal)}</span></div>
              <div className="pt-1"><label className="text-[9px] font-bold uppercase text-slate-400">Payment Method</label>
                <div className="mt-1 grid grid-cols-3 gap-1">{['Cash', 'UPI', 'Card', 'Bank', 'Cheque', 'Credit'].map((m) => <button key={m} onClick={() => setPayMethod(m)} className={`rounded py-1.5 text-[9px] font-bold ${payMethod === m ? 'bg-[#4714a1] text-white' : 'bg-slate-100 text-slate-600'}`}>{m}</button>)}</div>
              </div>
              <div className="flex items-center justify-between pt-1"><span className="text-slate-500">Amount Paid</span><input type="number" value={amountPaid || ''} onChange={(e) => setAmountPaid(+e.target.value)} className="w-24 rounded border border-slate-200 px-2 py-0.5 text-right font-bold outline-none" /></div>
              {change > 0 && <div className="flex justify-between text-[11px]"><span className="text-emerald-600">Change Return</span><span className="font-bold text-emerald-600">{inr(change)}</span></div>}
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes / remarks..." className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-[10px] outline-none" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-3">
              <button onClick={() => save(false)} disabled={!!busy} className="flex items-center justify-center gap-1.5 rounded-md bg-emerald-500 py-2.5 text-[11px] font-bold text-white hover:bg-emerald-600 disabled:opacity-50"><CreditCard size={14}/>{busy === 'save' ? 'Saving...' : 'Confirm & Save'}</button>
              <button onClick={() => save(true)} disabled={!!busy} className="flex items-center justify-center gap-1.5 rounded-md bg-orange-50 py-2.5 text-[10px] font-bold text-orange-600 hover:bg-orange-100 disabled:opacity-50"><FileText size={14}/>{busy === 'draft' ? 'Saving...' : 'Save as Draft'}</button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
            <button onClick={() => setShowHeld(!showHeld)} className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-xs font-bold">
              <span className="flex items-center gap-2"><PauseCircle size={14}/> Held Bills ({heldBills.length})</span>
              <ChevronDown size={14} className={`transition ${showHeld ? 'rotate-180' : ''}`} />
            </button>
            {showHeld && <div className="max-h-48 overflow-y-auto px-2 py-2">
              {heldBills.length === 0 ? <EmptyState message="No held bills" /> : heldBills.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-slate-50">
                  <div><p className="text-[11px] font-bold">{b.reference}</p><p className="text-[9px] text-slate-400">{b.customer_name} · {inr(b.grand_total)}</p></div>
                  <button onClick={() => resumeBill(b)} className="flex items-center gap-1 rounded bg-emerald-50 px-2 py-1 text-[9px] font-bold text-emerald-600 hover:bg-emerald-100"><PlayCircle size={12}/> Resume</button>
                </div>
              ))}
            </div>}
          </div>
        </div>
      </div>

      {showCust && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => setShowCust(false)}>
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold">Select Customer</p><button onClick={() => setShowCust(false)}><X size={16}/></button></div>
            <div className="mb-3 flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2"><Search size={14}/><input value={custSearch} onChange={(e) => setCustSearch(e.target.value)} placeholder="Search customer by name, mobile, email..." className="w-full bg-transparent text-xs outline-none" /></div>
            <div className="max-h-60 overflow-y-auto">
              {filteredCustomers.map((c) => <button key={`${c.source}-${c.id}`} onClick={async () => { try { setCustomer(await importShopifyCustomer(c)); setShowCust(false); } catch (error) { setToast(error instanceof Error ? error.message : 'Unable to link Shopify customer'); } }} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-slate-50"><div><p className="text-[11px] font-bold">{c.name} <span className="ml-1 rounded bg-purple-50 px-1 text-[8px] font-bold text-[#6f39bd]">{c.source}</span></p><p className="text-[9px] text-slate-400">{c.mobile || c.email || '—'}{c.shopify_customer_id ? ` · Shopify #${c.shopify_customer_id}` : ''}</p></div><span className="text-[9px] text-slate-400">{c.total_orders ?? 0} purchases</span></button>)}
            </div>
          </div>
        </div>
      )}

      {overrideLine && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => setOverrideLine(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold">Override Price</p><button onClick={() => setOverrideLine(null)}><X size={16}/></button></div>
            <p className="text-[10px] text-slate-500">{overrideLine.name} · {overrideLine.sku}</p>
            <label className="mt-3 block text-[9px] font-bold uppercase text-slate-400">New Unit Price (₹)</label>
            <input type="number" value={overridePrice} onChange={(e) => setOverridePrice(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-sm font-bold outline-none" />
            <label className="mt-3 block text-[9px] font-bold uppercase text-slate-400">Reason (required — audited)</label>
            <textarea value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-xs outline-none" rows={2} />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setOverrideLine(null)} className="rounded-md border border-slate-200 py-2 text-[10px] font-bold text-slate-600">Cancel</button>
              <button onClick={() => {
                const price = +overridePrice;
                if (!(price >= 0) || !overrideReason.trim()) { setToast('Enter a valid price and reason'); return; }
                setCart((prev) => prev.map((i) => i.product_id === overrideLine.product_id ? { ...i, priceOverride: price, overrideReason: overrideReason.trim() } : i));
                setOverrideLine(null);
              }} className="rounded-md bg-[#4714a1] py-2 text-[10px] font-bold text-white">Apply Override</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-[#1d2945] px-4 py-3 text-xs font-semibold text-white shadow-xl">{toast}</div>}
    </div>
  );
}

// ---------------- Invoice detail ----------------

function InvoiceDetail({ permissions, data, onBack, onRefresh }: { permissions: Permissions; data: InvoiceDetailData; onBack: () => void; onRefresh: (d: InvoiceDetailData) => void }) {
  const { invoice, items, payments } = data;
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showPay, setShowPay] = useState(false);
  const [payAmount, setPayAmount] = useState(invoice.outstanding_balance);
  const [payMethod, setPayMethod] = useState('Cash');
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showOverride, setShowOverride] = useState(false);
  const [overrideLine, setOverrideLine] = useState<InvoiceItemRow | null>(null);
  const [overridePrice, setOverridePrice] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  const can = (perm: string) => permissions.includes('*') || permissions.includes(perm);

  async function refresh() {
    try { onRefresh(await api<InvoiceDetailData>(`/api/sales/invoices/${invoice.id}`)); } catch { /* keep */ }
  }

  async function confirmInvoice() {
    setBusy('confirm');
    try {
      await api(`/api/sales/invoices/${invoice.id}/confirm`, { method: 'POST', body: JSON.stringify({ amountPaid: 0 }) });
      setToast('Invoice confirmed');
      await refresh();
    } catch (error) { setToast('Error: ' + (error instanceof Error ? error.message : 'Unable to confirm')); }
    setBusy(null);
  }

  async function recordPayment() {
    const amount = +payAmount;
    if (!(amount > 0)) { setToast('Enter a valid amount'); return; }
    setBusy('pay');
    try {
      await api(`/api/sales/invoices/${invoice.id}/payment`, { method: 'POST', body: JSON.stringify({ amount, method: payMethod }) });
      setShowPay(false);
      setToast('Payment recorded');
      await refresh();
    } catch (error) { setToast('Error: ' + (error instanceof Error ? error.message : 'Unable to record payment')); }
    setBusy(null);
  }

  async function cancelInvoice() {
    if (!cancelReason.trim()) { setToast('A cancellation reason is required'); return; }
    setBusy('cancel');
    try {
      await api(`/api/sales/invoices/${invoice.id}/cancel`, { method: 'POST', body: JSON.stringify({ reason: cancelReason.trim() }) });
      setShowCancel(false);
      setToast('Invoice cancelled');
      await refresh();
    } catch (error) { setToast('Error: ' + (error instanceof Error ? error.message : 'Unable to cancel')); }
    setBusy(null);
  }

  async function applyOverride() {
    if (!overrideLine) return;
    const price = +overridePrice;
    if (!(price >= 0) || !overrideReason.trim()) { setToast('Enter a valid price and reason'); return; }
    setBusy('override');
    try {
      await api(`/api/sales/invoices/${invoice.id}/price-override`, { method: 'POST', body: JSON.stringify({ lineId: overrideLine.id, unitPrice: price, reason: overrideReason.trim() }) });
      setShowOverride(false);
      setToast('Price overridden');
      await refresh();
    } catch (error) { setToast('Error: ' + (error instanceof Error ? error.message : 'Unable to override price')); }
    setBusy(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3"><button onClick={onBack} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">←</button><h2 className="text-base font-bold">Invoice {invoice.invoice_number}</h2><Badge color={statusColor(invoice.status)}>{invoice.status}</Badge><Badge color={invoice.source === 'Shopify' ? 'cyan' : 'violet'}>{invoice.source || 'Internal'}</Badge></div>
        <button onClick={() => window.open(`${API_URL}/api/sales/invoices/${invoice.id}/print`, '_blank')} className="flex h-8 items-center gap-1.5 rounded-md bg-[#4714a1] px-3 text-[11px] font-bold text-white hover:bg-[#5419b5]"><Printer size={14}/> Print / PDF</button>
      </div>
      <div className="grid gap-3 xl:grid-cols-[1fr_300px]">
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-4">
            <div><p className="text-sm font-bold">Opal Line Jewelry</p><p className="text-[9px] text-slate-400">92.5 Sterling Silver Jewellery</p></div>
            <div className="text-right"><p className="text-[10px] text-slate-400">Invoice #{invoice.invoice_number}</p><p className="text-[10px] text-slate-400">{invoice.invoice_date}</p>{invoice.shopify_order_id && <p className="text-[10px] text-slate-400">Shopify Order: {invoice.shopify_order_id}</p>}</div>
          </div>
          <div className="mb-4 flex justify-between text-[11px]">
            <div><p className="text-[9px] font-bold uppercase text-slate-400">Bill To</p><p className="mt-1 font-bold">{invoice.customer_name}</p><p className="text-slate-500">{invoice.customer_mobile || '—'}</p></div>
            <div className="text-right"><p className="text-[9px] font-bold uppercase text-slate-400">Type / Source</p><p className="mt-1 font-bold">{invoice.invoice_type}</p><p className="text-slate-500">{invoice.source || 'Internal'}{invoice.confirmed_at ? ` · Confirmed ${String(invoice.confirmed_at).slice(0, 10)}` : ''}</p></div>
          </div>
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-[9px] uppercase text-slate-400"><tr>{['Item', 'Purity', 'Net Wt', 'Rate', 'Qty', 'Price', 'Total', ''].map((h) => <th key={h} className="px-2 py-2 text-left font-bold">{h}</th>)}</tr></thead>
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
                  <td className="px-2 py-2">{can('sales.invoice.price_override') && !['Cancelled', 'Returned'].includes(invoice.status) ? <button onClick={() => { setOverrideLine(it); setOverridePrice(String(it.unit_price)); setOverrideReason(''); setShowOverride(true); }} title="Override price" className="text-[#6f39bd] hover:underline"><Settings2 size={12}/></button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 ml-auto w-56 space-y-1.5 text-[11px]">
            <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{inr(invoice.subtotal + invoice.discount)}</span></div>
            <div className="flex justify-between text-slate-500"><span>Discount</span><span>-{inr(invoice.discount)}</span></div>
            <div className="flex justify-between text-slate-500"><span>GST</span><span>{inr(invoice.gst_amount)}</span></div>
            <div className="flex justify-between text-slate-500"><span>Round Off</span><span>{inr(invoice.round_off)}</span></div>
            <div className="flex justify-between border-t border-slate-100 pt-1.5 text-sm font-bold"><span>Grand Total</span><span className="text-[#5419b5]">{inr(invoice.grand_total)}</span></div>
            <div className="flex justify-between text-slate-500"><span>Amount Paid</span><span>{inr(invoice.amount_paid)}</span></div>
            <div className="flex justify-between font-bold text-orange-600"><span>Outstanding</span><span>{inr(invoice.outstanding_balance)}</span></div>
          </div>
          {invoice.notes && <p className="mt-4 rounded-md bg-slate-50 p-2 text-[10px] text-slate-500">{invoice.notes}</p>}
          {invoice.price_override_reason && <p className="mt-2 rounded-md bg-orange-50 p-2 text-[10px] font-semibold text-orange-700">Price override applied — {invoice.price_override_reason}</p>}
          {invoice.cancel_reason && <p className="mt-2 rounded-md bg-red-50 p-2 text-[10px] font-semibold text-red-600">Cancelled — {invoice.cancel_reason}</p>}
        </div>
        <div className="space-y-3">
          <Panel title="Actions" icon={FileText}>
            <div className="grid grid-cols-2 gap-2">
              {can('sales.invoice.confirm') && invoice.status === 'Draft' && (
                <button onClick={confirmInvoice} disabled={!!busy} className="flex items-center justify-center gap-1.5 rounded-md bg-emerald-500 py-2.5 text-[10px] font-bold text-white hover:bg-emerald-600 disabled:opacity-50">{busy === 'confirm' ? 'Confirming...' : 'Confirm'}</button>
              )}
              {can('sales.invoice.record_payment') && !['Draft', 'Cancelled', 'Returned'].includes(invoice.status) && Number(invoice.outstanding_balance) > 0 && (
                <button onClick={() => { setPayAmount(invoice.outstanding_balance); setShowPay(true); }} className="flex items-center justify-center gap-1.5 rounded-md bg-[#4714a1] py-2.5 text-[10px] font-bold text-white hover:bg-[#5419b5]"><CreditCard size={13}/> Record Payment</button>
              )}
              {can('sales.invoice.cancel') && !['Draft', 'Cancelled', 'Returned'].includes(invoice.status) && (
                <button onClick={() => setShowCancel(true)} className="flex items-center justify-center gap-1.5 rounded-md border border-red-200 py-2.5 text-[10px] font-bold text-red-600 hover:bg-red-50"><Ban size={13}/> Cancel</button>
              )}
              <button onClick={() => window.open(`${API_URL}/api/sales/invoices/${invoice.id}/print`, '_blank')} className="flex items-center justify-center gap-1.5 rounded-md border border-slate-200 py-2.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"><Printer size={13}/> Print</button>
              {can('sales.invoice.price_override') && !['Cancelled', 'Returned'].includes(invoice.status) && items.length > 0 && (
                <button onClick={() => { setOverrideLine(items[0]); setOverridePrice(String(items[0].unit_price)); setOverrideReason(''); setShowOverride(true); }} className="flex items-center justify-center gap-1.5 rounded-md border border-slate-200 py-2.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"><Settings2 size={13}/> Price Override</button>
              )}
              {can('sales.invoice.return') && invoice.status === 'Paid' && (
                <button onClick={() => onBack()} className="flex items-center justify-center gap-1.5 rounded-md border border-slate-200 py-2.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"><RotateCcw size={13}/> Return</button>
              )}
            </div>
          </Panel>
          <Panel title="Pricing Details" icon={Receipt}>
            <div className="space-y-2 text-[10px]">
              {[['Silver Rate Used (frozen)', inr(invoice.silver_rate) + ' /g'], ['Payment Method', invoice.payment_method || '—'], ['GST Amount', inr(invoice.gst_amount)], ['Round Off', inr(invoice.round_off)], ['Item Count', String(items.length)]].map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-slate-500">{k}</span><b>{v}</b></div>)}
            </div>
          </Panel>
          <Panel title={`Payments (${payments.length})`} icon={Wallet}>
            <div className="space-y-2 text-[10px]">
              {payments.length === 0 && <p className="text-slate-400">No payments recorded</p>}
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-md border border-slate-50 p-2">
                  <div><p className="font-bold">{inr(p.amount)}</p><p className="text-[9px] text-slate-400">{p.payment_number} · {p.payment_method}</p></div>
                  <Badge color="green">{p.status}</Badge>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      {showPay && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => setShowPay(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold">Record Payment</p><button onClick={() => setShowPay(false)}><X size={16}/></button></div>
            <div className="flex justify-between rounded-md bg-slate-50 p-2 text-[10px]"><span className="text-slate-500">Outstanding</span><b className="text-orange-600">{inr(invoice.outstanding_balance)}</b></div>
            <label className="mt-3 block text-[9px] font-bold uppercase text-slate-400">Amount</label>
            <input type="number" value={payAmount || ''} onChange={(e) => setPayAmount(+e.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-sm font-bold outline-none" />
            <label className="mt-3 block text-[9px] font-bold uppercase text-slate-400">Method</label>
            <div className="mt-1 grid grid-cols-3 gap-1">{['Cash', 'UPI', 'Card', 'Bank', 'Cheque', 'Credit'].map((m) => <button key={m} onClick={() => setPayMethod(m)} className={`rounded py-1.5 text-[9px] font-bold ${payMethod === m ? 'bg-[#4714a1] text-white' : 'bg-slate-100 text-slate-600'}`}>{m}</button>)}</div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setShowPay(false)} className="rounded-md border border-slate-200 py-2 text-[10px] font-bold text-slate-600">Cancel</button>
              <button onClick={recordPayment} disabled={!!busy} className="rounded-md bg-emerald-500 py-2 text-[10px] font-bold text-white disabled:opacity-50">{busy === 'pay' ? 'Saving...' : 'Record Payment'}</button>
            </div>
          </div>
        </div>
      )}

      {showCancel && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => setShowCancel(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold"><AlertTriangle size={14} className="mr-1 inline text-red-500"/>Cancel Invoice</p><button onClick={() => setShowCancel(false)}><X size={16}/></button></div>
            <p className="text-[10px] text-slate-500">This will restock all items and reverse the customer's totals. Existing payments remain recorded.</p>
            <label className="mt-3 block text-[9px] font-bold uppercase text-slate-400">Reason (required)</label>
            <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-xs outline-none" rows={2} />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setShowCancel(false)} className="rounded-md border border-slate-200 py-2 text-[10px] font-bold text-slate-600">Keep Invoice</button>
              <button onClick={cancelInvoice} disabled={!!busy} className="rounded-md bg-red-500 py-2 text-[10px] font-bold text-white disabled:opacity-50">{busy === 'cancel' ? 'Cancelling...' : 'Cancel Invoice'}</button>
            </div>
          </div>
        </div>
      )}

      {showOverride && overrideLine && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={() => setShowOverride(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold">Price Override</p><button onClick={() => setShowOverride(false)}><X size={16}/></button></div>
            <p className="text-[10px] text-slate-500">{overrideLine.name} · {overrideLine.sku}</p>
            <label className="mt-3 block text-[9px] font-bold uppercase text-slate-400">New Unit Price (₹)</label>
            <input type="number" value={overridePrice} onChange={(e) => setOverridePrice(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-sm font-bold outline-none" />
            <label className="mt-3 block text-[9px] font-bold uppercase text-slate-400">Reason (required — audited)</label>
            <textarea value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-xs outline-none" rows={2} />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setShowOverride(false)} className="rounded-md border border-slate-200 py-2 text-[10px] font-bold text-slate-600">Cancel</button>
              <button onClick={applyOverride} disabled={!!busy} className="rounded-md bg-[#4714a1] py-2 text-[10px] font-bold text-white disabled:opacity-50">{busy === 'override' ? 'Applying...' : 'Apply Override'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-[#1d2945] px-4 py-3 text-xs font-semibold text-white shadow-xl">{toast}</div>}
    </div>
  );
}
