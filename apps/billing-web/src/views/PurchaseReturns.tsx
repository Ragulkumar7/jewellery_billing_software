import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Eye, X, RotateCcw, FileText, AlertTriangle, CheckCircle2, Ban, ChevronDown } from 'lucide-react';
import { inr, round2 } from '@/lib/supabase';
import { Badge, EmptyState, statusColor } from '@/components/ui';
import { api } from '@/lib/api';

type Permissions = string[];

type PurchaseReturn = {
  id: string;
  return_number: string;
  supplier_id: string | null;
  supplier_name?: string | null;
  grn_id: string | null;
  grn_number?: string | null;
  invoice_id?: string | null;
  pi_number?: string | null;
  return_date: string;
  status: string;
  reason?: string | null;
  remarks?: string | null;
  grand_total: number;
  item_count?: number;
  approved_at?: string | null;
  cancelled_at?: string | null;
};

type PRItemRow = { id: string; return_id: string; product_id: string | null; sku: string | null; name: string; quantity: number; unit_cost: number; line_total: number; reason?: string | null };
type ReturnDetailData = { purchaseReturn: PurchaseReturn; items: PRItemRow[] };

type GRN = { id: string; grn_number: string; po_id: string | null; po_number?: string | null; supplier_id: string | null; supplier_name?: string | null; status: string; grn_date: string };
type GRNItemRow = { id: string; grn_id: string; product_id: string | null; sku: string | null; name: string; purity: string | null; unit: string; received_qty: number };

const REASONS = ['Damaged', 'Wrong Item', 'Incorrect Weight', 'Purity Issue', 'Quality Issue', 'Ordered Incorrectly', 'Excess Quantity', 'Other'];

