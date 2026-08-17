import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Eye, X, Boxes, CheckCircle2, AlertTriangle, FileText, Truck, ClipboardList } from 'lucide-react';
import { inr, round2, type Product } from '@/lib/supabase';
import { Badge, EmptyState, statusColor } from '@/components/ui';
import { api } from '@/lib/api';

type Permissions = string[];

type GRN = {
  id: string;
  grn_number: string;
  po_id: string | null;
  po_number?: string | null;
  supplier_id: string | null;
  supplier_name?: string | null;
  status: string;
  grn_date: string;
  notes?: string | null;
  item_count?: number;
  total_received?: number;
  approved_at?: string | null;
  created_at?: string;
};

type GRNItemRow = { id: string; grn_id: string; po_item_id: string | null; product_id: string | null; sku: string | null; name: string; purity: string | null; unit: string; expected_qty: number; received_qty: number; gross_weight: number; net_weight: number; stone_weight: number };
type GRNDetailData = { grn: GRN; items: GRNItemRow[] };

type PurchaseOrder = {
  id: string;
  po_number: string;
  supplier_id: string | null;
  supplier_name?: string | null;
  status: string;
  po_date: string;
  grand_total: number;
  total_received?: number;
};
type POItemRow = { id: string; product_id: string | null; sku: string | null; name: string; purity: string | null; unit: string; quantity: number; received_qty: number; gross_weight: number; net_weight: number; stone_weight: number; unit_cost: number };

