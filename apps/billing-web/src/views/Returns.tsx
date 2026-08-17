import { useEffect, useMemo, useState } from 'react';
import {
  Search, Plus, RotateCcw, FileText, Eye, X, ChevronRight, Wallet, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { supabase, inr, type SalesReturn, type ReturnItem, type Invoice, type InvoiceItem } from '@/lib/supabase';
import { Badge, EmptyState, Panel, statusColor } from '@/components/ui';

export default function Returns() {
  const [returns, setReturns] = useState<SalesReturn[]>([]);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<SalesReturn | null>(null);
  const [items, setItems] = useState<ReturnItem[]>([]);

  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await supabase.from('sales_returns').select('*').order('created_at', { ascending: false });
    if (data) setReturns(data as SalesReturn[]);
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return returns.filter((r) => !q || r.return_number.toLowerCase().includes(q) || (r.customer_name || '').toLowerCase().includes(q));
  }, [returns, search]);

  const stats = useMemo(() => {
    const total = returns.reduce((s, r) => s + r.grand_total, 0);
    const refunds = returns.filter((r) => r.refund_type === 'Refund').length;
    const exchanges = returns.filter((r) => r.refund_type === 'Exchange').length;
    const creditNotes = returns.filter((r) => r.refund_type === 'Credit Note').length;
    return { count: returns.length, total, refunds, exchanges, creditNotes };
  }, [returns]);

  async function openDetail(r: SalesReturn) {
    setSelected(r);
    const { data } = await supabase.from('return_items').select('*').eq('return_id', r.id);
    setItems(data as ReturnItem[] || []);
  }

  if (selected) return <ReturnDetail ret={selected} items={items} onBack={() => setSelected(null)} />;
  if (showCreate) return <CreateReturn onBack={() => { setShowCreate(false); load(); }} />;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-5">
        {[
          ['Total Returns', String(stats.count), 'navy', RotateCcw],
          ['Refund Value', inr(stats.total), 'orange', Wallet],
          ['Refunds', String(stats.refunds), 'cyan', RotateCcw],
          ['Exchanges', String(stats.exchanges), 'teal', RotateCcw],
          ['Credit Notes', String(stats.creditNotes), 'violet', FileText],
        ].map(([label, val, color, Icon]) => {
          const I = Icon as typeof RotateCcw;
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
          <p className="text-sm font-bold">Sales Returns</p>
          <div className="flex items-center gap-2">
            <div className="flex h-8 items-center gap-2 rounded-md bg-slate-50 px-3 text-slate-400"><Search size={14}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search return #, customer..." className="w-48 bg-transparent text-xs outline-none" /></div>
            <button onClick={() => setShowCreate(true)} className="flex h-8 items-center gap-1.5 rounded-md bg-[#4714a1] px-3 text-[11px] font-bold text-white hover:bg-[#5419b5]"><Plus size={14}/> New Return</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400">
              <tr>{['Return #', 'Date', 'Invoice #', 'Customer', 'Type', 'Refund Type', 'Amount', 'Status', 'Actions'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="px-3 py-2.5 font-bold text-[#5419b5]">{r.return_number}</td>
                  <td className="px-3 py-2.5 text-slate-500">{r.return_date}</td>
                  <td className="px-3 py-2.5 text-slate-500">{lookupInvoiceNumber(r.invoice_id)}</td>
                  <td className="px-3 py-2.5">{r.customer_name || '—'}</td>
                  <td className="px-3 py-2.5"><Badge color={r.return_type === 'Full' ? 'amber' : 'blue'}>{r.return_type}</Badge></td>
                  <td className="px-3 py-2.5"><Badge color={r.refund_type === 'Refund' ? 'green' : r.refund_type === 'Exchange' ? 'blue' : 'violet'}>{r.refund_type}</Badge></td>
                  <td className="px-3 py-2.5 font-bold">{inr(r.grand_total)}</td>
                  <td className="px-3 py-2.5"><Badge color={statusColor(r.status)}>{r.status}</Badge></td>
                  <td className="px-3 py-2.5"><button onClick={() => openDetail(r)} className="grid h-6 w-6 place-items-center rounded bg-slate-100 text-slate-500 hover:bg-slate-200"><Eye size={12}/></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <EmptyState message="No returns recorded yet" />}
        </div>
      </div>
    </div>
  );

  function lookupInvoiceNumber(id: string): string {
    // cached invoice number lookup
    return invoiceCache[id] || id.slice(0, 8);
  }
}

const invoiceCache: Record<string, string> = {};

function ReturnDetail({ ret, items, onBack }: { ret: SalesReturn; items: ReturnItem[]; onBack: () => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3"><button onClick={onBack} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">←</button><h2 className="text-base font-bold">Return {ret.return_number}</h2><Badge color={statusColor(ret.status)}>{ret.status}</Badge></div>
      <div className="grid gap-3 xl:grid-cols-[1fr_300px]">
        <Panel title="Returned Items" icon={RotateCcw}>
          {items.length === 0 ? <EmptyState message="No items in this return" /> : (
            <table className="w-full text-[11px]">
              <thead className="text-[9px] uppercase text-slate-400"><tr>{['Item', 'SKU', 'Qty', 'Unit Price', 'Line Total'].map((h) => <th key={h} className="px-2 py-2 text-left font-bold">{h}</th>)}</tr></thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-t border-slate-50">
                    <td className="px-2 py-2 font-semibold">{it.name}</td>
                    <td className="px-2 py-2 text-slate-500">{it.sku || '—'}</td>
                    <td className="px-2 py-2">{it.quantity}</td>
                    <td className="px-2 py-2 font-bold">{inr(it.unit_price)}</td>
                    <td className="px-2 py-2 font-bold">{inr(it.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-4 ml-auto w-48 space-y-1.5 text-[11px]">
            <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{inr(ret.subtotal)}</span></div>
            <div className="flex justify-between text-slate-500"><span>GST</span><span>{inr(ret.gst_amount)}</span></div>
            <div className="flex justify-between border-t border-slate-100 pt-1.5 text-sm font-bold"><span>Grand Total</span><span className="text-[#5419b5]">{inr(ret.grand_total)}</span></div>
          </div>
        </Panel>
        <div className="space-y-3">
          <Panel title="Return Details" icon={FileText}>
            <div className="space-y-2 text-[11px]">
              {[['Return Type', ret.return_type], ['Refund Type', ret.refund_type], ['Return Date', ret.return_date], ['Customer', ret.customer_name || '—'], ['Processed By', ret.processed_by]].map(([k,v]) => <div key={k} className="flex justify-between"><span className="text-slate-500">{k}</span><b>{v}</b></div>)}
              {ret.reason && <div className="rounded-md bg-slate-50 p-2 text-[10px] text-slate-500"><b>Reason:</b> {ret.reason}</div>}
            </div>
          </Panel>
          <Panel title="Inventory Update" icon={CheckCircle2}>
            <p className="text-[10px] text-slate-500">Returned items have been added back to stock automatically.</p>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function CreateReturn({ onBack }: { onBack: () => void }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [search, setSearch] = useState('');
  const [selectedInv, setSelectedInv] = useState<Invoice | null>(null);
  const [invItems, setInvItems] = useState<InvoiceItem[]>([]);
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [refundType, setRefundType] = useState('Refund');
  const [reason, setReason] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { loadInvoices(); }, []);
  async function loadInvoices() {
    const { data } = await supabase.from('invoices').select('*').in('status', ['Paid', 'Partially Paid', 'Unpaid']).order('created_at', { ascending: false }).limit(50);
    if (data) { setInvoices(data as Invoice[]); data.forEach((i: any) => { invoiceCache[i.id] = i.invoice_number; }); }
  }

  async function selectInvoice(inv: Invoice) {
    setSelectedInv(inv);
    const { data } = await supabase.from('invoice_items').select('*').eq('invoice_id', inv.id);
    setInvItems(data as InvoiceItem[] || []);
    setReturnQtys({});
  }

  const filteredInvoices = useMemo(() => {
    const q = search.toLowerCase();
    return invoices.filter((i) => !q || i.invoice_number.toLowerCase().includes(q) || i.customer_name.toLowerCase().includes(q));
  }, [invoices, search]);

  const selectedItems = invItems.filter((it) => (returnQtys[it.id] || 0) > 0);
  const returnSubtotal = selectedItems.reduce((s, it) => s + it.unit_price * (returnQtys[it.id] || 0), 0);
  const returnGst = selectedItems.reduce((s, it) => s + it.unit_price * (returnQtys[it.id] || 0) * (it.gst_rate / 100), 0);
  const returnTotal = Math.round(returnSubtotal + returnGst);
  const isFull = selectedItems.length === invItems.length && invItems.length > 0;

  async function processReturn() {
    if (!selectedInv || selectedItems.length === 0) return;
    const ret = {
      invoice_id: selectedInv.id, return_type: isFull ? 'Full' : 'Partial', refund_type: refundType,
      customer_id: selectedInv.customer_id, customer_name: selectedInv.customer_name, reason,
      subtotal: returnSubtotal, gst_amount: returnGst, grand_total: returnTotal,
      status: 'Processed', processed_by: 'Humend Admin',
    };
    const { data, error } = await supabase.from('sales_returns').insert(ret).select().single();
    if (error) { setToast('Error: ' + error.message); return; }
    const retId = (data as any).id;
    await supabase.from('return_items').insert(selectedItems.map((it) => ({
      return_id: retId, invoice_item_id: it.id, product_id: it.product_id, sku: it.sku, name: it.name,
      quantity: returnQtys[it.id], unit_price: it.unit_price, line_total: it.unit_price * (returnQtys[it.id] || 0),
    })));
    // restock
    for (const it of selectedItems) { if (it.product_id) await supabase.from('products').update({ stock_qty: (await supabase.from('products').select('stock_qty').eq('id', it.product_id).maybeSingle()).data?.stock_qty + (returnQtys[it.id] || 0) }).eq('id', it.product_id); }
    setToast(`Return ${(data as any).return_number} processed`);
    setTimeout(() => onBack(), 1500);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3"><button onClick={onBack} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">←</button><h2 className="text-base font-bold">Create Sales Return</h2></div>
      <div className="grid gap-3 xl:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          {!selectedInv ? (
            <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
              <div className="mb-3 flex h-9 items-center gap-2 rounded-md bg-slate-50 px-3 text-slate-400"><Search size={15}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search invoice number or customer..." className="w-full bg-transparent text-xs outline-none" /></div>
              <div className="divide-y divide-slate-50">
                {filteredInvoices.map((inv) => (
                  <button key={inv.id} onClick={() => selectInvoice(inv)} className="flex w-full items-center justify-between px-2 py-3 text-left hover:bg-slate-50">
                    <div><p className="text-[11px] font-bold text-[#5419b5]">{inv.invoice_number}</p><p className="text-[9px] text-slate-400">{inv.customer_name} · {inv.invoice_date}</p></div>
                    <div className="text-right"><p className="text-[11px] font-bold">{inr(inv.grand_total)}</p><Badge color={statusColor(inv.status)}>{inv.status}</Badge></div>
                  </button>
                ))}
                {filteredInvoices.length === 0 && <EmptyState message="No invoices found" />}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div><p className="text-xs font-bold">{selectedInv.invoice_number}</p><p className="text-[9px] text-slate-400">{selectedInv.customer_name} · {selectedInv.invoice_date}</p></div>
                <button onClick={() => { setSelectedInv(null); setInvItems([]); }} className="text-slate-400 hover:text-slate-600"><X size={15}/></button>
              </div>
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 text-[9px] uppercase text-slate-400"><tr>{['Item', 'SKU', 'Qty', 'Price', 'Return Qty'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr></thead>
                <tbody>
                  {invItems.map((it) => (
                    <tr key={it.id} className="border-t border-slate-50">
                      <td className="px-3 py-2.5 font-semibold">{it.name}</td>
                      <td className="px-3 py-2.5 text-slate-500">{it.sku}</td>
                      <td className="px-3 py-2.5">{it.quantity}</td>
                      <td className="px-3 py-2.5 font-bold">{inr(it.unit_price)}</td>
                      <td className="px-3 py-2.5"><input type="number" min={0} max={it.quantity} value={returnQtys[it.id] || ''} onChange={(e) => setReturnQtys({ ...returnQtys, [it.id]: Math.min(it.quantity, Math.max(0, +e.target.value)) })} className="h-7 w-16 rounded border border-slate-200 px-2 text-right outline-none focus:border-[#6f39bd]" placeholder="0" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="space-y-3">
          <Panel title="Return Summary" icon={RotateCcw}>
            <div className="space-y-3 text-[11px]">
              <div><label className="text-[9px] font-bold uppercase text-slate-400">Refund Type</label>
                <div className="mt-1 grid grid-cols-3 gap-1">{['Refund', 'Exchange', 'Credit Note'].map((m) => <button key={m} onClick={() => setRefundType(m)} className={`rounded py-1.5 text-[9px] font-bold ${refundType === m ? 'bg-[#4714a1] text-white' : 'bg-slate-100 text-slate-600'}`}>{m}</button>)}</div>
              </div>
              <div><label className="text-[9px] font-bold uppercase text-slate-400">Reason</label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-[10px] outline-none" rows={2} placeholder="Return reason..." /></div>
              <div className="space-y-1.5 border-t border-slate-100 pt-2">
                <div className="flex justify-between text-slate-500"><span>Items to Return</span><span>{selectedItems.length}</span></div>
                <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{inr(returnSubtotal)}</span></div>
                <div className="flex justify-between text-slate-500"><span>GST</span><span>{inr(returnGst)}</span></div>
                <div className="flex justify-between border-t border-slate-100 pt-1.5 text-sm font-bold"><span>Refund Total</span><span className="text-[#5419b5]">{inr(returnTotal)}</span></div>
              </div>
              <button onClick={processReturn} disabled={selectedItems.length === 0} className="w-full rounded-md bg-emerald-500 py-2.5 text-[11px] font-bold text-white hover:bg-emerald-600 disabled:opacity-50">Process Return</button>
            </div>
          </Panel>
          <Panel title="Info" icon={AlertCircle}>
            <p className="text-[10px] text-slate-500">Returned items will be automatically added back to inventory. The original invoice status will be updated to "Returned" for full returns.</p>
          </Panel>
        </div>
      </div>
      {toast && <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-[#1d2945] px-4 py-3 text-xs font-semibold text-white shadow-xl">{toast}</div>}
    </div>
  );
}