export default function PurchaseReturns({ permissions }: { permissions: Permissions }) {
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [returns, setReturns] = useState<PurchaseReturn[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selected, setSelected] = useState<ReturnDetailData | null>(null);

  const can = (perm: string) => permissions.includes('*') || permissions.includes(perm);

  async function load() {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (search) params.set('q', search);
      if (statusFilter !== 'All') params.set('status', statusFilter);
      setReturns(await api<PurchaseReturn[]>(`/api/purchase-returns?${params.toString()}`));
    } catch { setReturns([]); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter, search]);

  if (view === 'create') return <CreateReturn permissions={permissions} onBack={() => { setView('list'); load(); }} onView={(d) => { setSelected(d); setView('detail'); }} />;
  if (view === 'detail' && selected) return <ReturnDetail permissions={permissions} data={selected} onBack={() => { setView('list'); load(); }} onRefresh={(d) => setSelected(d)} />;

  const totalValue = returns.reduce((s, r) => s + r.grand_total, 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-5">
        {[
          ['Total Returns', String(returns.length), 'navy', RotateCcw],
          ['Return Value', inr(totalValue), 'orange', FileText],
          ['Draft', String(returns.filter((r) => r.status === 'Draft').length), 'amber', FileText],
          ['Approved', String(returns.filter((r) => r.status === 'Approved').length), 'green', CheckCircle2],
          ['Cancelled', String(returns.filter((r) => r.status === 'Cancelled').length), 'slate', Ban],
        ].map(([label, val, color, Icon]) => {
          const I = Icon as typeof RotateCcw;
          return <div key={label as string} className={`rounded-lg p-3 text-white shadow-sm bg-${color as string}`}><div className="mb-2 flex items-center justify-between"><span className="text-[9px] font-medium">{label as string}</span><I size={14}/></div><p className="text-sm font-bold">{val as string}</p></div>;
        })}
      </div>
      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-bold">Purchase Returns</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-8 items-center gap-2 rounded-md bg-slate-50 px-3 text-slate-400"><Search size={14}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search return #, supplier, GRN..." className="w-48 bg-transparent text-xs outline-none" /></div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">{['All', 'Draft', 'Approved', 'Cancelled'].map((s) => <option key={s}>{s}</option>)}</select>
            {can('purchase.return.create') && <button onClick={() => setView('create')} className="flex h-8 items-center gap-1.5 rounded-md bg-[#4714a1] px-3 text-[11px] font-bold text-white hover:bg-[#5419b5]"><Plus size={14}/> New Return</button>}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400"><tr>{['Return #', 'Date', 'Supplier', 'GRN Ref', 'Reason', 'Amount', 'Status', 'Actions'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr></thead>
            <tbody>
              {returns.map((r) => (
                <tr key={r.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="px-3 py-2.5 font-bold text-[#5419b5]">{r.return_number}</td>
                  <td className="px-3 py-2.5 text-slate-500">{r.return_date}</td>
                  <td className="px-3 py-2.5 font-semibold">{r.supplier_name || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500">{r.grn_number || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500">{r.reason || '—'}</td>
                  <td className="px-3 py-2.5 font-bold">{inr(r.grand_total)}</td>
                  <td className="px-3 py-2.5"><Badge color={statusColor(r.status)}>{r.status}</Badge></td>
                  <td className="px-3 py-2.5"><button onClick={() => openDetail(r.id)} className="grid h-6 w-6 place-items-center rounded bg-slate-100 text-slate-500 hover:bg-slate-200"><Eye size={12}/></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {returns.length === 0 && <EmptyState message="No purchase returns recorded. Create one when returning goods." />}
        </div>
      </div>
    </div>
  );

  async function openDetail(id: string) {
    try { setSelected(await api<ReturnDetailData>(`/api/purchase-returns/${id}`)); setView('detail'); } catch { /* keep list */ }
  }
}

// ---------------- Create return ----------------

type ReturnLine = { grnItemId: string | null; productId: string; sku: string; name: string; received: number; quantity: number; unitCost: number; reason: string };

function CreateReturn({ permissions, onBack, onView }: { permissions: Permissions; onBack: () => void; onView: (d: ReturnDetailData) => void }) {
  const [grns, setGrns] = useState<GRN[]>([]);
  const [selectedGRN, setSelectedGRN] = useState<GRN | null>(null);
  const [lines, setLines] = useState<ReturnLine[]>([]);
  const [grnSearch, setGrnSearch] = useState('');
  const [showGRN, setShowGRN] = useState(true);
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    api<GRN[]>('/api/grns?status=Approved').then(setGrns).catch(() => setGrns([]));
  }, []);

  const filteredGRNs = useMemo(() => { const q = grnSearch.toLowerCase(); return grns.filter((g) => !q || g.grn_number.toLowerCase().includes(q) || (g.supplier_name || '').toLowerCase().includes(q) || (g.po_number || '').toLowerCase().includes(q)); }, [grns, grnSearch]);
  const selectedLines = lines.filter((l) => l.quantity > 0);
  const returnTotal = Math.round(selectedLines.reduce((s, l) => s + round2(l.unitCost * l.quantity), 0));

  async function selectGRN(g: GRN) {
    setSelectedGRN(g);
    setShowGRN(false);
    try {
      const detail = await api<{ grn: GRN; items: GRNItemRow[] }>(`/api/grns/${g.id}`);
      setLines(detail.items.map((it) => ({ grnItemId: it.id, productId: it.product_id || '', sku: it.sku || '', name: it.name, received: it.received_qty, quantity: 0, unitCost: 0, reason: '' })));
    } catch { setLines([]); }
  }
  function updateLine(i: number, patch: Partial<ReturnLine>) { setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l)); }

  async function save() {
    if (!selectedGRN || selectedLines.length === 0) { setToast('Select a GRN and enter return quantities'); return; }
    if (!reason) { setToast('Select a return reason'); return; }
    setBusy(true);
    try {
      const ret = await api<PurchaseReturn>('/api/purchase-returns', {
        method: 'POST',
        body: JSON.stringify({
          supplierId: selectedGRN.supplier_id,
          grnId: selectedGRN.id,
          reason,
          remarks: remarks || null,
          items: selectedLines.map((l) => ({ grnItemId: l.grnItemId, productId: l.productId, quantity: l.quantity, unitCost: l.unitCost, reason: l.reason || reason })),
        }),
      });
      setToast(`Return ${ret.return_number} created`);
      setTimeout(() => onBack(), 900);
    } catch (error) {
      setToast('Error: ' + (error instanceof Error ? error.message : 'Unable to create return'));
    }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3"><button onClick={onBack} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">←</button><h2 className="text-base font-bold">Create Purchase Return</h2></div>
      {showGRN ? (
        <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
          <div className="mb-3 flex h-9 items-center gap-2 rounded-md bg-slate-50 px-3 text-slate-400"><Search size={15}/><input value={grnSearch} onChange={(e) => setGrnSearch(e.target.value)} placeholder="Search GRN to return against..." className="w-full bg-transparent text-xs outline-none" /></div>
          <div className="divide-y divide-slate-50">
            {filteredGRNs.map((g) => (<button key={g.id} onClick={() => selectGRN(g)} className="flex w-full items-center justify-between px-2 py-3 text-left hover:bg-slate-50"><div><p className="text-[11px] font-bold text-[#5419b5]">{g.grn_number}</p><p className="text-[9px] text-slate-400">{g.supplier_name || '—'} · {g.grn_date} · PO: {g.po_number || '—'}</p></div><Badge color="green">Approved</Badge></button>))}
            {filteredGRNs.length === 0 && <EmptyState message="No approved GRNs to return against" />}
          </div>
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-[1fr_300px]">
          <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><p className="text-xs font-bold">{selectedGRN?.grn_number}</p><p className="text-[9px] text-slate-400">{selectedGRN?.supplier_name}</p></div><button onClick={() => { setShowGRN(true); setSelectedGRN(null); setLines([]); }} className="text-slate-400 hover:text-slate-600"><X size={15}/></button></div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 text-[9px] uppercase text-slate-400"><tr>{['Item', 'Received', 'Return Qty', 'Unit Cost', 'Value', 'Reason'].map((h) => <th key={h} className="px-2 py-2 text-left font-bold">{h}</th>)}</tr></thead>
                <tbody>
                  {lines.map((it, i) => (
                    <tr key={it.grnItemId || it.productId} className="border-t border-slate-50">
                      <td className="px-2 py-2 font-semibold">{it.name}<p className="text-[9px] text-slate-400">{it.sku}</p></td>
                      <td className="px-2 py-2">{it.received}</td>
                      <td className="px-2 py-2"><input type="number" min={0} max={it.received} value={it.quantity || ''} onChange={(e) => updateLine(i, { quantity: Math.min(it.received, Math.max(0, +e.target.value)) })} className="h-6 w-14 rounded border border-slate-200 px-1 text-right outline-none focus:border-[#6f39bd]" placeholder="0" /></td>
                      <td className="px-2 py-2"><input type="number" min={0} value={it.unitCost || ''} onChange={(e) => updateLine(i, { unitCost: Math.max(0, +e.target.value) })} className="h-6 w-16 rounded border border-slate-200 px-1 text-right outline-none" placeholder="0" /></td>
                      <td className="px-2 py-2 font-bold">{inr(round2(it.unitCost * it.quantity))}</td>
                      <td className="px-2 py-2"><select value={it.reason} onChange={(e) => updateLine(i, { reason: e.target.value })} className="h-6 w-28 rounded border border-slate-200 px-1 text-[10px] outline-none"><option value="">Same as header</option>{REASONS.map((r) => <option key={r}>{r}</option>)}</select></td>
                    </tr>
                  ))}
                  {lines.length === 0 && <tr><td colSpan={6}><EmptyState message="No items in this GRN" /></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
              <p className="border-b border-slate-100 px-4 py-3 text-xs font-bold">Return Summary</p>
              <div className="space-y-3 p-4 text-[11px]">
                <div><label className="text-[9px] font-bold uppercase text-slate-400">Reason</label><select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 h-8 w-full rounded-md border border-slate-200 px-2 text-[11px] outline-none">{[''].concat(REASONS).map((r) => <option key={r} value={r}>{r || 'Select a reason...'}</option>)}</select></div>
                <div className="space-y-1.5 border-t border-slate-100 pt-2">
                  <div className="flex justify-between text-slate-500"><span>Items to Return</span><span>{selectedLines.length}</span></div>
                  <div className="flex justify-between border-t border-slate-100 pt-1.5 text-sm font-bold"><span>Return Total</span><span className="text-[#5419b5]">{inr(returnTotal)}</span></div>
                </div>
                <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Remarks..." className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-[10px] outline-none" rows={2} />
                <button onClick={save} disabled={busy || selectedLines.length === 0 || !reason} className="w-full rounded-md bg-[#4714a1] py-2.5 text-[11px] font-bold text-white hover:bg-[#5419b5] disabled:opacity-50">{busy ? 'Saving...' : 'Save Return (Draft)'}</button>
              </div>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white p-3 text-[10px] text-slate-500"><AlertTriangle size={13} className="mr-1 inline text-amber-500"/>Returned items will be removed from inventory and the supplier's balance adjusted when the return is approved.</div>
          </div>
        </div>
      )}
      {toast && <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-[#1d2945] px-4 py-3 text-xs font-semibold text-white shadow-xl">{toast}</div>}
    </div>
  );
}

// ---------------- Return detail ----------------

function ReturnDetail({ permissions, data, onBack, onRefresh }: { permissions: Permissions; data: ReturnDetailData; onBack: () => void; onRefresh: (d: ReturnDetailData) => void }) {
  const { purchaseReturn: r, items } = data;
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const can = (perm: string) => permissions.includes('*') || permissions.includes(perm);

  async function setStatus(action: 'Approve' | 'Cancel') {
    setBusy(true);
    try {
      await api(`/api/purchase-returns/${r.id}/status`, { method: 'POST', body: JSON.stringify({ action }) });
      setToast(action === 'Approve' ? 'Return approved — stock removed & supplier adjusted' : 'Return cancelled');
      onRefresh(await api<ReturnDetailData>(`/api/purchase-returns/${r.id}`));
    } catch (error) { setToast('Error: ' + (error instanceof Error ? error.message : 'Unable to update return')); }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3"><button onClick={onBack} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">←</button><h2 className="text-base font-bold">Return {r.return_number}</h2><Badge color={statusColor(r.status)}>{r.status}</Badge></div>
      </div>
      <div className="grid gap-3 xl:grid-cols-[1fr_280px]">
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-4"><div><p className="text-sm font-bold">Purchase Return</p><p className="text-[9px] text-slate-400">{r.return_date}</p></div><div className="text-right"><p className="text-[10px] font-bold">GRN: {r.grn_number || '—'}</p><p className="text-[10px] text-slate-400">Invoice: {r.pi_number || '—'}</p></div></div>
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-[9px] uppercase text-slate-400"><tr>{['Item', 'Qty', 'Unit Cost', 'Line Total'].map((h) => <th key={h} className="px-2 py-2 text-left font-bold">{h}</th>)}</tr></thead>
            <tbody>{items.map((it) => (<tr key={it.id} className="border-t border-slate-50"><td className="px-2 py-2 font-semibold">{it.name}<p className="text-[9px] text-slate-400">{it.sku}</p></td><td className="px-2 py-2">{it.quantity}</td><td className="px-2 py-2 font-bold">{inr(it.unit_cost)}</td><td className="px-2 py-2 font-bold">{inr(it.line_total)}</td></tr>))}</tbody>
          </table>
          <div className="mt-4 ml-auto w-56 space-y-1.5 text-[11px]">
            <div className="flex justify-between border-t border-slate-100 pt-1.5 text-sm font-bold"><span>Return Total</span><span className="text-[#5419b5]">{inr(r.grand_total)}</span></div>
          </div>
          {r.remarks && <p className="mt-4 rounded-md bg-slate-50 p-2 text-[10px] text-slate-500">{r.remarks}</p>}
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
            <p className="border-b border-slate-100 px-4 py-3 text-xs font-bold">Actions</p>
            <div className="grid grid-cols-1 gap-2 p-3">
              {r.status === 'Draft' && can('purchase.return.approve') && (
                <button onClick={() => setStatus('Approve')} disabled={busy} className="flex items-center justify-center gap-1.5 rounded-md bg-emerald-500 py-2.5 text-[10px] font-bold text-white hover:bg-emerald-600 disabled:opacity-50"><CheckCircle2 size={13}/>{busy ? 'Approving...' : 'Approve Return'}</button>
              )}
              {r.status === 'Draft' && can('purchase.order.cancel') && (
                <button onClick={() => setStatus('Cancel')} disabled={busy} className="flex items-center justify-center gap-1.5 rounded-md border border-red-200 py-2.5 text-[10px] font-bold text-red-600 hover:bg-red-50"><Ban size={13}/> Cancel Return</button>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
            <p className="border-b border-slate-100 px-4 py-3 text-xs font-bold">Return Details</p>
            <div className="space-y-2 p-3 text-[10px]">
              {[['Supplier', r.supplier_name || '—'], ['GRN Ref', r.grn_number || '—'], ['Invoice Ref', r.pi_number || '—'], ['Reason', r.reason || '—'], ['Approved', String(r.approved_at || '').slice(0, 16) || '—']].map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-slate-500">{k}</span><b>{v}</b></div>)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-3 text-[10px] text-slate-500">Approved returns remove items from inventory and reduce the supplier's outstanding balance.</div>
        </div>
      </div>
      {toast && <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-[#1d2945] px-4 py-3 text-xs font-semibold text-white shadow-xl">{toast}</div>}
    </div>
  );
}