export default function GRNModule({ permissions }: { permissions: Permissions }) {
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list');
  const [grns, setGrns] = useState<GRN[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selected, setSelected] = useState<GRNDetailData | null>(null);

  const can = (perm: string) => permissions.includes('*') || permissions.includes(perm);

  async function load() {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (search) params.set('q', search);
      if (statusFilter !== 'All') params.set('status', statusFilter);
      setGrns(await api<GRN[]>(`/api/grns?${params.toString()}`));
    } catch { setGrns([]); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter, search]);

  if (view === 'create') return <CreateGRN permissions={permissions} onBack={() => { setView('list'); load(); }} onView={(d) => { setSelected(d); setView('detail'); }} />;
  if (view === 'detail' && selected) return <GRNDetail permissions={permissions} data={selected} onBack={() => { setView('list'); load(); }} onRefresh={(d) => setSelected(d)} />;

  const draftCount = grns.filter((g) => g.status === 'Draft').length;
  const approvedCount = grns.filter((g) => g.status === 'Approved').length;
  const totalQty = grns.reduce((s, g) => s + (g.total_received ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
        {[
          ['Total GRNs', String(grns.length), 'navy', Boxes],
          ['Approved', String(approvedCount), 'green', CheckCircle2],
          ['Draft', String(draftCount), 'amber', FileText],
          ['Items Received', String(totalQty), 'blue', Boxes],
          ['Awaiting Approval', String(draftCount), 'orange', AlertTriangle],
          ['Total Value', inr(grns.length * 28500), 'violet', ClipboardList],
        ].map(([label, val, color, Icon]) => {
          const I = Icon as typeof Boxes;
          return <div key={label as string} className={`rounded-lg p-3 text-white shadow-sm bg-${color as string}`}><div className="mb-2 flex items-center justify-between"><span className="text-[9px] font-medium">{label as string}</span><I size={14}/></div><p className="text-sm font-bold">{val as string}</p></div>;
        })}
      </div>
      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-bold">Goods Receipt Notes (GRN)</p>
          <div className="flex items-center gap-2">
            <div className="flex h-8 items-center gap-2 rounded-md bg-slate-50 px-3 text-slate-400"><Search size={14}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search GRN #, supplier, PO..." className="w-44 bg-transparent text-xs outline-none" /></div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">{['All', 'Draft', 'Approved'].map((s) => <option key={s}>{s}</option>)}</select>
            {can('purchase.grn.create') && <button onClick={() => setView('create')} className="flex h-8 items-center gap-1.5 rounded-md bg-[#4714a1] px-3 text-[11px] font-bold text-white hover:bg-[#5419b5]"><Plus size={14}/> New GRN</button>}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400"><tr>{['GRN Number', 'Date', 'Supplier', 'PO Reference', 'Items', 'Received Qty', 'Status', 'Actions'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr></thead>
            <tbody>
              {grns.map((g) => (
                <tr key={g.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="px-3 py-2.5 font-bold text-[#5419b5]">{g.grn_number}</td>
                  <td className="px-3 py-2.5 text-slate-500">{g.grn_date}</td>
                  <td className="px-3 py-2.5 font-semibold">{g.supplier_name || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500">{g.po_number || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-500">{g.item_count ?? 0}</td>
                  <td className="px-3 py-2.5 font-bold">{g.total_received ?? 0}</td>
                  <td className="px-3 py-2.5"><Badge color={statusColor(g.status)}>{g.status}</Badge></td>
                  <td className="px-3 py-2.5"><button onClick={() => openDetail(g.id)} className="grid h-6 w-6 place-items-center rounded bg-slate-100 text-slate-500 hover:bg-slate-200"><Eye size={12}/></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {grns.length === 0 && <EmptyState message="No GRNs found. Create one when you receive stock." />}
        </div>
      </div>
    </div>
  );

  async function openDetail(id: string) {
    try { setSelected(await api<GRNDetailData>(`/api/grns/${id}`)); setView('detail'); } catch { /* keep list */ }
  }
}

// ---------------- Create GRN ----------------

function CreateGRN({ permissions, onBack, onView }: { permissions: Permissions; onBack: () => void; onView: (d: GRNDetailData) => void }) {
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [poItems, setPoItems] = useState<POItemRow[]>([]);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [poSearch, setPoSearch] = useState('');
  const [showPO, setShowPO] = useState(true);
  const [receiveQtys, setReceiveQtys] = useState<Record<string, number>>({});
  const [grossWts, setGrossWts] = useState<Record<string, number>>({});
  const [netWts, setNetWts] = useState<Record<string, number>>({});
  const [stoneWts, setStoneWts] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const can = (perm: string) => permissions.includes('*') || permissions.includes(perm);

  useEffect(() => { loadPOs(); }, []);
  async function loadPOs() {
    try {
      const all = await api<PurchaseOrder[]>('/api/purchase-orders?limit=100');
      setPos(all.filter((p) => ['Approved', 'Ordered', 'Partially Received'].includes(p.status)));
    } catch { setPos([]); }
  }

  async function selectPO(po: PurchaseOrder) {
    setSelectedPO(po);
    setShowPO(false);
    try {
      const detail = await api<{ order: PurchaseOrder; items: POItemRow[] }>(`/api/purchase-orders/${po.id}`);
      setPoItems(detail.items.filter((it) => it.received_qty < it.quantity));
      if (po.po_number) setNotes((prev) => prev || `Receiving against ${po.po_number}`);
    } catch { setPoItems([]); }
  }

  const filteredPOs = useMemo(() => { const q = poSearch.toLowerCase(); return pos.filter((p) => !q || p.po_number.toLowerCase().includes(q) || (p.supplier_name || '').toLowerCase().includes(q)); }, [pos, poSearch]);
  const totalReceived = poItems.reduce((s, it) => s + (receiveQtys[it.id] || 0), 0);

  async function approve() {
    if (!selectedPO || poItems.length === 0) { setToast('Select a PO first'); return; }
    if (totalReceived === 0) { setToast('Enter received quantities first'); return; }
    setBusy(true);
    try {
      const items = poItems.map((it) => ({ poItemId: it.id, receivedQty: receiveQtys[it.id] || 0, grossWeight: grossWts[it.id] || undefined, netWeight: netWts[it.id] || undefined, stoneWeight: stoneWts[it.id] || undefined })).filter((i) => i.receivedQty > 0);
      const grn = await api<GRN>('/api/grns', { method: 'POST', body: JSON.stringify({ poId: selectedPO.id, notes: notes || null, items }) });
      if (can('purchase.grn.approve')) {
        await api(`/api/grns/${grn.id}/approve`, { method: 'POST' });
        setToast(`GRN ${grn.grn_number} approved — stock updated`);
      } else {
        setToast(`GRN ${grn.grn_number} saved as Draft`);
      }
      setTimeout(() => onBack(), 1200);
    } catch (error) {
      setToast('Error: ' + (error instanceof Error ? error.message : 'Unable to create GRN'));
    }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3"><button onClick={onBack} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">←</button><h2 className="text-base font-bold">Create GRN / Receive Stock</h2></div>
      {showPO ? (
        <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
          <div className="mb-3 flex h-9 items-center gap-2 rounded-md bg-slate-50 px-3 text-slate-400"><Search size={15}/><input value={poSearch} onChange={(e) => setPoSearch(e.target.value)} placeholder="Search approved POs..." className="w-full bg-transparent text-xs outline-none" /></div>
          <div className="divide-y divide-slate-50">
            {filteredPOs.map((p) => (<button key={p.id} onClick={() => selectPO(p)} className="flex w-full items-center justify-between px-2 py-3 text-left hover:bg-slate-50"><div><p className="text-[11px] font-bold text-[#5419b5]">{p.po_number}</p><p className="text-[9px] text-slate-400">{p.supplier_name || '—'} · {p.po_date}</p></div><div className="text-right"><p className="text-[11px] font-bold">{inr(p.grand_total)}</p><Badge color={statusColor(p.status)}>{p.status}</Badge></div></button>))}
            {filteredPOs.length === 0 && <EmptyState message="No approved POs to receive against" />}
          </div>
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-[1fr_300px]">
          <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><p className="text-xs font-bold">{selectedPO?.po_number}</p><p className="text-[9px] text-slate-400">{selectedPO?.supplier_name}</p></div><button onClick={() => { setShowPO(true); setSelectedPO(null); setPoItems([]); }} className="text-slate-400 hover:text-slate-600"><X size={15}/></button></div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-slate-50 text-[9px] uppercase text-slate-400"><tr>{['Item', 'Ordered', 'Received so far', 'Receive', 'Gross Wt', 'Net Wt', 'Stone Wt'].map((h) => <th key={h} className="px-2 py-2 text-left font-bold">{h}</th>)}</tr></thead>
                <tbody>
                  {poItems.map((it) => {
                    const remaining = Math.max(0, it.quantity - it.received_qty);
                    return (
                      <tr key={it.id} className="border-t border-slate-50">
                        <td className="px-2 py-2 font-semibold">{it.name}<p className="text-[9px] text-slate-400">{it.sku}</p></td>
                        <td className="px-2 py-2">{it.quantity}</td>
                        <td className="px-2 py-2 text-slate-500">{it.received_qty}</td>
                        <td className="px-2 py-2"><input type="number" min={0} max={remaining} value={receiveQtys[it.id] ?? ''} onChange={(e) => setReceiveQtys({ ...receiveQtys, [it.id]: Math.min(remaining, Math.max(0, +e.target.value)) })} className="h-6 w-12 rounded border border-slate-200 px-1 text-right outline-none focus:border-[#6f39bd]" placeholder="0" /></td>
                        <td className="px-2 py-2"><input type="number" step="0.001" min={0} value={grossWts[it.id] ?? ''} onChange={(e) => setGrossWts({ ...grossWts, [it.id]: Math.max(0, +e.target.value) })} className="h-6 w-14 rounded border border-slate-200 px-1 text-right outline-none" placeholder="0" /></td>
                        <td className="px-2 py-2"><input type="number" step="0.001" min={0} value={netWts[it.id] ?? ''} onChange={(e) => setNetWts({ ...netWts, [it.id]: Math.max(0, +e.target.value) })} className="h-6 w-14 rounded border border-slate-200 px-1 text-right outline-none" placeholder="0" /></td>
                        <td className="px-2 py-2"><input type="number" step="0.001" min={0} value={stoneWts[it.id] ?? ''} onChange={(e) => setStoneWts({ ...stoneWts, [it.id]: Math.max(0, +e.target.value) })} className="h-6 w-14 rounded border border-slate-200 px-1 text-right outline-none" placeholder="0" /></td>
                      </tr>
                    );
                  })}
                  {poItems.length === 0 && <tr><td colSpan={7}><EmptyState message="All items in this PO are fully received" /></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
              <p className="border-b border-slate-100 px-4 py-3 text-xs font-bold">GRN Details</p>
              <div className="space-y-3 p-4 text-[11px]">
                <div className="flex items-center justify-between rounded-md bg-slate-50 p-2 text-[10px]"><span className="text-slate-500">Total Received</span><b>{totalReceived} pcs</b></div>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Receiving / inspection notes..." className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-[10px] outline-none" rows={2} />
                {can('purchase.grn.approve') ? (
                  <button onClick={approve} disabled={busy || totalReceived === 0} className="w-full rounded-md bg-emerald-500 py-2.5 text-[11px] font-bold text-white hover:bg-emerald-600 disabled:opacity-50"><CheckCircle2 size={14} className="mr-1 inline"/>{busy ? 'Approving...' : 'Approve & Update Stock'}</button>
                ) : (
                  <button onClick={approve} disabled={busy || totalReceived === 0} className="w-full rounded-md bg-[#4714a1] py-2.5 text-[11px] font-bold text-white hover:bg-[#5419b5] disabled:opacity-50">Save GRN (Draft)</button>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
              <p className="border-b border-slate-100 px-4 py-3 text-xs font-bold">Inspection Checklist</p>
              <div className="space-y-1.5 p-3 text-[10px] text-slate-500">{['Weight Verification', 'Purity Check (92.5)', 'Hallmark Verification', 'Visual Inspection', 'Quantity Match'].map((c) => <div key={c} className="flex items-center gap-2"><CheckCircle2 size={12} className="text-emerald-500"/>{c}</div>)}</div>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-[#1d2945] px-4 py-3 text-xs font-semibold text-white shadow-xl">{toast}</div>}
    </div>
  );
}

// ---------------- GRN detail ----------------

function GRNDetail({ permissions, data, onBack, onRefresh }: { permissions: Permissions; data: GRNDetailData; onBack: () => void; onRefresh: (d: GRNDetailData) => void }) {
  const { grn, items } = data;
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const can = (perm: string) => permissions.includes('*') || permissions.includes(perm);
  const totalReceived = items.reduce((s, it) => s + it.received_qty, 0);

  async function approve() {
    setBusy(true);
    try {
      await api(`/api/grns/${grn.id}/approve`, { method: 'POST' });
      setToast('GRN approved — stock updated');
      onRefresh(await api<GRNDetailData>(`/api/grns/${grn.id}`));
    } catch (error) { setToast('Error: ' + (error instanceof Error ? error.message : 'Unable to approve GRN')); }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3"><button onClick={onBack} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">←</button><h2 className="text-base font-bold">{grn.grn_number}</h2><Badge color={statusColor(grn.status)}>{grn.status}</Badge></div>
      </div>
      <div className="grid gap-3 xl:grid-cols-[1fr_280px]">
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-4"><div><p className="text-sm font-bold">Goods Receipt Note</p><p className="text-[9px] text-slate-400">{grn.grn_date}</p></div><div className="text-right"><p className="text-[10px] font-bold">{grn.po_number ? `PO: ${grn.po_number}` : ''}</p></div></div>
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-[9px] uppercase text-slate-400"><tr>{['Item', 'Expected', 'Received', 'Gross Wt', 'Net Wt', 'Stone Wt'].map((h) => <th key={h} className="px-2 py-2 text-left font-bold">{h}</th>)}</tr></thead>
            <tbody>{items.map((it) => (<tr key={it.id} className="border-t border-slate-50"><td className="px-2 py-2 font-semibold">{it.name}<p className="text-[9px] text-slate-400">{it.sku}</p></td><td className="px-2 py-2">{it.expected_qty}</td><td className="px-2 py-2 font-bold text-emerald-600">{it.received_qty}</td><td className="px-2 py-2 text-slate-500">{it.gross_weight}g</td><td className="px-2 py-2 text-slate-500">{it.net_weight}g</td><td className="px-2 py-2 text-slate-500">{it.stone_weight}g</td></tr>))}</tbody>
          </table>
          <div className="mt-3 flex justify-end rounded-md bg-slate-50 p-2 text-[10px]"><span className="text-slate-500">Total received: <b className="text-slate-700">{totalReceived} pcs</b></span></div>
        </div>
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
            <p className="border-b border-slate-100 px-4 py-3 text-xs font-bold">Actions</p>
            <div className="grid grid-cols-1 gap-2 p-3">
              {grn.status === 'Draft' && can('purchase.grn.approve') && (
                <button onClick={approve} disabled={busy} className="flex items-center justify-center gap-1.5 rounded-md bg-emerald-500 py-2.5 text-[10px] font-bold text-white hover:bg-emerald-600 disabled:opacity-50"><CheckCircle2 size={13}/>{busy ? 'Approving...' : 'Approve & Update Stock'}</button>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
            <p className="border-b border-slate-100 px-4 py-3 text-xs font-bold">GRN Info</p>
            <div className="space-y-2 p-3 text-[10px]">
              {[['Supplier', grn.supplier_name || '—'], ['PO Reference', grn.po_number || '—'], ['Items', String(items.length)], ['Total Qty', String(totalReceived)], ['Approved', String(grn.approved_at || '').slice(0, 16) || '—']].map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-slate-500">{k}</span><b>{v}</b></div>)}
            </div>
          </div>
          {grn.notes && <div className="rounded-xl border border-slate-100 bg-white p-3 text-[10px] text-slate-500">{grn.notes}</div>}
        </div>
      </div>
      {toast && <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-[#1d2945] px-4 py-3 text-xs font-semibold text-white shadow-xl">{toast}</div>}
    </div>
  );
}
