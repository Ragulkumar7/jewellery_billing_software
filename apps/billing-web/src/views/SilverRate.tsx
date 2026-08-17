import { useEffect, useState } from 'react';
import {
  TrendingUp, Clock3, User, ArrowUpRight, ArrowDownRight, History, Save, Zap, CheckCircle,
  RefreshCw, Package, AlertTriangle, Eye, Loader2,
} from 'lucide-react';
import { inr, round2, type Product } from '@/lib/supabase';
import { Badge, EmptyState, Panel } from '@/components/ui';
import { api } from '@/lib/api';
import { useSilverRate } from '@/lib/silver-rate-context';

type RateHistoryEntry = {
  id: string;
  purity: string;
  previous_rate: number;
  new_rate: number;
  rate_change: number;
  effective_date: string;
  effective_time: string;
  remarks: string | null;
  updated_by_name: string | null;
  created_at: string;
};

export default function SilverRate() {
  const { currentRate, previousRate, refreshRate } = useSilverRate();
  const [history, setHistory] = useState<RateHistoryEntry[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showUpdate, setShowUpdate] = useState(false);
  const [showPriceImpact, setShowPriceImpact] = useState(false);
  const [lastUpdatedBy, setLastUpdatedBy] = useState('Humend Admin');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [effectiveTime, setEffectiveTime] = useState(new Date().toTimeString().slice(0, 5));

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (history.length > 0) {
      setEffectiveDate(history[0].effective_date);
      setEffectiveTime(history[0].effective_time.slice(0, 5));
      if (history[0].updated_by_name) setLastUpdatedBy(history[0].updated_by_name);
    }
  }, [history]);

  async function load() {
    try {
      const [h, p] = await Promise.all([
        api<RateHistoryEntry[]>('/api/silver-rate/history?limit=20').catch(() => []),
        api<Product[]>('/api/products').catch(() => []),
      ]);
      setHistory(h);
      setProducts(p);
    } catch { /* handled above */ }
  }

  const change = round2(currentRate - previousRate);
  const pctChange = previousRate > 0 ? ((change / previousRate) * 100).toFixed(2) : '0';

  function calcPrice(p: Product, rate: number) {
    const metalValue = round2(p.net_weight * rate);
    const subtotal = metalValue + p.making_charge + p.stone_charge + p.other_charge;
    const gst = round2(subtotal * (p.gst_rate / 100));
    return round2(subtotal + gst);
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-3">
        <div className="rounded-xl bg-gradient-to-br from-[#4714a1] via-[#5b1cb5] to-[#7c2bd9] p-6 text-white shadow-lg">
          <div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-medium opacity-90">Current Silver Rate (92.5 Sterling Silver)</span><TrendingUp size={20} className="opacity-50" /></div>
          <p className="text-4xl font-bold">₹{currentRate.toFixed(2)} <span className="text-lg font-normal opacity-80">/ gram</span></p>
          <div className="mt-4 flex items-center gap-2">
            <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${change >= 0 ? 'bg-emerald-400/20 text-emerald-100' : 'bg-red-400/20 text-red-100'}`}>{change >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{change >= 0 ? '+' : ''}₹{change.toFixed(2)} ({pctChange}%)</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-[10px] opacity-90">
            <div><p className="opacity-70">Effective Date</p><p className="font-bold">{effectiveDate}</p></div>
            <div><p className="opacity-70">Effective Time</p><p className="font-bold">{effectiveTime}</p></div>
            <div><p className="opacity-70">Last Updated By</p><p className="font-bold">{lastUpdatedBy}</p></div>
            <div><p className="opacity-70">Previous Rate</p><p className="font-bold">₹{previousRate.toFixed(2)}/gm</p></div>
          </div>
          <button onClick={() => setShowUpdate(true)} className="mt-5 w-full rounded-lg bg-white/20 py-2.5 text-[11px] font-bold backdrop-blur hover:bg-white/30">Update Silver Rate</button>
        </div>

        <Panel title="Rate Statistics" icon={TrendingUp}>
          <div className="space-y-3 text-[11px]">
            {[['Current Rate', `₹${currentRate.toFixed(2)}/gm`], ['Previous Rate', `₹${previousRate.toFixed(2)}/gm`], ['Change', `${change >= 0 ? '+' : ''}₹${change.toFixed(2)}/gm`], ['Change %', `${pctChange}%`], ['Highest (7 days)', `₹${Math.max(...history.map((h) => h.new_rate), currentRate).toFixed(2)}/gm`], ['Lowest (7 days)', `₹${Math.min(...history.map((h) => h.new_rate), currentRate).toFixed(2)}/gm`], ['Avg (7 days)', `₹${(history.reduce((s, h) => s + h.new_rate, 0) / Math.max(history.length, 1)).toFixed(2)}/gm`]].map(([k, v]) => <div key={k} className="flex justify-between border-b border-slate-50 pb-2"><span className="text-slate-500">{k}</span><b>{v}</b></div>)}
          </div>
        </Panel>

        <Panel title="Price Update Engine" icon={Zap}>
          <div className="flex flex-col items-center gap-1 py-3 text-[10px]">
            {['New Silver Rate', 'Pricing Engine', 'Affected Products', 'Recalculate Prices', 'Review', 'Publish', 'Shopify Sync'].map((s, i) => (
              <div key={s} className="flex flex-col items-center">
                <div className={`rounded-lg border px-4 py-1.5 font-bold ${i === 0 || i === 6 ? 'bg-[#4714a1] text-white' : 'border-slate-200 text-slate-600'}`}>{s}</div>
                {i < 6 && <div className="h-3 w-[2px] bg-slate-300" />}
              </div>
            ))}
          </div>
          <button onClick={() => setShowPriceImpact(true)} className="w-full rounded-md bg-[#4714a1] py-2 text-[10px] font-bold text-white hover:bg-[#5419b5]">Review Price Impact</button>
        </Panel>
      </div>

      <Panel title="Rate History" icon={History}>
        {history.length === 0 ? <EmptyState message="No rate history yet" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400"><tr>{['Date', 'Previous Rate', 'New Rate', 'Change', 'Updated By', 'Remarks', 'Time'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr></thead>
              <tbody>
                {history.map((h) => <tr key={h.id} className="border-t border-slate-50"><td className="px-3 py-2.5 text-slate-500">{h.effective_date}</td><td className="px-3 py-2.5">₹{Number(h.previous_rate).toFixed(2)}</td><td className="px-3 py-2.5 font-bold">₹{Number(h.new_rate).toFixed(2)}</td><td className={`px-3 py-2.5 font-bold ${Number(h.rate_change) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{Number(h.rate_change) >= 0 ? '+' : ''}₹{Number(h.rate_change).toFixed(2)}</td><td className="px-3 py-2.5 text-slate-500">{h.updated_by_name || 'System'}</td><td className="px-3 py-2.5 text-slate-400">{h.remarks || '—'}</td><td className="px-3 py-2.5 text-slate-400">{h.effective_time}</td></tr>)}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Rate Trend (7 Days)" icon={TrendingUp}>
        <div className="h-32 pt-3">
          <svg viewBox="0 0 500 100" className="h-full w-full">
            <path d={`M0 ${90 - ((history[5]?.new_rate || 90.5) - 90) * 30} ${history.slice(0, 6).reverse().map((h, i) => `L${(i + 1) * 80} ${90 - (h.new_rate - 90) * 30}`).join(' ')} L500 ${90 - (currentRate - 90) * 30}`} fill="none" stroke="#4714a1" strokeWidth="2.5" />
            {history.slice(0, 7).reverse().map((h, i) => <circle key={h.id} cx={i * 80} cy={90 - (h.new_rate - 90) * 30} r="3" fill="#4714a1" />)}
          </svg>
        </div>
        <div className="flex justify-between text-[9px] text-slate-400 mt-2">{history.slice(0, 7).reverse().map((h) => <span key={h.id}>{h.effective_date.slice(5)}</span>)}</div>
      </Panel>

      {showUpdate && <UpdateRateModal currentRate={currentRate} previousRate={previousRate} onClose={() => setShowUpdate(false)} onSaved={() => { setShowUpdate(false); void refreshRate(); void load(); }} />}
      {showPriceImpact && <PriceImpactModal products={products} currentRate={previousRate} newRate={currentRate} onClose={() => setShowPriceImpact(false)} onPublished={() => { void refreshRate(); }} />}
    </div>
  );
}

