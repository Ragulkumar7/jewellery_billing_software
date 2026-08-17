import { useEffect, useMemo, useState } from 'react';
import { Building2, FileText, Percent, CreditCard, Package, Gem, RefreshCw, Bell, Save, Check, Loader2, AlertTriangle, History, ShieldCheck } from 'lucide-react';
import type { SystemSetting } from '@/lib/types';
import { api } from '@/lib/api';

const GROUPS = [
  { key: 'Business', label: 'Business Settings', icon: Building2, description: 'Business name, logo, address, contact, GST information' },
  { key: 'Invoice', label: 'Invoice Settings', icon: FileText, description: 'Invoice number format, starting number, date format, terms, print format' },
  { key: 'Tax', label: 'Tax Settings', icon: Percent, description: 'GST configuration, tax rates (CGST/SGST/IGST), inclusive/exclusive' },
  { key: 'Payment', label: 'Payment Settings', icon: CreditCard, description: 'Supported payment methods' },
  { key: 'Inventory', label: 'Inventory Settings', icon: Package, description: 'Stock rules, low stock threshold, adjustment rules, units' },
  { key: 'Silver Rate', label: 'Silver Rate Settings', icon: Gem, description: 'Default purity, rate unit, pricing calculation, rounding, approval, Shopify publishing' },
  { key: 'Shopify', label: 'Shopify Settings', icon: RefreshCw, description: 'Connection status, sync preferences, product/inventory/order/customer/price sync' },
  { key: 'Notifications', label: 'Notification Settings', icon: Bell, description: 'Low stock, sync failures, payment due, delivery, approvals, silver rate' },
];

