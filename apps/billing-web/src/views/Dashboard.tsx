import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowDownToLine, ArrowRight, ArrowUpFromLine,
  ArrowUpRight, Bell, CheckCircle2, FilePlus2, Gem, History, Package, RefreshCw,
  ShoppingCart, TrendingUp, Users, Wallet,
} from 'lucide-react';
import { api } from '@/lib/api';
import { inr } from '@/lib/supabase';
import { useSilverRate } from '@/lib/silver-rate-context';

// ---------- API response shapes (best-effort) ----------

type TrendPoint = { bucket: string; revenue: number; orders: number };
type TopProduct = { product: string; sku: string; qty_sold: number; revenue: number; weight_sold: number };
type AnalyticsData = {
  kpis: { revenue: number; orders: number; aov: number; collected: number; discounts: number };
  trend: TrendPoint[];
  topProducts: TopProduct[];
};
type BusinessData = {
  current: { sales: number; orders: number; collected: number; purchases: number; purchaseOrders: number };
  comparison: { metric: string; changePct: number }[];
  receivables: number;
  payables: number;
  activeCustomers: number;
  activeSuppliers: number;
  inventory: { products: number; stockQty: number; totalWeight: number; value: number };
};
type InventoryData = {
  summary: { totalProducts: number; lowStock: number; outOfStock: number; totalValue: number; totalWeight: number };
  lowStock: { sku: string; name: string; stock_qty: number; min_stock_qty: number }[];
};
type SilverHistoryRow = { id: string; new_rate: number; previous_rate: number; rate_change: number; effective_date: string; effective_time: string; updated_by_name: string };
type ShopifyStatus = { configured: boolean; connected: boolean; storeName?: string; storeDomain?: string; message?: string };
type SyncLog = { id: string; sync_type: string; entity_name: string; status: string; error_message: string | null; synced_at: string | null; created_at: string; direction: string | null; operation: string | null };
type ActivityItem = { id: string; user_name: string; module: string; action: string; record_id: string | null; remarks: string | null; created_at: string };
type Product = { id: string; name: string; sku: string; shopify_sync_status: string };
type SalesSummary = { paid: number; outstanding: number; invoiceCount: number; grandTotal: number };

// ---------- formatting helpers ----------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[(m || 1) - 1]}${y !== new Date().getFullYear() ? ` ${y}` : ''}`;
}

