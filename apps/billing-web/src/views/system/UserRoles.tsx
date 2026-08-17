import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Eye, X, ShieldCheck, UserCog, CheckCircle, XCircle, KeyRound, Download, ChevronDown, ChevronUp } from 'lucide-react';
import type { SystemUser, SystemRole } from '@/lib/types';
import { Badge, EmptyState, Panel } from '@/components/ui';
import { api } from '@/lib/api';

export default function UserRoles({ permissions = [] }: { permissions?: string[] }) {
  const canManageUsers = permissions.includes('*') || permissions.includes('system.users.create');
  const canViewUsers = permissions.includes('*') || permissions.includes('system.users.view');
  const canViewRoles = permissions.includes('*') || permissions.includes('system.roles.view');
  const [tab, setTab] = useState<'users' | 'roles'>('users');
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [roles, setRoles] = useState<SystemRole[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showAdd, setShowAdd] = useState(false);
  const [selectedUser, setSelectedUser] = useState<SystemUser | null>(null);
  const [selectedRole, setSelectedRole] = useState<SystemRole | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => { if (canViewUsers || canViewRoles) load(); }, [canViewUsers, canViewRoles]);
  async function load() {
    try {
      const [nextUsers, nextRoles] = await Promise.all([api<SystemUser[]>('/api/users'), api<SystemRole[]>('/api/roles')]);
      setUsers(nextUsers);
      setRoles(nextRoles);
      setLoadError(null);
    } catch (error) { setLoadError(error instanceof Error ? error.message : 'Unable to load users and roles'); }
  }

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter((u) => {
      if (q && !u.name.toLowerCase().includes(q) && !u.username.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
      if (roleFilter !== 'All' && u.role !== roleFilter) return false;
      if (statusFilter !== 'All' && u.status !== statusFilter) return false;
      return true;
    });
  }, [users, search, roleFilter, statusFilter]);

  if (selectedUser) return <UserDetail user={selectedUser} role={roles.find((r) => r.name === selectedUser.role)} onBack={() => setSelectedUser(null)} onRefresh={load} />;
  if (selectedRole) return <RoleDetail role={selectedRole} onBack={() => setSelectedRole(null)} />;

  if (!canViewUsers && !canViewRoles) return <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center"><ShieldCheck size={30} className="mx-auto text-amber-600" /><h2 className="mt-3 text-sm font-bold text-amber-900">Master Admin access required</h2><p className="mx-auto mt-1 max-w-md text-[11px] text-amber-800">The Manager role is intentionally restricted from user, role, and permission administration. Sign in as Master Admin to assign roles.</p></div>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        <button onClick={() => setTab('users')} className={`rounded-md px-3 py-1.5 text-[10px] font-bold ${tab === 'users' ? 'bg-[#4714a1] text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>Users</button>
        <button onClick={() => setTab('roles')} className={`rounded-md px-3 py-1.5 text-[10px] font-bold ${tab === 'roles' ? 'bg-[#4714a1] text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>Roles & Permissions</button>
        {tab === 'users' && canManageUsers && <button onClick={() => setShowAdd(true)} className="ml-auto flex h-8 items-center gap-1.5 rounded-md bg-[#4714a1] px-3 text-[11px] font-bold text-white hover:bg-[#5419b5]"><Plus size={14} /> Add User</button>}
        {tab === 'roles' && <button className="ml-auto flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"><Download size={14} /> Export Roles</button>}
      </div>
      {loadError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[10px] font-semibold text-red-600">{loadError}. Check that you are signed in and the API is running.</div>}

      {tab === 'users' && (
        <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
            <div className="flex h-8 items-center gap-2 rounded-md bg-slate-50 px-3 text-slate-400"><Search size={14} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, username, email..." className="w-40 bg-transparent text-xs outline-none" /></div>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none"><option>All</option>{roles.map((r) => <option key={r.id}>{r.name}</option>)}</select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 rounded-md border border-slate-200 px-2 text-[11px] outline-none">{['All', 'Active', 'Inactive'].map((s) => <option key={s}>{s}</option>)}</select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400"><tr>{['Name', 'Username', 'Email', 'Role', 'Status', 'Last Login', 'Created', 'Actions'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-bold">{h}</th>)}</tr></thead>
              <tbody>
                {filteredUsers.map((u) => <tr key={u.id} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="px-3 py-2.5 font-bold">{u.name}</td>
                  <td className="px-3 py-2.5 text-slate-500">{u.username}</td>
                  <td className="px-3 py-2.5 text-slate-500">{u.email}</td>
                  <td className="px-3 py-2.5"><Badge color="violet">{u.role}</Badge></td>
                  <td className="px-3 py-2.5"><Badge color={u.status === 'Active' ? 'green' : 'red'}>{u.status}</Badge></td>
                  <td className="px-3 py-2.5 text-slate-400">{u.last_login ? new Date(u.last_login).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td className="px-3 py-2.5 text-slate-400">{new Date(u.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td className="px-3 py-2.5"><div className="flex items-center gap-1">
                    <button onClick={() => setSelectedUser(u)} className="grid h-6 w-6 place-items-center rounded bg-slate-100 text-slate-500 hover:bg-slate-200" title="View"><Eye size={12} /></button>
                    <button className="grid h-6 w-6 place-items-center rounded bg-slate-100 text-slate-500 hover:bg-slate-200" title="Edit"><UserCog size={12} /></button>
                    <button className="grid h-6 w-6 place-items-center rounded bg-slate-100 text-slate-500 hover:bg-slate-200" title="Reset Access"><KeyRound size={12} /></button>
                  </div></td>
                </tr>)}
              </tbody>
            </table>
            {filteredUsers.length === 0 && <EmptyState message="No users found" />}
          </div>
        </div>
      )}

      {tab === 'roles' && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {roles.map((r) => {
            const userCount = users.filter((u) => u.role === r.name).length;
            const moduleCount = Object.keys(r.permissions).length;
            const isFullAccess = !!r.permissions.all;
            return <div key={r.id} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><span className={`grid h-8 w-8 place-items-center rounded-lg ${r.is_system ? 'bg-purple-50 text-[#6f39bd]' : 'bg-emerald-50 text-emerald-600'}`}><ShieldCheck size={16} /></span><div><p className="text-xs font-bold">{r.name}</p><p className="text-[9px] text-slate-400">{r.is_system ? 'System Role' : 'Custom Role'}</p></div></div>
                <Badge color="slate">{userCount} users</Badge>
              </div>
              <p className="mt-3 text-[10px] text-slate-500">{r.description}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {isFullAccess ? <Badge color="violet">Full System Access</Badge> : Object.keys(r.permissions).map((m) => <Badge key={m} color="slate">{m}</Badge>)}
              </div>
              <div className="mt-3 border-t border-slate-50 pt-3 text-[9px] text-slate-400">{isFullAccess ? 'All permissions' : `${moduleCount} modules · ${Object.values(r.permissions).reduce((s, perms) => s + perms.length, 0)} permissions`}</div>
              <button onClick={() => setSelectedRole(r)} className="mt-3 w-full rounded-md border border-slate-200 py-2 text-[10px] font-bold text-slate-600 hover:bg-slate-50">View Permissions</button>
            </div>;
          })}
        </div>
      )}

      {showAdd && <AddUserModal roles={roles} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

function UserDetail({ user, role, onBack, onRefresh }: { user: SystemUser; role: SystemRole | undefined; onBack: () => void; onRefresh: () => void }) {
  const [status, setStatus] = useState(user.status);
  async function toggleStatus() {
    const newStatus = status === 'Active' ? 'Inactive' : 'Active';
    await api(`/api/users/${user.id}/${newStatus === 'Active' ? 'activate' : 'deactivate'}`, { method: 'POST' });
    setStatus(newStatus);
    onRefresh();
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">←</button>
        <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#4714a1] text-sm font-bold text-white">{user.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}</div>
        <div><h2 className="text-base font-bold">{user.name}</h2><p className="text-[10px] text-slate-400">{user.email}</p></div>
        <Badge color={status === 'Active' ? 'green' : 'red'}>{status}</Badge>
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        <Panel title="User Information" icon={UserCog}>
          <div className="space-y-2 text-[11px]">
            {[['Name', user.name], ['Username', user.username], ['Email', user.email], ['Role', user.role], ['Status', status], ['Last Login', user.last_login ? new Date(user.last_login).toLocaleString('en-IN') : '—'], ['Created', new Date(user.created_at).toLocaleDateString('en-IN')]].map(([k, v]) => <div key={k} className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">{k}</span><b>{v}</b></div>)}
          </div>
        </Panel>
        <Panel title="Role & Permissions" icon={ShieldCheck}>
          {role ? <div className="space-y-2 text-[11px]">
            <div className="flex justify-between border-b border-slate-50 pb-1.5"><span className="text-slate-500">Role</span><b>{role.name}</b></div>
            <p className="text-[10px] text-slate-500">{role.description}</p>
            <div className="mt-2 space-y-1">
              {role.permissions.all ? <Badge color="violet">Full System Access</Badge> : Object.entries(role.permissions).map(([mod, perms]) => <div key={mod} className="rounded-md bg-slate-50 p-2"><p className="text-[10px] font-bold">{mod}</p><div className="mt-1 flex flex-wrap gap-1">{perms.map((p) => <Badge key={p} color="slate">{p}</Badge>)}</div></div>)}
            </div>
          </div> : <EmptyState message="Role not found" />}
        </Panel>
        <Panel title="Actions" icon={UserCog}>
          <div className="space-y-2">
            <button onClick={toggleStatus} className={`flex w-full items-center justify-center gap-2 rounded-md py-2.5 text-[10px] font-bold ${status === 'Active' ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}>{status === 'Active' ? <><XCircle size={14} /> Deactivate User</> : <><CheckCircle size={14} /> Activate User</>}</button>
            <button className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 py-2.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50"><KeyRound size={14} /> Reset Access</button>
            <button className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 py-2.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50"><UserCog size={14} /> Edit User</button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function RoleDetail({ role, onBack }: { role: SystemRole; onBack: () => void }) {
  const isFullAccess = !!role.permissions.all;
  const modules = isFullAccess ? ['All Modules'] : Object.keys(role.permissions);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">←</button>
        <h2 className="text-base font-bold">{role.name}</h2>
        {role.is_system && <Badge color="violet">System Role</Badge>}
      </div>
      <Panel title="Role Description" icon={ShieldCheck}>
        <p className="text-[11px] text-slate-600">{role.description}</p>
      </Panel>
      <Panel title="Permission Matrix" icon={ShieldCheck}>
        {isFullAccess ? <div className="py-4 text-center"><CheckCircle size={32} className="mx-auto text-emerald-500" /><p className="mt-2 text-sm font-bold text-emerald-600">Full System Access</p><p className="text-[10px] text-slate-400">This role has access to all modules and all actions.</p></div> : (
          <div className="space-y-2">
            {Object.entries(role.permissions).map(([mod, perms]) => (
              <div key={mod} className="rounded-lg border border-slate-100 p-3">
                <p className="text-[11px] font-bold">{mod}</p>
                <div className="mt-2 flex flex-wrap gap-1">{perms.map((p) => <Badge key={p} color={p === 'view' ? 'blue' : p === 'create' ? 'green' : p === 'edit' ? 'amber' : p === 'delete' ? 'red' : 'violet'}>{p}</Badge>)}</div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function AddUserModal({ roles, onClose, onSaved }: { roles: SystemRole[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '', roleId: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [roleOpen, setRoleOpen] = useState(false);

  async function save() {
    if (!form.name || !form.username || !form.email || !form.password || !form.roleId) { setErr('All fields are required'); return; }
    if (form.password.length < 12) { setErr('Password must contain at least 12 characters'); return; }
    setSaving(true);
    try { const [firstName, ...last] = form.name.trim().split(/\s+/); await api('/api/users', { method: 'POST', body: JSON.stringify({ firstName, lastName: last.join(' '), username: form.username, email: form.email, password: form.password, roleId: form.roleId }) }); onSaved(); } catch (error) { setErr(error instanceof Error ? error.message : 'Unable to create user'); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><p className="text-sm font-bold">Add New User</p><button onClick={onClose}><X size={16} /></button></div>
        <div className="space-y-3">
          <div><label className="text-[9px] font-bold uppercase text-slate-400">Full Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-[11px] outline-none" /></div>
          <div><label className="text-[9px] font-bold uppercase text-slate-400">Username</label><input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-[11px] outline-none" /></div>
          <div><label className="text-[9px] font-bold uppercase text-slate-400">Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-[11px] outline-none" /></div>
          <div><label className="text-[9px] font-bold uppercase text-slate-400">Temporary Password</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-[11px] outline-none" placeholder="At least 12 characters" /></div>
          <div className="relative">
            <label className="text-[9px] font-bold uppercase text-slate-400">Role</label>
            <button type="button" aria-haspopup="listbox" aria-expanded={roleOpen} onClick={() => setRoleOpen((open) => !open)} className="mt-1 flex h-11 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 text-left text-[11px] outline-none transition hover:border-[#b99be8] focus:border-[#6f39bd] focus:ring-2 focus:ring-purple-100">
              <span className={form.roleId ? 'font-medium text-slate-700' : 'text-slate-400'}>{roles.find((role) => role.id === form.roleId)?.name || 'Select Role'}</span>
              {roleOpen ? <ChevronUp size={15} className="text-slate-500" /> : <ChevronDown size={15} className="text-slate-500" />}
            </button>
            {roleOpen && <div role="listbox" className="absolute bottom-full left-0 z-[70] mb-1 max-h-56 w-full overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-xl">
              {roles.length === 0 ? <p className="px-3 py-3 text-center text-[10px] text-slate-400">No roles loaded. Refresh after signing in as Master Admin.</p> : roles.map((role) => <button type="button" role="option" aria-selected={form.roleId === role.id} key={role.id} onClick={() => { setForm({ ...form, roleId: role.id }); setRoleOpen(false); }} className={`block min-h-10 w-full rounded px-3 py-2 text-left text-[11px] transition ${form.roleId === role.id ? 'bg-purple-50 font-bold text-[#4714a1]' : 'text-slate-700 hover:bg-slate-50'}`}>{role.name}</button>)}
            </div>}
          </div>
          {err && <p className="text-[10px] font-semibold text-red-500">{err}</p>}
          <button onClick={save} disabled={saving} className="w-full rounded-md bg-[#4714a1] py-2.5 text-[11px] font-bold text-white hover:bg-[#5419b5] disabled:opacity-50">{saving ? 'Saving...' : 'Add User'}</button>
        </div>
      </div>
    </div>
  );
}