function UpdateRateModal({ currentRate, previousRate, onClose, onSaved }: { currentRate: number; previousRate: number; onClose: () => void; onSaved: () => void }) {
  const [newRate, setNewRate] = useState(currentRate);
  const [effDate, setEffDate] = useState(new Date().toISOString().slice(0, 10));
  const [effTime, setEffTime] = useState(new Date().toTimeString().slice(0, 5));
  const [remarks, setRemarks] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const diff = round2(newRate - previousRate);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api('/api/silver-rate', { method: 'POST', body: JSON.stringify({ ratePerGram: newRate, effectiveDate: effDate, effectiveTime: effTime, remarks }) });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update silver rate');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><p className="text-sm font-bold">Update Silver Rate</p><button onClick={onClose}><RefreshCw size={16} /></button></div>
        {!confirming ? (
          <div className="space-y-3">
            <div><label className="text-[9px] font-bold uppercase text-slate-400">New 92.5 Silver Rate (₹/gram) *</label>
              <input type="number" step="0.01" value={newRate} onChange={(e) => setNewRate(+e.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-bold outline-none focus:border-[#6f39bd]" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-[9px] font-bold uppercase text-slate-400">Effective Date</label><input type="date" value={effDate} onChange={(e) => setEffDate(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-[11px] outline-none" /></div>
              <div><label className="text-[9px] font-bold uppercase text-slate-400">Effective Time</label><input type="time" value={effTime} onChange={(e) => setEffTime(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-[11px] outline-none" /></div>
            </div>
            <div><label className="text-[9px] font-bold uppercase text-slate-400">Remarks</label><textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-[11px] outline-none" rows={2} placeholder="Reason for rate change..." /></div>
            <div className="rounded-lg bg-slate-50 p-3 text-[11px]">
              <div className="flex justify-between py-1"><span className="text-slate-500">Previous Rate</span><b>₹{previousRate.toFixed(2)}/g</b></div>
              <div className="flex justify-between py-1"><span className="text-slate-500">New Rate</span><b>₹{newRate.toFixed(2)}/g</b></div>
              <div className="flex justify-between py-1 border-t border-slate-200 mt-1 pt-2"><span className="text-slate-500">Difference</span><b className={diff >= 0 ? 'text-emerald-600' : 'text-red-500'}>{diff >= 0 ? '+' : ''}₹{diff.toFixed(2)}/g</b></div>
            </div>
            {error && <p className="text-[10px] font-semibold text-red-500">{error}</p>}
            <button onClick={() => setConfirming(true)} className="w-full rounded-md bg-[#4714a1] py-2.5 text-[11px] font-bold text-white hover:bg-[#5419b5]">Review & Confirm</button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-amber-50 p-4 text-center">
              <AlertTriangle size={32} className="mx-auto text-amber-500" />
              <p className="mt-2 text-sm font-bold text-amber-700">Confirm Rate Change</p>
              <p className="mt-1 text-[11px] text-amber-600">This will update the silver rate to ₹{newRate.toFixed(2)}/g and recalculate product prices. Are you sure?</p>
            </div>
            {error && <p className="text-[10px] font-semibold text-red-500">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setConfirming(false)} className="flex-1 rounded-md border border-slate-200 py-2.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50">Back</button>
              <button onClick={save} disabled={saving} className="flex-1 rounded-md bg-emerald-600 py-2.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{saving ? 'Saving...' : 'Confirm & Save'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PriceImpactModal({ products, currentRate, newRate, onClose, onPublished }: { products: Product[]; currentRate: number; newRate: number; onClose: () => void; onPublished: () => void }) {
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const calcPrice = (p: Product, rate: number) => { const mv = round2(p.net_weight * rate); const sub = mv + p.making_charge + p.stone_charge + p.other_charge; return round2(sub + round2(sub * (p.gst_rate / 100))); };

  async function publish() {
    setPublishing(true);
    setError(null);
    try {
      await api('/api/silver-rate/publish', { method: 'POST', body: JSON.stringify({}) });
      setPublished(true);
      onPublished();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to publish prices');
    } finally { setPublishing(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><p className="text-sm font-bold">Price Impact Review</p><button onClick={onClose}><RefreshCw size={16} /></button></div>
        <div className="mb-4 rounded-lg bg-[#4714a1] p-4 text-white">
          <div className="flex items-center justify-between"><div><p className="text-[10px] opacity-90">Affected Products</p><p className="text-2xl font-bold">{products.length}</p></div><div><p className="text-[10px] opacity-90">Rate Change</p><p className="text-2xl font-bold">₹{currentRate.toFixed(2)} → ₹{newRate.toFixed(2)}</p></div></div>
        </div>
        <table className="w-full text-[11px]">
          <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400"><tr>{['Product', 'SKU', 'Old Price', 'New Price', 'Difference'].map((h) => <th key={h} className="px-3 py-2 text-left font-bold">{h}</th>)}</tr></thead>
          <tbody>
            {products.slice(0, 15).map((p) => { const oldP = calcPrice(p, currentRate); const newP = calcPrice(p, newRate); const diff = round2(newP - oldP); return <tr key={p.id} className="border-t border-slate-50"><td className="px-3 py-2 font-bold">{p.name}</td><td className="px-3 py-2 text-slate-500">{p.sku}</td><td className="px-3 py-2">{inr(oldP)}</td><td className="px-3 py-2 font-bold">{inr(newP)}</td><td className={`px-3 py-2 font-bold ${diff >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{diff >= 0 ? '+' : ''}{inr(diff)}</td></tr>; })}
          </tbody>
        </table>
        {error && <p className="mt-3 text-[10px] font-semibold text-red-500"><AlertTriangle size={12} className="mr-1 inline" />{error}</p>}
        {published ? <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-center"><CheckCircle size={24} className="mx-auto text-emerald-500" /><p className="mt-1 text-sm font-bold text-emerald-700">Product Prices Published</p></div> : <button onClick={publish} disabled={publishing} className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-[#4714a1] py-2.5 text-[11px] font-bold text-white hover:bg-[#5419b5] disabled:opacity-50">{publishing ? <><Loader2 size={14} className="animate-spin" /> Publishing...</> : 'Confirm & Publish Price Update'}</button>}
      </div>
    </div>
  );
}