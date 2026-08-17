import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

export function Panel({ title, icon: Icon, children, action }: { title: string; icon: typeof ChevronRight; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-xs font-bold">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-purple-50 text-[#6f39bd]"><Icon size={13} /></span>
          {title}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Footer({ text, onClick }: { text: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="mt-4 -mx-4 -mb-4 flex w-[calc(100%+2rem)] items-center justify-center gap-2 border-t border-slate-100 py-3 text-[10px] font-bold text-[#6f39bd] hover:bg-purple-50">
      {text}<ChevronRight size={13} />
    </button>
  );
}

export function Badge({ children, color = 'slate' }: { children: ReactNode; color?: 'slate' | 'green' | 'amber' | 'red' | 'blue' | 'violet' | 'cyan' | 'orange' }) {
  const colors: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-600',
    green: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-orange-100 text-orange-700',
    red: 'bg-red-100 text-red-600',
    blue: 'bg-blue-100 text-blue-700',
    violet: 'bg-purple-100 text-[#6f39bd]',
    cyan: 'bg-cyan-100 text-cyan-700',
    orange: 'bg-orange-100 text-orange-700',
  };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[9px] font-bold ${colors[color]}`}>{children}</span>;
}

export function statusColor(status: string): 'slate' | 'green' | 'amber' | 'red' | 'blue' | 'violet' {
  const s = status.toLowerCase();
  if (['paid', 'approved', 'processed', 'closed', 'completed', 'fully received', 'sent'].includes(s)) return 'green';
  if (['draft', 'pending approval', 'pending', 'held', 'unpaid'].includes(s)) return 'amber';
  if (['overdue', 'cancelled', 'expired'].includes(s)) return 'red';
  if (['partially paid', 'partial', 'resumed', 'partially received'].includes(s)) return 'blue';
  return 'slate';
}

export function EmptyState({ message }: { message: string }) {
  return <div className="grid place-items-center py-10 text-center text-xs text-slate-400">{message}</div>;
}