function fmtDateTime(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtTime(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function fmtAxis(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e7) return '₹' + (n / 1e7).toFixed(1).replace(/\.0$/, '') + 'Cr';
  if (abs >= 1e5) return '₹' + (n / 1e5).toFixed(1).replace(/\.0$/, '') + 'L';
  if (abs >= 1e3) return '₹' + Math.round(n / 1e3) + 'K';
  return '₹' + Math.round(n);
}

function niceCeil(n: number): number {
  if (n <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const m = n / pow;
  const nice = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return nice * pow;
}

function fmtWeight(g: number): string {
  if (!g) return '0 g';
  if (g >= 1000) return (g / 1000).toFixed(1) + ' kg';
  return Math.round(g) + ' g';
}

function initials(name: string): string {
  return (name || 'S').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || 'S';
}

// ---------- shared panel primitives ----------

function DashPanel({ title, icon: Icon, badge, action, children, className = '' }: { title: string; icon: typeof Activity; badge?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-purple-50 text-[#6f39bd]"><Icon size={14} /></span>
          <h3 className="truncate text-[13px] font-bold">{title}</h3>
          {badge}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function PanelFooter({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="-mx-5 -mb-5 mt-4 flex w-[calc(100%+2.5rem)] items-center justify-center gap-1.5 border-t border-slate-100 py-3 text-[11px] font-bold text-[#6f39bd] transition hover:bg-purple-50">
      {text}<ArrowRight size={13} />
    </button>
  );
}

function ChangePill({ change }: { change: number }) {
  const up = change >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${up ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
      {up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}{Math.abs(change).toFixed(1)}%
    </span>
  );
}

function KpiCard({ label, value, sub, change, icon: Icon, tone, onClick }: { label: string; value: string; sub: string; change: number | null; icon: typeof Activity; tone: 'default' | 'warning'; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group rounded-xl border border-slate-100 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#cab4f3] hover:shadow-md">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${tone === 'warning' ? 'bg-orange-50 text-orange-500' : 'bg-purple-50 text-[#6f39bd]'}`}><Icon size={16} /></span>
      </div>
      <p className="text-2xl font-bold tracking-tight text-[#1d2945]">{value}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
        <span className="text-slate-500">{sub}</span>
        {change !== null && <ChangePill change={change} />}
      </div>
    </button>
  );
}

function Donut({ segments, centerLabel, centerValue }: { segments: { value: number; color: string }[]; centerLabel: string; centerValue: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return <div className="grid h-32 w-32 shrink-0 place-items-center rounded-full bg-slate-50 text-[10px] text-slate-400">No data</div>;
  let acc = 0;
  const stops = segments.map((s) => { const from = (acc / total) * 100; acc += s.value; const to = (acc / total) * 100; return `${s.color} ${from.toFixed(1)}% ${to.toFixed(1)}%`; }).join(', ');
  return (
    <div className="relative h-32 w-32 shrink-0">
      <div className="h-full w-full rounded-full" style={{ background: `conic-gradient(${stops})` }} />
      <div className="absolute inset-5 grid place-items-center rounded-full bg-white text-center">
        <div><p className="text-[8px] font-bold uppercase tracking-wide text-slate-400">{centerLabel}</p><p className="mt-0.5 text-sm font-bold">{centerValue}</p></div>
      </div>
    </div>
  );
}

// ---------- charts ----------

function SalesTrendChart({ points }: { points: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 250, L = 56, R = 16, T = 16, B = 30;
  const innerW = W - L - R;
  const innerH = H - T - B;
  if (!points.length) return <p className="py-10 text-center text-xs text-slate-400">No sales recorded in the selected period.</p>;
  const max = niceCeil(Math.max(...points.map((p) => p.revenue), 1));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f);
  const px = (i: number) => L + (points.length === 1 ? innerW / 2 : (i * innerW) / (points.length - 1));
  const py = (v: number) => T + innerH * (1 - v / max);
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)} ${py(p.revenue).toFixed(1)}`).join(' ');
  const area = `${line} L${px(points.length - 1).toFixed(1)} ${(T + innerH).toFixed(1)} L${px(0).toFixed(1)} ${(T + innerH).toFixed(1)} Z`;
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full" onMouseLeave={() => setHover(null)} onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * W;
        const i = Math.round(((x - L) / innerW) * (points.length - 1));
        setHover(Math.max(0, Math.min(points.length - 1, i)));
      }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={py(t)} y2={py(t)} stroke="#eef0f6" strokeWidth="1" />
            <text x={L - 8} y={py(t) + 3} textAnchor="end" fontSize="10" fill="#94a3b8">{fmtAxis(t)}</text>
          </g>
        ))}
        <path d={area} fill="#efe9fb" />
        <path d={line} fill="none" stroke="#6f39bd" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => ((i % labelEvery === 0) || i === points.length - 1) && (
          <text key={i} x={px(i)} y={H - 10} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} fontSize="10" fill="#94a3b8">{fmtDate(p.bucket)}</text>
        ))}
        {hover !== null && <circle cx={px(hover)} cy={py(points[hover].revenue)} r="4.5" fill="#6f39bd" stroke="#fff" strokeWidth="2" />}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute z-10 rounded-lg bg-[#1d2945] px-3 py-2 text-white shadow-lg" style={{ left: `${Math.min(Math.max((px(hover) / W) * 100, 8), 92)}%`, top: 4, transform: 'translateX(-50%)' }}>
          <p className="text-[10px] font-bold">{fmtDate(points[hover].bucket)}</p>
          <p className="mt-0.5 text-[10px] text-slate-300">{inr(points[hover].revenue)} · {points[hover].orders} order{points[hover].orders === 1 ? '' : 's'}</p>
        </div>
      )}
    </div>
  );
}

function SilverHistoryChart({ rows }: { rows: SilverHistoryRow[] }) {
  const W = 640, H = 130, L = 46, R = 12, T = 10, B = 22;
  const innerW = W - L - R;
  const innerH = H - T - B;
  const pts = [...rows].reverse();
  if (!pts.length) return <p className="pt-8 text-center text-[10px] text-slate-400">No rate history recorded yet.</p>;
  const max = niceCeil(Math.max(...pts.map((r) => Number(r.new_rate)), 1));
  const ticks = [0, max / 2, max];
  const px = (i: number) => L + (pts.length === 1 ? innerW / 2 : (i * innerW) / (pts.length - 1));
  const py = (v: number) => T + innerH * (1 - v / max);
  const line = pts.map((r, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)} ${py(Number(r.new_rate)).toFixed(1)}`).join(' ');
  const mid = Math.floor(pts.length / 2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 h-28 w-full">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={py(t)} y2={py(t)} stroke="#eef0f6" strokeWidth="1" />
          <text x={L - 6} y={py(t) + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{fmtAxis(t)}</text>
        </g>
      ))}
      <path d={line} fill="none" stroke="#29ad65" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {[0, mid, pts.length - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) => (
        <g key={i}>
          <circle cx={px(i)} cy={py(Number(pts[i].new_rate))} r="3" fill="#29ad65" stroke="#fff" strokeWidth="1.5" />
          <text x={px(i)} y={H - 8} textAnchor="middle" fontSize="9" fill="#94a3b8">{fmtDate(pts[i].effective_date)}</text>
        </g>
      ))}
    </svg>
  );
}