export default function Settings({ permissions = [] }: { permissions?: string[] }) {
  const canView = permissions.includes('*') || permissions.includes('system.settings.view');
  const canEdit = permissions.includes('*') || permissions.includes('system.settings.edit');
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [activeGroup, setActiveGroup] = useState('Business');
  const [editValues, setEditValues] = useState<Record<string, unknown>>({});
  const [originalValues, setOriginalValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  useEffect(() => { if (canView) load(); }, [canView]);
  async function load() {
    try {
      const data = await api<SystemSetting[]>('/api/settings');
      setSettings(data);
      const vals: Record<string, unknown> = {};
      const orig: Record<string, unknown> = {};
      data.forEach((s) => { vals[s.setting_key] = s.setting_value.value; orig[s.setting_key] = s.setting_value.value; });
      setEditValues(vals);
      setOriginalValues(orig);
      setLoadError(null);
    } catch (e) { setLoadError(e instanceof Error ? e.message : 'Unable to load settings'); }
  }

  const groupSettings = useMemo(() => settings.filter((s) => s.setting_group === activeGroup), [settings, activeGroup]);
  const dirtyCount = useMemo(() => groupSettings.filter((s) => JSON.stringify(editValues[s.setting_key]) !== JSON.stringify(originalValues[s.setting_key])).length, [groupSettings, editValues, originalValues]);

  async function save() {
    if (!canEdit || dirtyCount === 0) return;
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, { value: unknown }> = {};
      groupSettings.forEach((s) => { payload[s.setting_key] = { value: editValues[s.setting_key] }; });
      const updated = await api<{ setting_key: string; setting_value: { value: unknown }; updated_at: string }[]>('/api/settings', { method: 'PUT', body: JSON.stringify(payload) });
      const newOrig = { ...originalValues };
      updated.forEach((u) => { newOrig[u.setting_key] = u.setting_value.value; });
      setOriginalValues(newOrig);
      setLastSavedAt(new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save settings'); } finally { setSaving(false); }
  }

  function resetGroup() {
    const next = { ...editValues };
    groupSettings.forEach((s) => { next[s.setting_key] = originalValues[s.setting_key]; });
    setEditValues(next);
  }

  if (!canView) return <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center"><ShieldCheck size={30} className="mx-auto text-amber-600" /><h2 className="mt-3 text-sm font-bold text-amber-900">Settings access required</h2><p className="mx-auto mt-1 max-w-md text-[11px] text-amber-800">You do not have permission to view system settings. Contact your administrator.</p></div>;

  const activeGroupInfo = GROUPS.find((g) => g.key === activeGroup)!;
  const ActiveIcon = activeGroupInfo.icon;

  return (
    <div className="grid gap-3 xl:grid-cols-[220px_1fr]">
      <div className="space-y-1">
        {GROUPS.map((g) => {
          const I = g.icon;
          const count = settings.filter((s) => s.setting_group === g.key).length;
          return <button key={g.key} onClick={() => setActiveGroup(g.key)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[10px] font-bold transition ${activeGroup === g.key ? 'bg-[#4714a1] text-white' : 'border border-slate-100 bg-white text-slate-600 hover:bg-slate-50'}`}><I size={14} />{g.label}<span className={`ml-auto rounded px-1.5 py-0.5 text-[8px] font-bold ${activeGroup === g.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400'}`}>{count}</span></button>;
        })}
      </div>

      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-md bg-purple-50 text-[#6f39bd]"><ActiveIcon size={14} /></span><div><p className="text-sm font-bold">{activeGroupInfo.label}</p><p className="text-[10px] text-slate-400">{activeGroupInfo.description}</p></div></div>
        </div>
        {loadError ? <div className="m-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-600">{loadError}. Check that you are signed in and the API is running.</div> : (
          <div className="space-y-4 p-4">
            {groupSettings.length === 0 ? <p className="py-8 text-center text-[11px] text-slate-400">No settings in this group.</p> : groupSettings.map((s) => <SettingField key={s.setting_key} setting={s} value={editValues[s.setting_key]} disabled={!canEdit} onChange={(v) => setEditValues({ ...editValues, [s.setting_key]: v })} />)}
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
              <button onClick={save} disabled={!canEdit || saving || dirtyCount === 0} className="flex items-center gap-2 rounded-md bg-[#4714a1] px-4 py-2.5 text-[11px] font-bold text-white hover:bg-[#5419b5] disabled:opacity-40">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {saving ? 'Saving...' : dirtyCount > 0 ? `Save Changes (${dirtyCount})` : 'Save Changes'}
              </button>
              {dirtyCount > 0 && <button onClick={resetGroup} className="rounded-md border border-slate-200 px-3 py-2.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50">Discard Changes</button>}
              {saved && <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600"><Check size={14} /> Saved successfully</span>}
              {error && <span className="flex items-center gap-1 text-[10px] font-bold text-red-500"><AlertTriangle size={14} /> {error}</span>}
              {lastSavedAt && <span className="ml-auto flex items-center gap-1 text-[9px] text-slate-400"><History size={11} /> Last saved {lastSavedAt}</span>}
            </div>
            {!canEdit && <p className="text-[9px] text-slate-400">You have view-only access. Contact an administrator to edit settings.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function SettingField({ setting, value, onChange, disabled }: { setting: SystemSetting; value: unknown; onChange: (v: unknown) => void; disabled?: boolean }) {
  const label = setting.setting_key.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const isBoolean = typeof value === 'boolean';
  const isArray = Array.isArray(value);
  const isNumber = typeof value === 'number';

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1"><p className="text-[11px] font-bold">{label}</p><p className="text-[9px] text-slate-400">{setting.description}</p></div>
      <div className="w-64">
        {isBoolean ? (
          <button onClick={() => !disabled && onChange(!value)} disabled={disabled} className={`flex h-8 w-full items-center justify-between rounded-md border px-3 text-[11px] font-bold ${value ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'border-slate-200 bg-slate-50 text-slate-500'} ${disabled ? 'opacity-60' : ''}`}>
            <span>{value ? 'Enabled' : 'Disabled'}</span>
            <span className={`relative h-4 w-7 rounded-full transition ${value ? 'bg-emerald-500' : 'bg-slate-300'}`}><span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${value ? 'left-3.5' : 'left-0.5'}`} /></span>
          </button>
        ) : isArray ? (
          <div className="flex flex-wrap gap-1">{(value as string[]).map((item) => <span key={item} className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{item}</span>)}</div>
        ) : isNumber ? (
          <input type="number" value={value as number} disabled={disabled} onChange={(e) => onChange(+e.target.value)} className="h-8 w-full rounded-md border border-slate-200 px-3 text-[11px] font-bold outline-none disabled:opacity-60" />
        ) : (
          <input value={String(value || '')} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="h-8 w-full rounded-md border border-slate-200 px-3 text-[11px] outline-none disabled:opacity-60" />
        )}
      </div>
    </div>
  );
}