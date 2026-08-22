import { useState } from 'react';
import { LogOut, Settings, Users } from 'lucide-react';
import type { ApiUser } from '@/lib/api';

export default function UserMenu({ user, onNavigate, onLogout }: { user: ApiUser; onNavigate: (view: string) => void; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const initials = user.name.split(' ').map((n) => n[0]).join('').slice(0, 2);
  const roleName = user.roles?.[0]?.name && user.roles[0].name !== user.name ? user.roles[0].name : 'Administrator';

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2.5 rounded-lg px-1 py-1 transition hover:bg-slate-50" aria-label="Account menu">
        <div className="hidden text-right sm:block">
          <p className="text-xs font-bold leading-tight">{user.name}</p>
          <p className="text-[9px] font-semibold text-slate-400">{roleName}</p>
        </div>
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#4714a1] text-xs font-bold text-white">{initials}</div>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-xl">
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#4714a1] text-sm font-bold text-white">{initials}</div>
              <div className="min-w-0">
                <p className="truncate text-xs font-bold">{user.name}</p>
                <p className="truncate text-[9px] font-semibold text-slate-400">{user.email || user.username}</p>
                <span className="mt-1 inline-block rounded-full bg-purple-50 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[#6f39bd]">{roleName}</span>
              </div>
            </div>
            <div className="py-1">
              <MenuItem icon={<Users size={14} />} label="Users & Roles" onClick={() => { setOpen(false); onNavigate('Users & Roles'); }} />
              <MenuItem icon={<Settings size={14} />} label="System Settings" onClick={() => { setOpen(false); onNavigate('Settings'); }} />
            </div>
            <div className="border-t border-slate-100 py-1">
              <button onClick={() => { setOpen(false); onLogout(); }} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[11px] font-semibold text-red-600 transition hover:bg-red-50">
                <LogOut size={14} /> Logout
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[11px] font-semibold text-slate-600 transition hover:bg-purple-50 hover:text-[#5419b5]">
      {icon} {label}
    </button>
  );
}
