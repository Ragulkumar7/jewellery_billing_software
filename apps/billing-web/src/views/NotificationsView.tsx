import { Bell } from 'lucide-react';
import { NotificationRow, useNotifications } from '@/components/NotificationCenter';
import { EmptyState, Panel } from '@/components/ui';

const SECTIONS = [
  { category: 'critical' as const, title: 'Critical', hint: 'Needs immediate attention' },
  { category: 'warning' as const, title: 'Warning', hint: 'Action recommended soon' },
  { category: 'info' as const, title: 'Information', hint: 'Worth knowing' },
];

export default function NotificationsView({ userId }: { userId?: string }) {
  const { items, markAllRead } = useNotifications(userId ?? '');

  return (
    <div className="space-y-3">
      <Panel title="All Notifications" icon={Bell}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[10px] font-semibold text-slate-400">Live system events requiring awareness or action — distinct from the Activity Log, which records everything.</p>
          {items.length > 0 && (
            <button onClick={markAllRead} className="shrink-0 rounded-md border border-slate-200 px-2.5 py-1 text-[10px] font-bold text-[#6f39bd] transition hover:border-[#cab4f3] hover:bg-purple-50">Mark all read</button>
          )}
        </div>
        {items.length === 0 ? (
          <EmptyState message="No notifications right now." />
        ) : (
          <div className="space-y-5 pt-2">
            {SECTIONS.map(({ category, title, hint }) => {
              const sectionItems = items.filter((item) => item.category === category);
              if (sectionItems.length === 0) return null;
              return (
                <section key={category}>
                  <header className="mb-1.5 flex items-baseline gap-2">
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</h3>
                    <span className="text-[9px] text-slate-400">{hint}</span>
                  </header>
                  <div className="overflow-hidden rounded-lg border border-slate-100">
                    {sectionItems.map((item) => <NotificationRow key={item.key} item={item} />)}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
