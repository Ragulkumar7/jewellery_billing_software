import { useEffect, useState } from 'react';
import { Search, FileText, ArrowDownLeft, ArrowUpRight, TrendingUp, Download, Eye, X, ExternalLink } from 'lucide-react';
import { inr } from '@/lib/supabase';
import { Badge, EmptyState, Panel } from '@/components/ui';
import { api } from '@/lib/api';

type Permissions = string[];

type LedgerEntry = {
  source_id: string;
  tx_type: string;
  tx_number: string;
  entry_date: string;
  party: string | null;
  reference: string | null;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  created_at: string;
};

const TYPE_TARGETS: Record<string, string> = {
  'Sales Invoice': 'Sales Invoices',
  'Purchase Invoice': 'Purchase Invoices',
  'Purchase Return': 'Purchase Returns',
  'Expense': 'Expenses',
};

const PAYMENT_TYPES = ['Customer Payment', 'Invoice Payment', 'Advance Payment', 'Other Receipt', 'Supplier Payment', 'Expense Payment', 'Refund'];

export default function Ledger({ permissions, onNavigate }: { permissions: Permissions; onNavigate: (v: string) => void }) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selected, setSelected] = useState<LedgerEntry | null>(null);

  const can = (perm: string) => permissions.includes('*') || permissions.includes(perm);

  async function load() {
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (search) params.set('q', search);
      if (typeFilter !== 'All') params.set('type', typeFilter);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      setEntries(await api<LedgerEntry[]>(`/api/accounts/ledger?${params.toString()}`));
    } catch { setEntries([]); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [search, typeFilter, fromDate, toDate]);

  const filtered = entries;
  const totalDebit = filtered.reduce((s, e) => s + e.debit, 0);
  const totalCredit = filtered.reduce((s, e) => s + e.credit, 0);
  const netBalance = totalCredit - totalDebit;

  const txTypes = ['All', 'Sales Invoice', 'Purchase Invoice', 'Expense', 'Purchase Return', ...PAYMENT_TYPES];

  if (selected) return <LedgerDetail entry={selected} onBack={() => setSelected(null)} onNavigate={onNavigate} />;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-4">
        {[
          ['Total Debit', inr(totalDebit), 'rose', ArrowUpRight],
          ['Total Credit', inr(totalCredit), 'green', ArrowDownLeft],
          ['Net Balance', inr(netBalance), 'blue', TrendingUp],
          ['Total Transactions', String(filtered.length), 'navy', FileText],
        ].map(([label, val, color, Icon]) => {
          const I = Icon as typeof FileText;
          return <div key={label as string} className={`rounded-lg p-3 text-white shadow-sm bg-${color as string}`}><div className="mb-2 flex items-center justify-between"><span className="text-[9px] font-medium">{label as string}</span><I size={14} /></div><p className="text-sm font-bold">{val as string}</p></div>;
        })}
      </div>

      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-bold">Ledger</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-8 items-center gap-2 rounded-md bg-slate-50 px-3 text-slate-400"><Search size={14} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tx, party..." className="w-36 bg-transparent text-xs outline-none" /></div>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">
              {txTypes.map((t) => <option key={t}>{t}</option>)}
            </select>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[10px] outline-none" />
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[10px] outline-none" />
            {can('accounts.ledger.export') && <button onClick={exportCsv} className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"><Download size={14} /> Export</button>}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400">
              <tr>{['Date', 'Tx Number', 'Type', 'Description', 'Party', 'Debit', 'Credit', 'Balance', 'Reference', 'Actions'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.source_id + e.tx_number} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="px-3 py-2.5 text-slate-500">{e.entry_date}</td>
                  <td className="px-3 py-2.5 font-bold text-[#5419b5]">{e.tx_number}</td>
                  <td className="px-3 py-2.5"><Badge color="slate">{e.tx_type}</Badge></td>
                  <td className="px-3 py-2.5 text-slate-500 max-w-[200px] truncate">{e.description}</td>
                  <td className="px-3 py-2.5 text-slate-500">{e.party || '—'}</td>
                  <td className="px-3 py-2.5 font-bold text-red-500">{e.debit > 0 ? inr(e.debit) : '—'}</td>
                  <td className="px-3 py-2.5 font-bold text-emerald-600">{e.credit > 0 ? inr(e.credit) : '—'}</td>
                  <td className="px-3 py-2.5 font-bold">{inr(e.balance)}</td>
                  <td className="px-3 py-2.5 text-slate-400">{e.reference || '—'}</td>
                  <td className="px-3 py-2.5"><button onClick={() => setSelected(e)} className="grid h-6 w-6 place-items-center rounded bg-slate-100 text-slate-500 hover:bg-slate-200"><Eye size={12} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <EmptyState message="No transactions found" />}
        </div>
      </div>
    </div>
  );

  function exportCsv() {
    const header = ['Date', 'Tx Number', 'Type', 'Description', 'Party', 'Debit', 'Credit', 'Balance', 'Reference'];
    const lines = filtered.map((e) => [e.entry_date, e.tx_number, e.tx_type, e.description, e.party || '', e.debit, e.credit, e.balance, e.reference || ''].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ledger.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
}

function LedgerDetail({ entry, onBack, onNavigate }: { entry: LedgerEntry; onBack: () => void; onNavigate: (v: string) => void }) {
  const isPayment = PAYMENT_TYPES.includes(entry.tx_type);
  const target = TYPE_TARGETS[entry.tx_type] || (isPayment ? 'Payments' : null);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">←</button>
        <h2 className="text-base font-bold">{entry.tx_number}</h2>
        <Badge color="slate">{entry.tx_type}</Badge>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Panel title="Transaction" icon={FileText}>
          <div className="space-y-2 text-[11px]">
            {[['Date', entry.entry_date], ['Tx Number', entry.tx_number], ['Type', entry.tx_type], ['Description', entry.description], ['Reference', entry.reference || '—']].map(([k, v]) => <div key={k} className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">{k}</span><b className="text-right">{v}</b></div>)}
          </div>
        </Panel>

        <Panel title="Source Document" icon={FileText}>
          <div className="space-y-2 text-[11px]">
            <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">Document Type</span><b>{entry.tx_type}</b></div>
            <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">Document Number</span><b>{entry.tx_number}</b></div>
            <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">Date</span><b>{entry.entry_date}</b></div>
            {target && (
              <button onClick={() => onNavigate(target)} className="flex w-full items-center justify-center gap-1.5 rounded-md bg-[#4714a1] py-2 text-[10px] font-bold text-white hover:bg-[#5419b5]"><ExternalLink size={12} /> Open Original Transaction</button>
            )}
          </div>
        </Panel>

        <Panel title="Amount" icon={TrendingUp}>
          <div className="space-y-2 text-[11px]">
            <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">Debit</span><b className="text-red-500">{entry.debit > 0 ? inr(entry.debit) : '—'}</b></div>
            <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">Credit</span><b className="text-emerald-600">{entry.credit > 0 ? inr(entry.credit) : '—'}</b></div>
            <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">Related Party</span><b>{entry.party || '—'}</b></div>
            <div className="flex justify-between pt-2"><span className="font-bold">Running Balance</span><b className={entry.balance >= 0 ? 'text-emerald-600' : 'text-red-500'}>{inr(entry.balance)}</b></div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
