import { useEffect, useState } from 'react';
import {
  Activity, Bell, CalendarDays, ChevronRight, CircleDollarSign, Clock3, CreditCard, FileText,
  History, PauseCircle, PlayCircle, Plus, ShoppingCart, Store, TrendingUp, Wallet,
} from 'lucide-react';
import { supabase, inr, type Invoice, type HeldBill, type Shift } from '@/lib/supabase';
import { useSilverRate } from '@/lib/silver-rate-context';
import { Badge, EmptyState, Panel, statusColor } from '@/components/ui';

export default function POSDashboard({ onNavigate }: { onNavigate: (v: string) => void }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [held, setHeld] = useState<HeldBill[]>([]);
  const [shift, setShift] = useState<Shift | null>(null);
  const { currentRate: rate, status: rateStatus } = useSilverRate();
  const [pending, setPending] = useState(0);

  useEffect(() => { load(); }, []);
  async function load() {
    const today = new Date().toISOString().slice(0, 10);
    const { data: inv } = await supabase.from('invoices').select('*').eq('invoice_date', today).order('created_at', { ascending: false });
    if (inv) setInvoices(inv as Invoice[]);
    const { data: hb } = await supabase.from('held_bills').select('*').eq('status', 'Held').order('created_at', { ascending: false });
    if (hb) setHeld(hb as HeldBill[]);
    const { data: sh } = await supabase.from('shifts').select('*').eq('status', 'Open').order('opened_at', { ascending: false }).limit(1).maybeSingle();
    if (sh) setShift(sh as Shift);
    const { data: pend } = await supabase.from('invoices').select('*').gt('outstanding_balance', 0);
    if (pend) setPending((pend as Invoice[]).reduce((s, i) => s + i.outstanding_balance, 0));
  }

  const todaySales = invoices.filter((i) => i.status !== 'Cancelled').reduce((s, i) => s + i.grand_total, 0);
  const cashSales = invoices.filter((i) => i.payment_method === 'Cash').reduce((s, i) => s + i.amount_paid, 0);
  const upiSales = invoices.filter((i) => i.payment_method === 'UPI').reduce((s, i) => s + i.amount_paid, 0);
  const cardSales = invoices.filter((i) => i.payment_method === 'Card').reduce((s, i) => s + i.amount_paid, 0);

  return (
    <div className="space-y-3">
      {/* Top quick actions */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => onNavigate('POS Billing')} className="flex items-center gap-2 rounded-lg bg-[#4714a1] px-4 py-2.5 text-[11px] font-bold text-white shadow-sm hover:bg-[#5419b5]"><Plus size={15}/> New Sale</button>
        {[
          ['Held Bills', held.length, PauseCircle, 'amber'],
          ['Resume Bills', held.length, PlayCircle, 'green'],
          ['Today\'s Sales', invoices.length, TrendingUp, 'blue'],
          ['Pending Payments', 1, Wallet, 'orange'],
          ['Cash Drawer', 1, CreditCard, 'cyan'],
        ].map(([label, count, Icon, color]) => {
          const I = Icon as typeof TrendingUp;
          return (
          <button key={label as string} className={`flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-[11px] font-semibold text-slate-700 shadow-sm hover:border-[#cab4f3]`}>
            <I size={15} className={`text-${color}`}/>{label as string} <span className="rounded-full bg-slate-100 px-1.5 text-[9px] font-bold text-slate-500">{count as number}</span>
          </button>
          );
        })}
      </div>

      {/* Silver rate + shift status banner */}
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 p-4 text-white shadow-sm">
          <div><p className="text-[9px] font-medium opacity-90">Today's Silver Rate (92.5)</p>{rateStatus === 'ready'
            ? <p className="text-xl font-bold">₹{rate.toFixed(2)} <span className="text-[10px] font-normal opacity-80">/ gram</span></p>
            : <button onClick={() => onNavigate('Silver Rate')} className="text-xl font-bold underline decoration-white/50 underline-offset-4">{rateStatus === 'loading' ? '…' : 'Set rate'}</button>}</div>
          <Store size={28} className="opacity-40"/>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm border border-slate-100">
          <div><p className="text-[9px] font-semibold text-slate-400">Shift Status</p><p className="mt-1 flex items-center gap-2 text-sm font-bold">{shift ? <><Badge color="green">Open</Badge> {shift.staff_name}</> : <><Badge color="amber">Not Open</Badge></>}</p>{shift && <p className="text-[9px] text-slate-400">Opened: {new Date(shift.opened_at).toLocaleTimeString()}</p>}</div>
          <Clock3 size={24} className="text-slate-200"/>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-white p-4 shadow-sm border border-slate-100">
          <div><p className="text-[9px] font-semibold text-slate-400">Cash Drawer</p><p className="mt-1 text-sm font-bold">{inr(shift?.opening_cash || 0)}</p><p className="text-[9px] text-slate-400">Opening balance</p></div>
          <Wallet size={24} className="text-slate-200"/>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {[
          ["Today's Sales", inr(todaySales), 'orange', CalendarDays],
          ['Cash Sales', inr(cashSales), 'green', Wallet],
          ['UPI Sales', inr(upiSales), 'blue', CreditCard],
          ['Card Sales', inr(cardSales), 'violet', CreditCard],
          ['Pending Payments', inr(pending), 'cyan', Wallet],
          ['Held Bills', String(held.length), 'amber', PauseCircle],
        ].map(([label, val, color, Icon]) => {
          const I = Icon as typeof TrendingUp;
          return (
          <div key={label as string} className={`rounded-xl p-3.5 text-white shadow-sm bg-${color as string}`}>
            <div className="mb-2 flex items-center justify-between"><span className="text-[9px] font-medium">{label as string}</span><I size={14}/></div>
            <p className="text-base font-bold">{val as string}</p>
          </div>
          );
        })}
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Panel title="Recent Transactions" icon={History} action={<button onClick={() => onNavigate('Sales Invoices')} className="text-[9px] font-bold text-[#6f39bd]">View All</button>}>
          {invoices.length === 0 ? <EmptyState message="No transactions today" /> : (
            <div className="space-y-2.5">
              {invoices.slice(0, 6).map((inv) => (
                <div key={inv.id} className="flex items-center justify-between border-b border-slate-50 pb-2.5 text-[10px]">
                  <div className="flex items-center gap-2"><div className="grid h-7 w-7 place-items-center rounded-md bg-purple-50 text-[#6f39bd]"><FileText size={13}/></div><div><p className="font-bold">{inv.invoice_number}</p><p className="text-[9px] text-slate-400">{inv.customer_name}</p></div></div>
                  <div className="text-right"><p className="font-bold">{inr(inv.grand_total)}</p><Badge color={statusColor(inv.payment_status)}>{inv.payment_status}</Badge></div>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Held Bills" icon={PauseCircle} action={<button onClick={() => onNavigate('POS Billing')} className="text-[9px] font-bold text-[#6f39bd]">Resume</button>}>
          {held.length === 0 ? <EmptyState message="No held bills" /> : (
            <div className="space-y-2.5">
              {held.slice(0, 5).map((h) => (
                <div key={h.id} className="flex items-center justify-between border-b border-slate-50 pb-2.5 text-[10px]">
                  <div><p className="font-bold">{h.reference}</p><p className="text-[9px] text-slate-400">{h.customer_name} · expires {new Date(h.expires_at).toLocaleTimeString()}</p></div>
                  <p className="font-bold text-[#5419b5]">{inr(h.grand_total)}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Daily Closing" icon={CircleDollarSign}>
          <div className="space-y-2.5 text-[10px]">
            {[['Opening Cash', inr(shift?.opening_cash || 0)], ['Cash Sales', inr(cashSales)], ['Card Sales', inr(cardSales)], ['UPI Sales', inr(upiSales)], ['Expenses', '₹0.00'], ['Withdrawals', '₹0.00'], ['Closing Cash', inr((shift?.opening_cash || 0) + cashSales)]].map(([k,v]) => <div key={k} className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">{k}</span><b>{v}</b></div>)}
            <button className="mt-2 w-full rounded-md bg-[#4714a1] py-2 text-[10px] font-bold text-white hover:bg-[#5419b5]">Close Shift</button>
          </div>
        </Panel>
      </div>
    </div>
  );
}