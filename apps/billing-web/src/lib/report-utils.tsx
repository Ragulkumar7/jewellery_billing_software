import type { ReactNode } from 'react';

export type DatePreset =
  | 'Today' | 'Yesterday' | 'This Week' | 'Last Week'
  | 'This Month' | 'Last Month' | 'This Quarter' | 'Last Quarter'
  | 'This Year' | 'Last Year' | 'Custom';

export const DATE_PRESETS: { label: string; value: DatePreset }[] = [
  { label: 'Today', value: 'Today' },
  { label: 'Yesterday', value: 'Yesterday' },
  { label: 'This Week', value: 'This Week' },
  { label: 'Last Week', value: 'Last Week' },
  { label: 'This Month', value: 'This Month' },
  { label: 'Last Month', value: 'Last Month' },
  { label: 'This Quarter', value: 'This Quarter' },
  { label: 'Last Quarter', value: 'Last Quarter' },
  { label: 'This Year', value: 'This Year' },
  { label: 'Last Year', value: 'Last Year' },
  { label: 'Custom', value: 'Custom' },
];

export function presetRange(preset: DatePreset): { from: string; to: string } {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  let toDate = new Date(today);
  let fromDate = new Date(today);

  switch (preset) {
    case 'Today':
      return { from: todayStr, to: todayStr };
    case 'Yesterday':
      toDate.setDate(today.getDate() - 1);
      return { from: toDate.toISOString().slice(0, 10), to: toDate.toISOString().slice(0, 10) };
    case 'This Week':
      fromDate.setDate(today.getDate() - today.getDay());
      return { from: fromDate.toISOString().slice(0, 10), to: todayStr };
    case 'Last Week':
      toDate.setDate(today.getDate() - today.getDay() - 1);
      fromDate.setDate(toDate.getDate() - 6);
      return { from: fromDate.toISOString().slice(0, 10), to: toDate.toISOString().slice(0, 10) };
    case 'This Month':
      fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: fromDate.toISOString().slice(0, 10), to: todayStr };
    case 'Last Month':
      toDate = new Date(today.getFullYear(), today.getMonth(), 0);
      fromDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      return { from: fromDate.toISOString().slice(0, 10), to: toDate.toISOString().slice(0, 10) };
    case 'This Quarter':
      fromDate = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
      return { from: fromDate.toISOString().slice(0, 10), to: todayStr };
    case 'Last Quarter':
      const qStart = Math.floor(today.getMonth() / 3) * 3;
      toDate = new Date(today.getFullYear(), qStart, 0);
      fromDate = new Date(today.getFullYear(), qStart - 3, 1);
      return { from: fromDate.toISOString().slice(0, 10), to: toDate.toISOString().slice(0, 10) };
    case 'This Year':
      fromDate = new Date(today.getFullYear(), 0, 1);
      return { from: fromDate.toISOString().slice(0, 10), to: todayStr };
    case 'Last Year':
      fromDate = new Date(today.getFullYear() - 1, 0, 1);
      toDate = new Date(today.getFullYear() - 1, 11, 31);
      return { from: fromDate.toISOString().slice(0, 10), to: toDate.toISOString().slice(0, 10) };
    case 'Custom':
    default:
      return { from: '', to: '' };
  }
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) lines.push(row.map(escape).join(','));
  const csv = lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function inr(value: number | string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '₹0';
  return n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
}

export function num(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function pct(numerator: number, denominator: number): string {
  if (!denominator) return '0%';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export function formatDate(dateStr: string): string {
  return dateStr ? dateStr.slice(0, 10) : '';
}

export function isActivePerm(permissions: string[], perm: string): boolean {
  return permissions.includes('*') || permissions.includes(perm);
}

export type DrillDownRow = {
  id: string;
  number: string;
  date: string;
  party: string;
  amount: number;
  status: string;
  targetView: string;
};

export function renderDrillDownButton(
  onNavigate: (v: string) => void,
  targetView: string,
  label = 'Open Original'
): ReactNode {
  return (
    <button
      onClick={() => onNavigate(targetView)}
      className="flex h-8 items-center gap-1.5 rounded-md bg-[#4714a1] py-2 text-[10px] font-bold text-white hover:bg-[#5419b5]"
    >
      → {label}
    </button>
  );
}