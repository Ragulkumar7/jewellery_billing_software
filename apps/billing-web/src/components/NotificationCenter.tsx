import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { api } from '../lib/api';

export type NotificationCategory = 'critical' | 'warning' | 'info';

export type NotificationItem = {
  key: string;
  category: NotificationCategory;
  title: string;
  message: string;
  count?: number;
  actionPath?: string;
  updatedAt: string;
};

const READS_STORAGE_KEY = 'opal_line_notif_reads_v1';
const POLL_INTERVAL_MS = 60_000;

const CATEGORY_DOT: Record<NotificationCategory, string> = {
  critical: 'bg-red-500',
  warning: 'bg-orange-400',
  info: 'bg-violet-500',
};

type ReadsMap = Record<string, Record<string, string>>;

function loadReads(): ReadsMap {
  try {
    const raw = localStorage.getItem(READS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ReadsMap) : {};
  } catch {
    return {};
  }
}

function saveReads(reads: ReadsMap) {
  localStorage.setItem(READS_STORAGE_KEY, JSON.stringify(reads));
}

export function notificationSignature(item: NotificationItem): string {
  return `${item.message}|${item.updatedAt}`;
}

export function relativeTime(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function useNotifications(userId: string) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [readsVersion, setReadsVersion] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ notifications: NotificationItem[] }>('/api/notifications');
      setItems(data.notifications ?? []);
    } catch {
      // Transient (API cold start / logged out) — next poll or open retries.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const markAllRead = useCallback(() => {
    const reads = loadReads();
    const userReads = reads[userId] ?? {};
    for (const item of items) userReads[item.key] = notificationSignature(item);
    reads[userId] = userReads;
    saveReads(reads);
    setReadsVersion((v) => v + 1);
  }, [items, userId]);

  const markRead = useCallback((item: NotificationItem) => {
    const reads = loadReads();
    const userReads = reads[userId] ?? {};
    userReads[item.key] = notificationSignature(item);
    reads[userId] = userReads;
    saveReads(reads);
    setReadsVersion((v) => v + 1);
  }, [userId]);

  // Unread badge counts actionable categories only (critical + warning);
  // informational items appear in the center without inflating the count.
  const unreadKeys = useMemo(() => {
    void readsVersion;
    const reads = loadReads();
    const userReads = reads[userId] ?? {};
    return new Set(
      items
        .filter((item) => item.category !== 'info' && userReads[item.key] !== notificationSignature(item))
        .map((item) => item.key),
    );
  }, [items, userId, readsVersion]);

  return { items, refresh, markAllRead, markRead, unreadCount: unreadKeys.size };
}

export function NotificationRow({ item, onClick }: { item: NotificationItem; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-slate-50">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${CATEGORY_DOT[item.category]}`} />
      <span className="min-w-0 flex-1">
        <span className={`flex items-center justify-between gap-2 text-[11px] font-bold ${unreadColor(item.category)}`}>{item.title}</span>
        <span className="mt-0.5 block truncate text-[11px] text-slate-600">{item.message}</span>
        <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-wider text-slate-400">{relativeTime(item.updatedAt)}</span>
      </span>
    </button>
  );
}

function unreadColor(category: NotificationCategory): string {
  if (category === 'critical') return 'text-red-600';
  if (category === 'warning') return 'text-orange-500';
  return 'text-violet-600';
}

export default function NotificationCenter({ userId, onNavigate }: { userId: string; onNavigate: (view: string) => void }) {
  const { items, refresh, markAllRead, markRead, unreadCount } = useNotifications(userId);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  function toggle() {
    if (!open) void refresh();
    setOpen(!open);
  }

  function openItem(item: NotificationItem) {
    markRead(item);
    setOpen(false);
    onNavigate(item.actionPath || 'Notifications');
  }

  return (
    <div ref={containerRef} className="relative">
      <button onClick={toggle} aria-label="Notifications" className="relative grid h-8 w-8 place-items-center rounded-full text-slate-600 transition hover:bg-slate-100">
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="text-xs font-bold">Notifications</p>
              <button onClick={markAllRead} className="text-[10px] font-bold text-[#6f39bd] hover:text-[#5419b5]">Mark all read</button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0
                ? <p className="px-4 py-8 text-center text-[11px] text-slate-400">You're all caught up.</p>
                : items.map((item) => <NotificationRow key={item.key} item={item} onClick={() => openItem(item)} />)}
            </div>
            <button onClick={() => { setOpen(false); onNavigate('Notifications'); }} className="block w-full border-t border-slate-100 py-2.5 text-center text-[10px] font-bold text-[#6f39bd] transition hover:bg-purple-50">
              View All Notifications →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
