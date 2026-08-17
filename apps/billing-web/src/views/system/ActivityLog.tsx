import { useEffect, useState } from 'react';
import { Activity, AlertCircle, CheckCircle, ChevronLeft, ChevronRight, Cpu, Download, Eye, Search, User, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge, EmptyState, Panel } from '@/components/ui';

type AuditLog = {
  id: string;
  user_name: string;
  module: string;
  action: string;
  record_id: string | null;
  record_type: string | null;
  status: string;
  previous_value: unknown;
  new_value: unknown;
  remarks: string | null;
  ip_address: string | null;
  device_info: string | null;
  created_at: string;
};

type Page = { items: AuditLog[]; total: number; page: number; limit: number };
const MODULES = ['All', 'Sales', 'Purchases', 'Inventory', 'Sync', 'Silver Rate', 'Accounts', 'Reports', 'System', 'Authentication'];
const STATUSES = ['All', 'Success', 'Failed', 'Warning'];
const ACTIONS = ['All', 'Created', 'Updated', 'Approved', 'Cancelled', 'Deleted', 'Login', 'Logout', 'Sync Failed', 'Permission Changed'];

function valueText(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function statusColor(status: string) { return status === 'Success' || status === 'Published' ? 'green' : status === 'Failed' ? 'red' : 'amber'; }

export default function ActivityLogView() {
  const [data, setData] = useState<Page>({ items: [], total: 0, page: 1, limit: 25 });
  const [search, setSearch] = useState('');
  const [module, setModule] = useState('All');
  const [action, setAction] = useState('All');
  const [user, setUser] = useState('');
  const [status, setStatus] = useState('All');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [recordId, setRecordId] = useState('');
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(page = 1) {
    try {
      const query = new URLSearchParams({ page: String(page), limit: '25' });
      if (search) query.set('search', search);
      if (module !== 'All') query.set('module', module);
      if (action !== 'All') query.set('action', action);
      if (user) query.set('user', user);
      if (status !== 'All') query.set('status', status);
      if (from) query.set('from', from);
      if (to) query.set('to', to);
      if (recordId) query.set('recordId', recordId);
      setData(await api<Page>(`/api/activity-logs?${query}`));
      setError(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load activity log'); }
  }

  useEffect(() => { load(); }, []);
  if (selected) return <ActivityDetail log={selected} onBack={() => setSelected(null)} />;

  const success = data.items.filter((log) => log.status === 'Success').length;
  const failed = data.items.filter((log) => log.status === 'Failed').length;
  const warnings = data.items.filter((log) => log.status === 'Warning').length;
  const totalPages = Math.max(1, Math.ceil(data.total / data.limit));

  return <div className="space-y-3">
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">{[["Total Activities", data.total, 'navy', Activity], ['Successful', success, 'green', CheckCircle], ['Failed', failed, 'red', XCircle], ['Warnings', warnings, 'orange', AlertCircle]].map(([label, value, color, Icon]) => { const I = Icon as typeof Activity; return <div key={label as string} className={`rounded-lg p-3 text-white shadow-sm bg-${color as string}`}><div className="mb-2 flex items-center justify-between"><span className="text-[9px] font-medium">{label as string}</span><I size={14} /></div><p className="text-sm font-bold">{value as number}</p></div>; })}</div>
    <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3"><div className="mb-3 flex items-center justify-between"><p className="text-sm font-bold">Activity Log</p><button className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"><Download size={14} /> Export</button></div><div className="flex flex-wrap items-center gap-2"><div className="flex h-8 items-center gap-2 rounded-md bg-slate-50 px-3 text-slate-400"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && load()} placeholder="Search activities..." className="w-44 bg-transparent text-xs outline-none" /></div><input value={user} onChange={(event) => setUser(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && load()} placeholder="User" className="h-8 w-24 rounded-md border border-slate-200 px-2 text-[11px] outline-none" /><input value={recordId} onChange={(event) => setRecordId(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && load()} placeholder="Record ID" className="h-8 w-24 rounded-md border border-slate-200 px-2 text-[11px] outline-none" /><select value={module} onChange={(event) => { setModule(event.target.value); }} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">{MODULES.map((item) => <option key={item}>{item}</option>)}</select><select value={action} onChange={(event) => setAction(event.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">{ACTIONS.map((item) => <option key={item}>{item}</option>)}</select><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">{STATUSES.map((item) => <option key={item}>{item}</option>)}</select><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[10px] outline-none" /><input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[10px] outline-none" /><button onClick={() => load()} className="h-8 rounded-md bg-[#4714a1] px-3 text-[11px] font-bold text-white hover:bg-[#5419b5]">Apply</button></div></div>
      {error && <p className="mx-4 mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-600">{error}</p>}
      <div className="overflow-x-auto"><table className="w-full text-[11px]"><thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400"><tr>{['Date & Time', 'User', 'Module', 'Action', 'Record', 'Status', 'Actions'].map((heading) => <th key={heading} className="px-3 py-2.5 text-left font-bold">{heading}</th>)}</tr></thead><tbody>{data.items.map((log) => <tr key={log.id} className="border-t border-slate-50 hover:bg-slate-50/50"><td className="px-3 py-2.5 text-slate-500">{new Date(log.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td><td className="px-3 py-2.5 font-bold">{log.user_name}</td><td className="px-3 py-2.5"><Badge color="slate">{log.module}</Badge></td><td className="px-3 py-2.5 text-slate-600">{log.action}</td><td className="px-3 py-2.5 text-slate-400">{log.record_id || '—'}</td><td className="px-3 py-2.5"><Badge color={statusColor(log.status)}>{log.status}</Badge></td><td className="px-3 py-2.5"><button onClick={() => setSelected(log)} className="grid h-6 w-6 place-items-center rounded bg-slate-100 text-slate-500 hover:bg-slate-200" title="View details"><Eye size={12} /></button></td></tr>)}</tbody></table>{data.items.length === 0 && <EmptyState message="No activities found" />}</div>
      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-[10px] text-slate-500"><span>{data.total ? `Showing ${(data.page - 1) * data.limit + 1}–${Math.min(data.page * data.limit, data.total)} of ${data.total}` : 'No records'}</span><div className="flex gap-1"><button disabled={data.page <= 1} onClick={() => load(data.page - 1)} className="grid h-7 w-7 place-items-center rounded border border-slate-200 disabled:opacity-40"><ChevronLeft size={13} /></button><button disabled={data.page >= totalPages} onClick={() => load(data.page + 1)} className="grid h-7 w-7 place-items-center rounded border border-slate-200 disabled:opacity-40"><ChevronRight size={13} /></button></div></div>
    </div>
  </div>;
}

function ActivityDetail({ log, onBack }: { log: AuditLog; onBack: () => void }) {
  return <div className="space-y-3"><div className="flex items-center gap-3"><button onClick={onBack} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"><ChevronLeft size={16} /></button><h2 className="text-base font-bold">{log.action}</h2><Badge color={statusColor(log.status)}>{log.status}</Badge></div><div className="grid gap-3 xl:grid-cols-2"><Panel title="Activity Information" icon={Activity}><div className="space-y-2 text-[11px]">{[['User', log.user_name], ['Date & Time', new Date(log.created_at).toLocaleString('en-IN')], ['Module', log.module], ['Action', log.action], ['Record ID', log.record_id || '—'], ['Record Type', log.record_type || '—'], ['Status', log.status]].map(([key, value]) => <div key={key} className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">{key}</span><b>{value}</b></div>)}</div></Panel><Panel title="Change Details" icon={User}><div className="space-y-3 text-[11px]"><div><p className="text-[9px] font-bold uppercase text-slate-400">Previous Value</p><pre className="mt-1 whitespace-pre-wrap rounded-md bg-rose-50 p-3 font-sans text-rose-700">{valueText(log.previous_value)}</pre></div><div><p className="text-[9px] font-bold uppercase text-slate-400">New Value</p><pre className="mt-1 whitespace-pre-wrap rounded-md bg-emerald-50 p-3 font-sans text-emerald-700">{valueText(log.new_value)}</pre></div><div><p className="text-[9px] font-bold uppercase text-slate-400">Remarks</p><div className="mt-1 rounded-md bg-slate-50 p-3 text-slate-600">{log.remarks || '—'}</div></div></div></Panel><Panel title="System Information" icon={Cpu}><div className="space-y-2 text-[11px]">{[['IP Address', log.ip_address || '—'], ['Device Info', log.device_info || '—']].map(([key, value]) => <div key={key} className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">{key}</span><b>{value}</b></div>)}</div></Panel></div></div>;
}