// ---------- dashboard ----------

export default function Dashboard({ onNavigate, from, to, showComparison = true }: { onNavigate: (v: string) => void; from: string; to: string; showComparison?: boolean }) {
  const { currentRate, previousRate, effectiveTime, status: rateStatus } = useSilverRate();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [business, setBusiness] = useState<BusinessData | null>(null);
  const [inventory, setInventory] = useState<InventoryData | null>(null);
  const [silverHistory, setSilverHistory] = useState<SilverHistoryRow[]>([]);
  const [shopify, setShopify] = useState<ShopifyStatus | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [salesSummary, setSalesSummary] = useState<SalesSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    const suffix = qs.toString() ? `&${qs.toString()}` : '';
    async function load() {
      const [a, b, inv, sh, sv, lg, pr, act, ss] = await Promise.all([
        api<AnalyticsData>(`/api/reports/analytics?period=daily${suffix}`).catch(() => null),
        api<BusinessData>(`/api/reports/business?${qs.toString()}`).catch(() => null),
        api<InventoryData>('/api/reports/inventory').catch(() => null),
        api<ShopifyStatus>('/api/shopify/status').catch(() => null),
        api<SilverHistoryRow[]>('/api/silver-rate/history?limit=30').catch(() => []),
        api<SyncLog[]>('/api/shopify/logs?limit=80').catch(() => []),
        api<Product[]>('/api/products').catch(() => []),
        api<{ items: ActivityItem[] }>('/api/activity-logs?limit=10').catch(() => null),
        api<{ summary: SalesSummary }>(`/api/reports/sales?${qs.toString()}`).catch(() => null),
      ]);
      if (cancelled) return;
      setAnalytics(a); setBusiness(b); setInventory(inv); setShopify(sh); setSilverHistory(sv);
      setSyncLogs(lg); setProducts(pr); setActivities(act?.items ?? []); setSalesSummary(ss?.summary ?? null);
    }
    void load();
    return () => { cancelled = true; };
  }, [from, to]);

  const kpis = analytics?.kpis;
  const sales = kpis?.revenue ?? 0;
  const salesOrders = kpis?.orders ?? 0;
  const collected = kpis?.collected ?? 0;
  const purchases = business?.current.purchases ?? 0;
  const purchaseOrders = business?.current.purchaseOrders ?? 0;
  const receivables = business?.receivables ?? 0;
  const payables = business?.payables ?? 0;
  const activeCustomers = business?.activeCustomers ?? 0;
  const activeSuppliers = business?.activeSuppliers ?? 0;
  const stockValue = business?.inventory.value ?? inventory?.summary.totalValue ?? 0;
  const stockProducts = business?.inventory.products ?? inventory?.summary.totalProducts ?? 0;
  const totalWeight = business?.inventory.totalWeight ?? 0;

  // "vs previous period" is only meaningful for real date ranges, not All Time.
  const pctChange = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of business?.comparison ?? []) map.set(c.metric, c.changePct);
    return (metric: string) => (showComparison && map.has(metric) ? map.get(metric)! : null);
  }, [business, showComparison]);

  // Shopify health
  const failedLogs = syncLogs.filter((l) => l.status === 'Failed');
  const syncedProducts = products.filter((p) => p.shopify_sync_status === 'Synced').length;
  const pendingProducts = products.filter((p) => ['Pending', 'Processing'].includes(p.shopify_sync_status)).length;
  const orderCount = syncLogs.filter((l) => l.sync_type === 'Order').length;
  const syncIssues = failedLogs.length + pendingProducts;

  // Action required
  const lowStockCount = inventory?.summary.lowStock ?? 0;
  const actionItems = [
    { key: 'sync', severity: syncIssues > 0 ? 'red' : 'ok', label: 'Shopify sync', detail: syncIssues > 0 ? `${syncIssues} issue${syncIssues === 1 ? '' : 's'} need attention` : 'Synchronization is healthy', nav: 'Shopify Sync' },
    { key: 'stock', severity: lowStockCount > 0 ? 'amber' : 'ok', label: 'Low stock', detail: lowStockCount > 0 ? `${lowStockCount} product${lowStockCount === 1 ? '' : 's'} at or below minimum` : 'No low stock products', nav: 'Low Stock Alert' },
    { key: 'receivables', severity: receivables > 0 ? 'amber' : 'ok', label: 'Receivables', detail: receivables > 0 ? `${inr(receivables)} outstanding from ${activeCustomers} customer${activeCustomers === 1 ? '' : 's'}` : 'No outstanding receivables', nav: 'Payments' },
  ] as const;
  const openActions = actionItems.filter((a) => a.severity !== 'ok').length;

  const primaryKpis = [
    { label: 'Sales', value: inr(sales), sub: `${salesOrders} order${salesOrders === 1 ? '' : 's'}`, change: pctChange('Sales'), tone: 'default' as const, icon: TrendingUp, nav: 'Business Reports' },
    { label: 'Purchases', value: inr(purchases), sub: `${purchaseOrders} purchase invoice${purchaseOrders === 1 ? '' : 's'}`, change: pctChange('Purchases'), tone: 'default' as const, icon: ShoppingCart, nav: 'Purchase Invoices' },
    { label: 'Receivables', value: inr(receivables), sub: `${activeCustomers} customer${activeCustomers === 1 ? '' : 's'} owe`, change: null, tone: receivables > 0 ? 'warning' as const : 'default' as const, icon: Wallet, nav: 'Payments' },
    { label: 'Stock Value', value: inr(stockValue), sub: `${stockProducts} products · ${fmtWeight(totalWeight)}`, change: null, tone: 'default' as const, icon: Package, nav: 'Stock Overview' },
  ];

  const quickActions = [
    { label: 'New Invoice', icon: FilePlus2, target: 'Sales Invoices', primary: true },
    { label: 'Add Customer', icon: Users, target: 'Customers', primary: false },
    { label: 'Add Product', icon: Gem, target: 'Products', primary: false },
    { label: 'Purchase Order', icon: ShoppingCart, target: 'Purchase Orders', primary: false },
    { label: 'Update Silver Rate', icon: TrendingUp, target: 'Silver Rate', primary: false },
  ];

  const rateChange = currentRate - previousRate;
  const topProducts = analytics?.topProducts ?? [];
  const periodPaid = salesSummary?.paid ?? 0;
  const periodOutstanding = salesSummary?.outstanding ?? 0;

  return (
    <div className="space-y-5">
      {/* Quick actions */}
      <div className="flex flex-wrap items-center gap-2.5">
        {quickActions.map((a) => (
          <button key={a.label} onClick={() => onNavigate(a.target)} className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-xs font-bold transition ${a.primary ? 'bg-[#4714a1] text-white shadow-sm hover:bg-[#5419b5]' : 'border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-[#cab4f3] hover:text-[#5419b5]'}`}>
            <a.icon size={15} />{a.label}
          </button>
        ))}
      </div>

      {/* Primary KPIs — period data, all driven by the selected range */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {primaryKpis.map((k) => <KpiCard key={k.label} {...k} onClick={() => onNavigate(k.nav)} />)}
      </div>

      {/* Sales trend + action required */}
      <div className="grid gap-4 xl:grid-cols-3">
        <DashPanel title="Sales Trend" icon={TrendingUp} className="xl:col-span-2" badge={<span className="hidden rounded-full bg-slate-50 px-2 py-0.5 text-[9px] font-bold text-slate-500 sm:inline-block">{salesOrders} orders · {inr(sales)}</span>}>
          <SalesTrendChart points={analytics?.trend ?? []} />
        </DashPanel>
        <DashPanel title="Action Required" icon={AlertTriangle} badge={openActions > 0 ? <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[9px] font-bold text-orange-700">{openActions}</span> : <CheckCircle2 size={14} className="text-emerald-500" />}>
          <div className="space-y-1">
            {actionItems.map((a) => (
              <button key={a.key} onClick={() => onNavigate(a.nav)} className="flex w-full items-center gap-3 rounded-lg border border-transparent px-2 py-2.5 text-left transition hover:border-slate-100 hover:bg-slate-50">
                <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${a.severity === 'red' ? 'bg-red-500' : a.severity === 'amber' ? 'bg-orange-400' : 'bg-emerald-500'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold">{a.label}</span>
                  <span className="block truncate text-[10px] text-slate-500">{a.detail}</span>
                </span>
                <span className="shrink-0 text-[10px] font-bold text-[#6f39bd]">{a.severity === 'ok' ? 'OK' : 'Review'}</span>
              </button>
            ))}
          </div>
        </DashPanel>
      </div>

      {/* Top products + Shopify + silver rate */}
      <div className="grid gap-4 xl:grid-cols-3">
        <DashPanel title="Top Products by Revenue" icon={Gem} action={<span className="text-[9px] font-semibold text-slate-400">Ranked by revenue</span>}>
          {topProducts.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">No product sales in the selected period.</p>
          ) : (
            <div className="overflow-hidden">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="py-2 pr-2">Product</th>
                    <th className="py-2 pr-2 text-right">Qty</th>
                    <th className="py-2 pr-2 text-right">Weight</th>
                    <th className="py-2 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.slice(0, 6).map((p, i) => (
                    <tr key={`${p.sku}-${i}`} className="border-b border-slate-50 last:border-0">
                      <td className="py-2.5 pr-2">
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-slate-50 text-[9px] font-bold text-slate-400">{i + 1}</span>
                          <div className="min-w-0"><p className="truncate font-bold">{p.product}</p><p className="text-[9px] text-slate-400">{p.sku}</p></div>
                        </div>
                      </td>
                      <td className="py-2.5 pr-2 text-right text-slate-600">{p.qty_sold} pcs</td>
                      <td className="py-2.5 pr-2 text-right text-slate-500">{fmtWeight(p.weight_sold)}</td>
                      <td className="py-2.5 text-right font-bold">{inr(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <PanelFooter text="View All Products" onClick={() => onNavigate('Products')} />
        </DashPanel>

        <DashPanel title="Shopify Sync" icon={RefreshCw} badge={
          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${shopify?.connected ? 'bg-emerald-50 text-emerald-600' : shopify?.configured ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: 'currentColor' }} />{shopify?.connected ? 'Connected' : shopify?.configured ? 'Attention' : 'Not configured'}
          </span>}>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold text-slate-500">{shopify?.storeName || 'Shopify store'}</p>
                <p className="text-[9px] text-slate-400">{shopify?.storeDomain || 'No store configured yet'}</p>
              </div>
              {syncIssues > 0 && <span className="flex items-center gap-1 rounded-full bg-orange-50 px-2 py-1 text-[9px] font-bold text-orange-600"><AlertTriangle size={11} /> {syncIssues} attention</span>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[['Products synced', `${syncedProducts} / ${products.length}`], ['Pending sync', `${pendingProducts}`], ['Orders imported', `${orderCount}`], ['Sync errors', `${failedLogs.length}`]].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-slate-50 px-3 py-2.5"><p className="text-[9px] font-semibold text-slate-400">{label}</p><p className="mt-0.5 text-sm font-bold">{value}</p></div>
              ))}
            </div>
            <div className="space-y-1.5 rounded-lg border border-slate-100 px-3 py-2.5 text-[9px] font-semibold text-slate-500">
              <p className="flex items-center gap-1.5"><ArrowUpFromLine size={11} className="text-[#6f39bd]" /> ERP → Shopify · products, inventory, prices</p>
              <p className="flex items-center gap-1.5"><ArrowDownToLine size={11} className="text-[#6f39bd]" /> Shopify → ERP · orders, customers</p>
            </div>
          </div>
          <PanelFooter text="View Sync" onClick={() => onNavigate('Shopify Sync')} />
        </DashPanel>

        <DashPanel title="Silver Rate (92.5)" icon={TrendingUp} badge={rateStatus === 'ready' ? <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${rateChange >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>{rateChange >= 0 ? '+' : ''}{rateChange.toFixed(2)} /g</span> : undefined} action={<button onClick={() => onNavigate('Silver Rate')} className="text-[10px] font-bold text-[#6f39bd]">Update</button>}>
          {rateStatus === 'ready' ? (
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold text-slate-400">Current rate</p>
                <p className="text-2xl font-bold text-emerald-600">₹{currentRate.toFixed(2)} <span className="text-xs font-semibold text-slate-400">/ gram</span></p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-semibold text-slate-400">Previous</p>
                <p className="text-sm font-bold">₹{previousRate.toFixed(2)} /g</p>
              </div>
            </div>
          ) : (
            <button onClick={() => onNavigate('Silver Rate')} className="w-full rounded-lg border border-dashed border-slate-300 py-4 text-xs font-bold text-amber-600 hover:border-amber-300">
              {rateStatus === 'loading' ? 'Loading rate…' : rateStatus === 'error' ? `Rate unavailable — retry` : 'No silver rate set — click to set it'}
            </button>
          )}
          {rateStatus === 'ready' && <p className="mt-1 text-[9px] text-slate-400">{effectiveTime ? `Updated ${effectiveTime}` : 'Rate from product master'} · 92.5 sterling silver</p>}
          <SilverHistoryChart rows={silverHistory} />
        </DashPanel>
      </div>

      {/* Receivables + low stock + activities */}
      <div className="grid gap-4 xl:grid-cols-3">
        <DashPanel title="Receivables Status" icon={Wallet} action={<button onClick={() => onNavigate('Payments')} className="text-[10px] font-bold text-[#6f39bd]">View Receivables</button>}>
          <div className="flex flex-wrap items-center gap-5">
            <Donut
              segments={[{ value: periodPaid, color: '#34c77b' }, { value: periodOutstanding, color: '#f5a623' }]}
              centerLabel="Period due"
              centerValue={inr(periodOutstanding)}
            />
            <div className="min-w-0 flex-1 space-y-3 text-[10px]">
              <div><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Total receivables</p><p className="mt-0.5 text-lg font-bold">{inr(receivables)}</p><p className="text-[9px] text-slate-400">{activeCustomers} customer{activeCustomers === 1 ? '' : 's'} with balances</p></div>
              <div className="space-y-1.5 border-t border-slate-100 pt-2.5">
                <p className="flex items-center justify-between"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-emerald-500" />Collected (period)</span><b>{inr(periodPaid)}</b></p>
                <p className="flex items-center justify-between"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-amber-400" />Outstanding (period)</span><b>{inr(periodOutstanding)}</b></p>
                <p className="flex items-center justify-between text-slate-400"><span>Payables to suppliers</span><b className="text-slate-600">{inr(payables)}</b></p>
              </div>
            </div>
          </div>
        </DashPanel>

        <DashPanel title="Low Stock Alert" icon={Bell} badge={lowStockCount > 0 ? <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[9px] font-bold text-orange-700">{lowStockCount}</span> : null}>
          {inventory?.lowStock.length === 0 ? (
            <div className="flex items-center gap-3 py-8"><CheckCircle2 size={18} className="text-emerald-500" /><p className="text-xs text-slate-500">All products are above their minimum stock levels.</p></div>
          ) : (
            <div className="space-y-3">
              {(inventory?.lowStock ?? []).slice(0, 5).map((p) => {
                const critical = p.stock_qty <= 0;
                return (
                  <div key={`${p.sku}-${p.name}`} className="flex items-center justify-between gap-2 border-b border-slate-50 pb-2.5 last:border-0 last:pb-0">
                    <div className="min-w-0"><p className="truncate text-[11px] font-bold">{p.name}</p><p className="text-[9px] text-slate-400">{p.sku}</p></div>
                    <div className="text-right">
                      <p className="text-[11px] font-bold">{p.stock_qty} pcs <span className="font-normal text-slate-400">/ min {p.min_stock_qty}</span></p>
                      <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold ${critical ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'}`}>{critical ? 'Out of stock' : 'Low stock'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <PanelFooter text="View All Low Stock" onClick={() => onNavigate('Low Stock Alert')} />
        </DashPanel>

        <DashPanel title="Recent Activities" icon={History} action={<button onClick={() => onNavigate('Activity Log')} className="text-[10px] font-bold text-[#6f39bd]">View All</button>}>
          {activities.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">No recent activity recorded.</p>
          ) : (
            <div className="space-y-3">
              {activities.slice(0, 6).map((a) => (
                <div key={a.id} className="flex items-start gap-3 border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-purple-50 text-[9px] font-bold text-[#6f39bd]">{initials(a.user_name)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold leading-snug">{a.action}<span className="ml-1.5 font-normal text-slate-400">· {a.module}</span></p>
                    {a.remarks && <p className="mt-0.5 truncate text-[10px] text-slate-500">{a.remarks}</p>}
                  </div>
                  <time className="shrink-0 text-[9px] text-slate-400">{fmtTime(a.created_at)}</time>
                </div>
              ))}
            </div>
          )}
        </DashPanel>
      </div>
    </div>
  );
}
