import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertCircle, AlertTriangle, ArrowDownToLine, ArrowRight, ArrowUpFromLine, CheckCircle2,
  ChevronDown, Circle, Clock3, Package, RefreshCw, RotateCw, Scale, Search, Settings2,
  ShoppingBag, SlidersHorizontal, Users, Wifi, X, Zap,
} from 'lucide-react';
import { inr } from '@/lib/currency';
import { type Customer, type Product, type ReconciliationResult, type ShopifySyncFlag, type ShopifySyncLog } from '@/lib/types';
import { api } from '@/lib/api';
import { Badge, EmptyState } from '@/components/ui';
import { calculateFinalPrice } from '@/lib/pricing';

const tabs = [
  { key: 'overview', label: 'Overview', icon: Wifi },
  { key: 'products', label: 'Products', icon: Package },
  { key: 'inventory', label: 'Inventory', icon: SlidersHorizontal },
  { key: 'orders', label: 'Orders', icon: ShoppingBag },
  { key: 'customers', label: 'Customers', icon: Users },
  { key: 'reconciliation', label: 'Reconciliation', icon: Scale },
  { key: 'flags', label: 'Flags', icon: AlertTriangle },
  { key: 'errors', label: 'Sync Errors', icon: AlertCircle },
] as const;
type Tab = (typeof tabs)[number]['key'];

type ShopifyStatus = { configured: boolean; connected: boolean; storeName?: string; storeDomain?: string; apiVersion?: string; message?: string };

export default function ShopifySync() {
  const [tab, setTab] = useState<Tab>('overview');
  const [products, setProducts] = useState<Product[]>([]);
  const [logs, setLogs] = useState<ShopifySyncLog[]>([]);
  const [flags, setFlags] = useState<ShopifySyncFlag[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [reconcile, setReconcile] = useState<ReconciliationResult | null>(null);
  const [silverRate, setSilverRate] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [syncOpen, setSyncOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reconcileBusy, setReconcileBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [connection, setConnection] = useState<ShopifyStatus>({ configured: false, connected: false });

  useEffect(() => { void load(); }, []);

  async function load() {
    const [productData, logData, flagData, customerData, rate] = await Promise.all([
      api<Product[]>('/api/products').catch(() => []),
      api<ShopifySyncLog[]>('/api/shopify/logs?limit=120').catch(() => []),
      api<ShopifySyncFlag[]>('/api/shopify/flags').catch(() => []),
      api<Customer[]>('/api/customers?limit=200').catch(() => []),
      api<{ currentRate: number | null; previousRate?: number | null; configured?: boolean }>('/api/silver-rate').catch(() => null),
    ]);
    setProducts(productData);
    setLogs(logData);
    setFlags(flagData);
    setCustomers(customerData);
    if (rate && typeof rate.currentRate === 'number' && rate.currentRate > 0) setSilverRate(rate.currentRate);
    else setSilverRate(null);
    try { setConnection(await api<ShopifyStatus>('/api/shopify/status')); } catch { setConnection({ configured: false, connected: false, message: 'API unavailable' }); }
  }

  const failedLogs = logs.filter((log) => log.status === 'Failed');
  const flaggedLogs = logs.filter((log) => log.status === 'Flagged');
  const openFlags = flags.filter((flag) => flag.status === 'Open');
  const productLogs = logs.filter((log) => log.sync_type === 'Product');
  const inventoryLogs = logs.filter((log) => log.sync_type === 'Inventory');
  const orderLogs = logs.filter((log) => log.sync_type === 'Order');
  const customerLogs = logs.filter((log) => log.sync_type === 'Customer');
  const customersBlocked = customerLogs.some((log) => log.operation === 'reconcile_customers_blocked');
  const syncedProducts = products.filter((product) => product.shopify_sync_status === 'Synced').length;
  const pendingProducts = products.filter((product) => ['Pending', 'Processing'].includes(product.shopify_sync_status)).length;
  const linkedCustomers = customers.filter((customer) => customer.shopify_customer_id).length;
  const lastActivity = logs[0]?.synced_at ?? logs[0]?.created_at;
  const lastSuccess = logs.find((log) => log.status === 'Synced')?.synced_at ?? logs.find((log) => log.status === 'Synced')?.created_at;
  const attentionCount = failedLogs.length + openFlags.length;
  const connectionHealthy = attentionCount === 0;

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 2800);
  }

  function syncBadge(status: string) {
    if (status === 'Synced' || status === 'Completed' || status === 'Imported') return <Badge color="green">Healthy</Badge>;
    if (status === 'Pending' || status === 'Processing') return <Badge color="amber">Pending</Badge>;
    if (status === 'Failed') return <Badge color="red">Failed</Badge>;
    if (status === 'Retrying') return <Badge color="cyan">Retrying</Badge>;
    if (status === 'Flagged' || status === 'Open') return <Badge color="orange">Flagged</Badge>;
    if (status === 'Skipped') return <Badge color="slate">Skipped</Badge>;
    return <Badge color="slate">{status}</Badge>;
  }

  async function syncProduct(product: Product) {
    try {
      await api('/api/shopify/sync/products', { method: 'POST', body: JSON.stringify({ productSkus: [product.sku] }) });
      await load();
      showToast(`${product.name} reconciliation completed`);
    } catch (error) { showToast(error instanceof Error ? error.message : 'Product reconciliation failed'); }
  }

  async function runSync(scope: 'Products' | 'Inventory' | 'Orders' | 'Customers' | 'Everything') {
    setBusy(true);
    setSyncOpen(false);
    try {
      const scopePath = scope.toLowerCase();
      const result = await api<Record<string, any>>(`/api/shopify/sync/${scopePath}`, { method: 'POST' });
      await load();
      if (scope === 'Products') {
        const updated = Number(result.updated ?? result.matched ?? 0);
        const failures = Array.isArray(result.failures) ? result.failures.length : 0;
        showToast(`${updated} products updated${failures ? `, ${failures} failed` : ''}`);
      } else if (scope === 'Inventory') {
        showToast(`Stock corrected for ${result.corrected ?? 0} products`);
      } else if (scope === 'Orders') {
        const message = `${result.imported ?? 0} orders imported, ${result.created ?? 0} draft order${Number(result.created) === 1 ? '' : 's'} created`;
        showToast(result.customerAvailable === false ? `${message} (customer details unavailable on this plan)` : message);
      } else if (scope === 'Customers') {
        if (result.blocked) showToast('Customer sync blocked by store plan (PII not approved)');
        else showToast(`${result.linked ?? 0} linked, ${result.created ?? 0} created`);
      } else {
        const parts = [`${result.products?.updated ?? 0} products`, `${result.inventory?.corrected ?? 0} stock corrections`, `${result.orders?.created ?? 0} drafts`];
        parts.push(result.customers?.blocked ? 'customers blocked (plan)' : 'customers ok');
        showToast(parts.join(', '));
      }
    } catch (error) { showToast(error instanceof Error ? error.message : `${scope} synchronization failed`); }
    finally { setBusy(false); }
  }

  async function runReconcile() {
    setReconcileBusy(true);
    try {
      setReconcile(await api<ReconciliationResult>('/api/shopify/reconcile'));
      showToast('Reconciliation comparison completed');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Reconciliation failed'); }
    finally { setReconcileBusy(false); }
  }

  async function resolveFlag(flag: ShopifySyncFlag) {
    try {
      await api(`/api/shopify/flags/${flag.id}/resolve`, { method: 'POST' });
      await load();
      showToast('Flag resolved');
    } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to resolve flag'); }
  }

  async function retry(log: ShopifySyncLog) {
    try {
      if (log.sync_type === 'Product' || log.sync_type === 'Inventory') {
        await api('/api/shopify/sync/products', { method: 'POST', body: JSON.stringify({ productSkus: [log.entity_name] }) });
      } else if (log.sync_type === 'Order') {
        await api('/api/shopify/sync/orders', { method: 'POST' });
      } else if (log.sync_type === 'Customer') {
        await api('/api/shopify/sync/customers', { method: 'POST' });
      } else {
        await api('/api/shopify/sync/everything', { method: 'POST' });
      }
      await load();
      showToast(`Retry completed for ${log.entity_name}`);
    } catch (error) { showToast(error instanceof Error ? error.message : 'Retry failed'); }
  }

  return (
    <div className="space-y-4">
      <header className="relative overflow-visible rounded-2xl bg-[#1d2945] p-5 text-white shadow-sm md:p-6">
        <div className="absolute right-0 top-0 h-36 w-56 rounded-bl-full bg-[#5419b5]/40" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10"><RefreshCw size={16} /></span><span className="text-[10px] font-bold uppercase tracking-[.18em] text-purple-200">Integration Control Center</span></div>
            <h2 className="text-xl font-bold">Shopify Sync <span className={`ml-2 inline-flex items-center gap-1.5 rounded-full px-2 py-1 align-middle text-[9px] font-bold ${connection.connected ? 'bg-emerald-400/15 text-emerald-300' : 'bg-orange-400/15 text-orange-200'}`}><Circle size={7} fill="currentColor" /> {connection.connected ? 'Connected' : connection.configured ? 'Connection failed' : 'Not configured'}</span></h2>
            <p className="mt-1 text-[11px] text-slate-300">{connection.storeName || 'Opal Line Jewelry'} · {connection.storeDomain || 'Shopify store not configured'}</p>
            <p className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-400"><Clock3 size={12} /> Last activity: {lastActivity ? formatDate(lastActivity) : 'No activity recorded'}</p>
          </div>
          <div className="relative flex items-center gap-2">
            <div className="relative">
              <button onClick={() => setSyncOpen(!syncOpen)} disabled={busy} className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-[10px] font-bold text-[#1d2945] disabled:opacity-60"><Zap size={13} /> {busy ? 'Queuing...' : 'Sync Now'} <ChevronDown size={13} /></button>
              {syncOpen && <div className="absolute right-0 top-10 z-20 w-48 overflow-hidden rounded-lg border border-slate-100 bg-white py-1 text-[#1d2945] shadow-xl">
                {(['Products', 'Inventory', 'Orders', 'Customers', 'Everything'] as const).map((scope) => <button key={scope} onClick={() => runSync(scope)} className="flex w-full items-center justify-between px-3 py-2 text-left text-[10px] font-semibold hover:bg-purple-50"><span>Sync {scope}</span><ArrowRight size={12} className="text-slate-400" /></button>)}
              </div>}
            </div>
            <button onClick={() => setSettingsOpen(true)} className="flex items-center gap-2 rounded-md border border-white/20 px-3 py-2 text-[10px] font-bold text-white hover:bg-white/10"><Settings2 size={13} /> Connection Settings</button>
          </div>
        </div>
      </header>

      <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-100 bg-white p-1.5 shadow-sm">
        {tabs.map(({ key, label, icon: Icon }) => <button key={key} onClick={() => setTab(key)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-bold ${tab === key ? 'bg-[#4714a1] text-white' : 'text-slate-600 hover:bg-slate-50'}`}><Icon size={13} />{label}{key === 'errors' && failedLogs.length > 0 && <span className="rounded-full bg-red-100 px-1.5 text-[8px] text-red-600">{failedLogs.length}</span>}{key === 'flags' && openFlags.length > 0 && <span className="rounded-full bg-orange-100 px-1.5 text-[8px] text-orange-600">{openFlags.length}</span>}</button>)}
            </nav>

      {silverRate === null && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] font-bold text-amber-700">
          <AlertTriangle size={14} /> Silver rate is not configured. ERP prices cannot be shown or pushed until a silver rate is set.
        </div>
      )}

      {tab === 'overview' && <Overview connectionHealthy={connectionHealthy} lastSuccess={lastSuccess}        failedLogs={failedLogs} openFlags={openFlags} products={products} syncedProducts={syncedProducts} pendingProducts={pendingProducts} orderCount={orderLogs.length} customerCount={customers.length} logs={logs} onTab={setTab} onSync={() => runSync('Everything')} onReconcile={() => { setTab('reconciliation'); void runReconcile(); }} />}
      {tab === 'products' && <ProductsView products={products} logs={productLogs} reconcile={reconcile} silverRate={silverRate} query={query} setQuery={setQuery} syncBadge={syncBadge} onSync={syncProduct} onSyncAll={() => runSync('Products')} onRetry={retry} />}
      {tab === 'inventory' && <InventoryView products={products} logs={inventoryLogs} reconcile={reconcile} syncBadge={syncBadge} onSync={() => runSync('Inventory')} onRetry={retry} />}
      {tab === 'orders' && <OrdersView logs={orderLogs} syncBadge={syncBadge} onSync={() => runSync('Orders')} onRetry={retry} />}
      {tab === 'customers' && <CustomersView blocked={customersBlocked} customers={customers} logs={customerLogs} query={query} setQuery={setQuery} syncBadge={syncBadge} onSync={() => runSync('Customers')} onRetry={retry} />}
      {tab === 'reconciliation' && <ReconciliationView result={reconcile} busy={reconcileBusy} silverRate={silverRate} onRun={runReconcile} onPushProducts={() => runSync('Products')} onPushInventory={() => runSync('Inventory')} />}
      {tab === 'flags' && <FlagsView flags={openFlags} onResolve={resolveFlag} />}
      {tab === 'errors' && <ErrorsView logs={failedLogs} onRetry={retry} />}

      {settingsOpen && <ConnectionSettings connection={connection} onClose={() => setSettingsOpen(false)} onTest={async () => { try { setConnection(await api<ShopifyStatus>('/api/shopify/status')); showToast('Connection test completed'); } catch { showToast('Unable to reach the Admin API'); } }} />}
      {toast && <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-[#1d2945] px-4 py-3 text-xs font-semibold text-white shadow-xl">{toast}</div>}
    </div>
  );
}

function Overview({ connectionHealthy, lastSuccess, failedLogs, openFlags, products, syncedProducts, pendingProducts, orderCount, customerCount, logs, onTab, onSync, onReconcile }: { connectionHealthy: boolean; lastSuccess?: string; failedLogs: ShopifySyncLog[]; openFlags: ShopifySyncFlag[]; products: Product[]; syncedProducts: number; pendingProducts: number; orderCount: number; customerCount: number; logs: ShopifySyncLog[]; onTab: (tab: Tab) => void; onSync: () => void; onReconcile: () => void }) {
  const attentionCount = failedLogs.length + openFlags.length;
  const health = [
    ['Products', syncedProducts, products.length, 'products' as Tab, Package, failedLogs.some((log) => log.sync_type === 'Product')],
    ['Inventory', products.length - pendingProducts, products.length, 'inventory' as Tab, SlidersHorizontal, failedLogs.some((log) => log.sync_type === 'Inventory')],
    ['Orders', orderCount, orderCount, 'orders' as Tab, ShoppingBag, failedLogs.some((log) => log.sync_type === 'Order')],
    ['Customers', customerCount, customerCount, 'customers' as Tab, Users, failedLogs.some((log) => log.sync_type === 'Customer')],
  ] as const;
  return <div className="space-y-4">
    <div className="grid gap-3 xl:grid-cols-[1.1fr_.9fr]">
      <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm"><div className="mb-4 flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Shopify Connection</p><h3 className="mt-1 text-base font-bold">Opal Line Jewelry</h3></div><Badge color={connectionHealthy ? 'green' : 'amber'}>{connectionHealthy ? 'Connected' : 'Attention required'}</Badge></div><div className="grid grid-cols-2 gap-3 text-[10px] sm:grid-cols-3"><Info label="Store" value="opalline.myshopify.com" /><Info label="Last successful sync" value={lastSuccess ? formatDate(lastSuccess) : 'Not yet recorded'} /><Info label="Next reconciliation" value="On demand" /></div><div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4 text-[10px] text-slate-500"><ArrowUpFromLine size={13} className="text-[#6f39bd]" /> Our system owns products, prices and inventory <ArrowRight size={13} /><ArrowDownToLine size={13} className="text-[#6f39bd]" /> Shopify owns orders and online customers</div></section>
      <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Integration Health</p><h3 className="mt-1 text-base font-bold">{connectionHealthy ? 'Everything is operating normally' : `${attentionCount} issue${attentionCount === 1 ? '' : 's'} need attention`}</h3></div><div className={`grid h-10 w-10 place-items-center rounded-full ${connectionHealthy ? 'bg-emerald-50 text-emerald-500' : 'bg-red-50 text-red-500'}`}>{connectionHealthy ? <CheckCircle2 size={21} /> : <AlertCircle size={21} />}</div></div><div className="mt-4 space-y-2">{health.map(([label, value, total, destination, Icon, issue]) => <button key={label} onClick={() => onTab(destination)} className="flex w-full items-center gap-3 rounded-lg border border-slate-100 px-3 py-2 text-left hover:border-purple-200 hover:bg-purple-50/40"><Icon size={14} className="text-slate-400" /><span className="flex-1 text-[10px] font-semibold">{label}</span><span className="text-[10px] text-slate-400">{value}/{total}</span>{issue ? <Badge color="red">Issue</Badge> : <Badge color="green">Healthy</Badge>}</button>)}</div></section>
    </div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{health.map(([label, value, , destination, Icon, issue]) => <button key={label} onClick={() => onTab(destination)} className="rounded-xl border border-slate-100 bg-white p-4 text-left shadow-sm hover:-translate-y-0.5 hover:border-purple-200"><div className="flex items-center justify-between"><span className="grid h-8 w-8 place-items-center rounded-lg bg-purple-50 text-[#6f39bd]"><Icon size={15} /></span>{issue ? <AlertCircle size={15} className="text-orange-500" /> : <CheckCircle2 size={15} className="text-emerald-500" />}</div><p className="mt-4 text-[10px] font-semibold text-slate-500">{label}</p><p className="mt-1 text-xl font-bold">{value.toLocaleString('en-IN')}</p><p className="mt-1 text-[9px] text-slate-400">{issue ? 'Requires attention' : 'Synchronized'}</p></button>)}</div>
    <div className="grid gap-3 xl:grid-cols-[1fr_1.1fr]"><section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sync Activity</p><h3 className="mt-1 text-base font-bold">Recent activity</h3></div><button onClick={onReconcile} className="flex items-center gap-1.5 rounded-md bg-[#4714a1] px-3 py-2 text-[10px] font-bold text-white"><Scale size={12} /> Reconcile</button></div><Activity logs={logs} syncBadge={(status) => status === 'Failed' ? <Badge color="red">Attention</Badge> : status === 'Flagged' ? <Badge color="orange">Flagged</Badge> : <Badge color="green">Completed</Badge>} /></section><section className="rounded-xl border border-orange-100 bg-orange-50/50 p-5"><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-wider text-orange-600">Attention Required</p><h3 className="mt-1 text-base font-bold text-[#1d2945]">{attentionCount ? `${attentionCount} issue${attentionCount === 1 ? '' : 's'} require attention` : 'No issues require attention'}</h3></div><AlertCircle size={20} className="text-orange-500" /></div>{attentionCount ? <div className="mt-4 space-y-2">{failedLogs.slice(0, 3).map((log) => <div key={log.id} className="flex items-center gap-2 rounded-lg bg-white p-3 text-[10px]"><span className="h-1.5 w-1.5 rounded-full bg-orange-500" /><span className="flex-1"><b>{log.sync_type}</b> · {log.entity_name}<span className="ml-2 text-red-500">{log.error_message || 'Sync failed'}</span></span><button onClick={() => onTab('errors')} className="font-bold text-[#6f39bd]">View</button></div>)}{openFlags.slice(0, 3).map((flag) => <div key={flag.id} className="flex items-center gap-2 rounded-lg bg-white p-3 text-[10px]"><span className="h-1.5 w-1.5 rounded-full bg-orange-500" /><span className="flex-1"><b>Flag</b> · {flag.product_sku || '—'} · {flag.category.replace(/_/g, ' ')}</span><button onClick={() => onTab('flags')} className="font-bold text-[#6f39bd]">Review</button></div>)}</div> : <p className="mt-4 text-[10px] text-orange-700">Webhook events, reconciliation, and manual syncs are clear.</p>}</section></div>
  </div>;
}

function ProductsView({ products, logs, reconcile, silverRate, query, setQuery, syncBadge, onSync, onSyncAll, onRetry }: { products: Product[]; logs: ShopifySyncLog[]; reconcile: ReconciliationResult | null; silverRate: number | null; query: string; setQuery: (value: string) => void; syncBadge: (status: string) => ReactNode; onSync: (product: Product) => void; onSyncAll: () => void; onRetry: (log: ShopifySyncLog) => void }) {
  const filtered = products.filter((product) => !query || [product.name, product.sku].some((value) => value.toLowerCase().includes(query.toLowerCase())));
  const priceBySku = new Map<string, { ourPrice: number; shopifyPrice: number }>();
  for (const match of reconcile?.details.matched ?? []) priceBySku.set(match.sku, { ourPrice: match.ourPrice, shopifyPrice: match.shopifyPrice });
  const synced = products.filter((product) => product.shopify_sync_status === 'Synced').length;
  const pending = products.filter((product) => product.shopify_sync_status === 'Pending').length;
  const failed = products.filter((product) => product.shopify_sync_status === 'Failed').length;
  return <EntitySection title="Products" description="Our product master owns name, SKU, price and publishing status. Changes flow from Opal Line Jewelry to Shopify." action={<button onClick={onSyncAll} className="flex items-center gap-1.5 rounded-md bg-[#4714a1] px-3 py-2 text-[10px] font-bold text-white"><Zap size={12} /> Sync All</button>}><div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">{[['Total', products.length, 'slate'], ['Synced', synced, 'green'], ['Pending', pending, 'amber'], ['Failed', failed, 'red']].map(([label, value, color]) => <div key={label as string} className="rounded-lg bg-slate-50 p-3"><p className="text-[9px] font-semibold text-slate-400">{label as string}</p><p className="mt-1 text-lg font-bold">{value as number}</p><div className="mt-1">{syncBadge(color === 'green' ? 'Synced' : color === 'red' ? 'Failed' : color === 'amber' ? 'Pending' : 'Total')}</div></div>)}</div><SearchBox value={query} onChange={setQuery} placeholder="Search product or SKU..." /><div className="mt-3 overflow-x-auto"><table className="w-full text-[11px]"><thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400"><tr>{['Product', 'SKU', 'Our Price', 'Shopify Price', 'Stock', 'Shopify ID', 'Status', 'Actions'].map((heading) => <th key={heading} className="px-3 py-2.5 text-left font-bold">{heading}</th>)}</tr></thead><tbody>{filtered.map((product) => { const failedLog = logs.find((log) => log.entity_id === product.sku && log.status === 'Failed'); const pricing = priceBySku.get(product.sku); const ourPrice = silverRate !== null && Number(product.net_weight) > 0 ? calculateFinalPrice(product, silverRate) : null; return <tr key={product.id} className="border-t border-slate-50 hover:bg-slate-50/60"><td className="px-3 py-2.5 font-bold">{product.name}</td><td className="px-3 py-2.5 text-slate-500">{product.sku}</td><td className="px-3 py-2.5 font-bold">{ourPrice !== null ? inr(ourPrice) : '—'}</td><td className="px-3 py-2.5 text-slate-500">{pricing ? inr(pricing.shopifyPrice) : product.shopify_sync_status === 'Synced' ? 'Synced' : 'Not reported'}</td><td className="px-3 py-2.5">{product.stock_qty}</td><td className="px-3 py-2.5 text-[9px] text-slate-400">{product.shopify_product_id ? product.shopify_product_id.split('/').pop() : 'Not linked'}</td><td className="px-3 py-2.5">{syncBadge(product.shopify_sync_status)}</td><td className="px-3 py-2.5"><div className="flex gap-1.5"><button onClick={() => onSync(product)} className="rounded-md bg-purple-50 px-2 py-1 text-[9px] font-bold text-[#6f39bd]">Reconcile</button>{failedLog && <button onClick={() => onRetry(failedLog)} className="rounded-md bg-orange-50 px-2 py-1 text-[9px] font-bold text-orange-600">Retry</button>}</div></td></tr>; })}</tbody></table>{filtered.length === 0 && <EmptyState message="No products match your search" />}</div></EntitySection>;
}

function InventoryView({ products, logs, reconcile, syncBadge, onSync, onRetry }: { products: Product[]; logs: ShopifySyncLog[]; reconcile: ReconciliationResult | null; syncBadge: (status: string) => ReactNode; onSync: () => void; onRetry: (log: ShopifySyncLog) => void }) {
  const invBySku = new Map<string, { shopifyStock: number | null; difference: number | null }>();
  for (const mismatch of reconcile?.details.inventoryMismatch ?? []) invBySku.set(mismatch.sku, { shopifyStock: mismatch.shopifyStock, difference: mismatch.difference });
  return <EntitySection title="Inventory" description="Our inventory system is the source of truth. Purchases and internal sales update stock here, then stock updates flow to Shopify. External Shopify edits are flagged and corrected, never imported." action={<button onClick={onSync} className="flex items-center gap-1.5 rounded-md bg-[#4714a1] px-3 py-2 text-[10px] font-bold text-white"><RefreshCw size={12} /> Sync Inventory</button>}><div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-4 text-[10px] font-bold text-slate-600"><span className="flex items-center gap-1.5"><ArrowUpFromLine size={14} className="text-[#6f39bd]" /> OUR INVENTORY</span><ArrowRight size={14} className="text-slate-400" /><span className="flex items-center gap-1.5"><ShoppingBag size={14} className="text-[#6f39bd]" /> SHOPIFY STOCK</span><span className="ml-auto font-normal text-slate-400">Shopify orders flow back into our system</span></div><div className="overflow-x-auto"><table className="w-full text-[11px]"><thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400"><tr>{['Product', 'SKU', 'Our Stock', 'Shopify Stock', 'Difference', 'Status', 'Last Event'].map((heading) => <th key={heading} className="px-3 py-2.5 text-left font-bold">{heading}</th>)}</tr></thead><tbody>{products.map((product) => { const log = logs.find((item) => item.entity_id === product.sku); const issue = product.shopify_sync_status === 'Failed' || Boolean(log?.error_message); const inventory = invBySku.get(product.sku); return <tr key={product.id} className="border-t border-slate-50"><td className="px-3 py-2.5 font-bold">{product.name}</td><td className="px-3 py-2.5 text-slate-500">{product.sku}</td><td className="px-3 py-2.5 font-bold">{product.stock_qty}</td><td className="px-3 py-2.5 text-slate-400">{inventory ? inventory.shopifyStock ?? '—' : product.shopify_sync_status === 'Synced' ? 'Synced' : 'Not reported'}</td><td className={`px-3 py-2.5 ${inventory && inventory.difference !== null && inventory.difference !== 0 ? 'font-bold text-orange-600' : 'text-slate-400'}`}>{inventory && inventory.difference !== null ? (inventory.difference === 0 ? 'In sync' : (inventory.difference > 0 ? '+' : '') + inventory.difference) : '—'}</td><td className="px-3 py-2.5">{issue ? syncBadge('Failed') : syncBadge(log?.status || product.shopify_sync_status)}</td><td className="px-3 py-2.5 text-[9px] text-slate-400">{log ? formatDate(log.synced_at ?? log.created_at) : '—'}{log?.status === 'Failed' && <button onClick={() => onRetry(log)} className="ml-2 font-bold text-orange-600">Retry</button>}</td></tr>; })}</tbody></table>{products.length === 0 && <EmptyState message="No products available" />}</div></EntitySection>;
}

function OrdersView({ logs, syncBadge, onSync, onRetry }: { logs: ShopifySyncLog[]; syncBadge: (status: string) => ReactNode; onSync: () => void; onRetry: (log: ShopifySyncLog) => void }) {
  return <EntitySection title="Orders" description="Shopify owns online orders. Imports become Draft ERP sales orders for confirmation at the counter." action={<button onClick={onSync} className="flex items-center gap-1.5 rounded-md bg-[#4714a1] px-3 py-2 text-[10px] font-bold text-white"><ArrowDownToLine size={12} /> Import Orders</button>}><div className="mb-4 flex items-center gap-3 rounded-lg bg-slate-50 p-4 text-[11px] text-slate-600"><AlertTriangle size={18} className="text-[#6f39bd]" /><span><b>Draft orders auto-created.</b> Imported Shopify orders become Draft sales orders in the ERP. Open <b>Sales Orders</b> and confirm them to convert into invoices.</span></div><div className="overflow-x-auto"><table className="w-full text-[11px]"><thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400"><tr>{['Shopify Order', 'Customer', 'Date', 'Operation', 'Status', 'Sync', 'Action'].map((heading) => <th key={heading} className="px-3 py-2.5 text-left font-bold">{heading}</th>)}</tr></thead><tbody>{logs.map((log) => <tr key={log.id} className="border-t border-slate-50"><td className="px-3 py-2.5 font-bold text-[#5419b5]">{log.entity_name}</td><td className="px-3 py-2.5 text-slate-500">Customer from Shopify</td><td className="px-3 py-2.5 text-[9px] text-slate-400">{formatDate(log.synced_at ?? log.created_at)}</td><td className="px-3 py-2.5 text-[9px] text-slate-500">{log.operation || 'import'}</td><td className="px-3 py-2.5"><Badge color="slate">Imported</Badge></td><td className="px-3 py-2.5">{syncBadge(log.status)}</td><td className="px-3 py-2.5">{log.status === 'Failed' && <button onClick={() => onRetry(log)} className="font-bold text-orange-600">Retry</button>}</td></tr>)}</tbody></table>{logs.length === 0 && <EmptyState message="No Shopify orders have been imported yet" />}</div></EntitySection>;
}

function CustomersView({ customers, logs, query, setQuery, syncBadge, onSync, onRetry, blocked = false }: { customers: Customer[]; logs: ShopifySyncLog[]; query: string; setQuery: (value: string) => void; syncBadge: (status: string) => ReactNode; onSync: () => void; onRetry: (log: ShopifySyncLog) => void; blocked?: boolean }) {
  const normalized = query.toLowerCase();
  const rows = customers.filter((customer) => !normalized || [customer.name, customer.email, customer.mobile, customer.shopify_customer_id, customer.customer_code].some((value) => value?.toLowerCase().includes(normalized))).sort((a, b) => (a.source === 'Shopify' ? 1 : 0) - (b.source === 'Shopify' ? 1 : 0));
  return <EntitySection title="Customers" description="Shopify owns online customer identities. Linked profiles keep Shopify Customer IDs alongside our internal customer record for unified sales billing." action={<button onClick={onSync} className="flex items-center gap-1.5 rounded-md bg-[#4714a1] px-3 py-2 text-[10px] font-bold text-white"><RefreshCw size={12} /> Sync Customers</button>}>{blocked && <div className="mb-4 flex items-center gap-3 rounded-lg bg-orange-50 p-4 text-[11px] text-orange-700"><AlertTriangle size={18} /><span><b>Automated customer sync is unavailable on this store plan</b> (Shopify PII restriction). Create customers manually at the counter — Shopify orders link automatically when customer details are available.</span></div>}<SearchBox value={query} onChange={setQuery} placeholder="Search customer by name, mobile, email..." /><div className="mt-3 overflow-x-auto"><table className="w-full text-[11px]"><thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400"><tr>{['Customer', 'Email', 'Source', 'Shopify ID', 'Purchase History', 'Status', 'Action'].map((heading) => <th key={heading} className="px-3 py-2.5 text-left font-bold">{heading}</th>)}</tr></thead><tbody>{rows.map((customer) => { const log = logs.find((item) => item.entity_id === customer.shopify_customer_id); return <tr key={customer.id} className="border-t border-slate-50"><td className="px-3 py-2.5 font-bold">{customer.name}</td><td className="px-3 py-2.5 text-slate-500">{customer.email || '—'}</td><td className="px-3 py-2.5"><Badge color={customer.source === 'Internal' ? 'slate' : customer.source === 'Linked' ? 'green' : 'violet'}>{customer.source === 'Internal' ? 'Internal' : customer.source === 'Linked' ? 'Shopify + Internal' : 'Shopify'}</Badge></td><td className="px-3 py-2.5 text-slate-500">{customer.shopify_customer_id ? '#' + customer.shopify_customer_id.split('/').pop() : '—'}</td><td className="px-3 py-2.5">{customer.source === 'Shopify' ? `${customer.shopify_total_orders ?? 0} orders · ${inr(customer.total_purchases ?? 0)}` : `${customer.invoice_count ?? 0} invoices · ${inr(customer.total_paid ?? 0)} paid`}</td><td className="px-3 py-2.5">{customer.shopify_customer_id ? <Badge color="green">Linked</Badge> : <Badge color="slate">—</Badge>}</td><td className="px-3 py-2.5">{log?.status === 'Failed' && <button onClick={() => onRetry(log)} className="font-bold text-orange-600">Retry</button>}</td></tr>; })}</tbody></table>{rows.length === 0 && <EmptyState message="No customers match your search" />}</div></EntitySection>;
}

function ReconciliationView({ result, busy, silverRate, onRun, onPushProducts, onPushInventory }: { result: ReconciliationResult | null; busy: boolean; silverRate: number | null; onRun: () => void; onPushProducts: () => void; onPushInventory: () => void }) {
  if (!result) return <EntitySection title="Reconciliation" description="Compare the ERP product master against Shopify. Missing records and price or stock mismatches are surfaced before any write is made." action={<button onClick={onRun} disabled={busy} className="flex items-center gap-1.5 rounded-md bg-[#4714a1] px-3 py-2 text-[10px] font-bold text-white disabled:opacity-60"><Scale size={12} /> {busy ? 'Comparing...' : 'Run Reconciliation'}</button>}><EmptyState message="Run a reconciliation to compare ERP and Shopify product data" /></EntitySection>;
  const s = result.summary;
  const cards = [
    ['Matched', s.matched, 'green'],
    ['Missing in Shopify', s.missingInShopify, 'orange'],
    ['Missing in Billing', s.missingInBilling, 'amber'],
    ['Price mismatches', s.priceMismatch, 'orange'],
    ['Inventory mismatches', s.inventoryMismatch, 'orange'],
  ] as const;
  return <div className="space-y-4">
    <EntitySection title="Reconciliation" description={`Comparison run at ${formatDate(result.ranAt)} against silver rate ${inr(result.silverRate)}/g. ERP is authoritative for products, prices and inventory; Shopify is authoritative for orders and online customers.`} action={<div className="flex flex-wrap gap-2"><button onClick={onRun} disabled={busy} className="flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600 disabled:opacity-60"><RefreshCw size={12} /> Re-run</button><button onClick={onPushProducts} className="flex items-center gap-1.5 rounded-md bg-[#4714a1] px-3 py-2 text-[10px] font-bold text-white"><ArrowUpFromLine size={12} /> Push Products</button><button onClick={onPushInventory} className="flex items-center gap-1.5 rounded-md bg-[#4714a1] px-3 py-2 text-[10px] font-bold text-white"><SlidersHorizontal size={12} /> Sync Inventory</button></div>}>
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">{cards.map(([label, value, color]) => <div key={label} className={`rounded-lg p-3 ${color === 'green' ? 'bg-emerald-50' : color === 'amber' ? 'bg-amber-50' : 'bg-orange-50'}`}><p className="text-[9px] font-semibold text-slate-500">{label}</p><p className={`mt-1 text-lg font-bold ${color === 'green' ? 'text-emerald-600' : color === 'amber' ? 'text-amber-600' : 'text-orange-600'}`}>{value}</p></div>)}</div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500"><span>{s.localProducts} local products · {s.shopifyVariants} Shopify variants</span></div>
      <div className="space-y-4">
        <MismatchTable title="Price mismatches" description="Price computed from the ERP formula (metal + charges + GST) differs from the Shopify price. Push Products to fix." rows={result.details.priceMismatch} headers={['SKU', 'Product', 'Our Price', 'Shopify Price', 'Diff']} renderRow={(row) => <><td className="px-3 py-2 font-bold">{row.sku}</td><td className="px-3 py-2 text-slate-500">{row.name}</td><td className="px-3 py-2 font-bold">{inr(row.ourPrice)}</td><td className="px-3 py-2 text-slate-500">{inr(row.shopifyPrice)}</td><td className={`px-3 py-2 font-bold ${row.diff < 0 ? 'text-emerald-600' : 'text-orange-600'}`}>{inr(row.diff)}</td></>} empty="No price mismatches — pricing is in sync" />
        <MismatchTable title="Inventory mismatches" description="ERP stock differs from Shopify stock. Our inventory is authoritative; Sync Inventory corrects Shopify." rows={result.details.inventoryMismatch} headers={['SKU', 'Product', 'Our Stock', 'Shopify Stock', 'Difference']} renderRow={(row) => <><td className="px-3 py-2 font-bold">{row.sku}</td><td className="px-3 py-2 text-slate-500">{row.name}</td><td className="px-3 py-2 font-bold">{row.ourStock}</td><td className="px-3 py-2 text-slate-500">{row.shopifyStock ?? '—'}</td><td className={`px-3 py-2 font-bold ${(row.difference ?? 0) === 0 ? 'text-emerald-600' : 'text-orange-600'}`}>{row.difference ?? '—'}</td></>} empty="No inventory mismatches — stock is in sync" />
        <MismatchTable title="Missing in Shopify" description="Active ERP products with no matching Shopify variant by SKU. Push Products creates them." rows={result.details.missingInShopify} headers={['SKU', 'Product', 'Our Price', 'ERP Stock']} renderRow={(row) => <><td className="px-3 py-2 font-bold">{row.sku}</td><td className="px-3 py-2 text-slate-500">{row.name}</td><td className="px-3 py-2 font-bold">{inr(row.ourPrice)}</td><td className="px-3 py-2 text-slate-500">{row.stock}</td></>} empty="No active products missing from Shopify" />
        <MismatchTable title="Missing in Billing" description="Shopify variants that do not exist in the ERP product master. Discovery imports create a record when they are synced." rows={result.details.missingInBilling} headers={['SKU', 'Shopify Title', 'Shopify Price', 'Shopify Stock']} renderRow={(row) => <><td className="px-3 py-2 font-bold">{row.sku}</td><td className="px-3 py-2 text-slate-500">{row.title}</td><td className="px-3 py-2 font-bold">{inr(row.price)}</td><td className="px-3 py-2 text-slate-500">{row.inventoryQuantity ?? '—'}</td></>} empty="No Shopify products missing from billing" />
      </div>
    </EntitySection>
  </div>;
}

function MismatchTable<T>({ title, description, rows, headers, renderRow, empty }: { title: string; description: string; rows: T[]; headers: string[]; renderRow: (row: T) => ReactNode; empty: string }) {
  return <div className="rounded-lg border border-slate-100"><div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{title} <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[8px] text-slate-500">{rows.length}</span></p></div>{rows.length === 0 ? <p className="px-3 py-3 text-[10px] text-emerald-600">{empty}</p> : <div className="overflow-x-auto"><table className="w-full text-[11px]"><thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400"><tr>{headers.map((heading) => <th key={heading} className="px-3 py-2 text-left font-bold">{heading}</th>)}</tr></thead><tbody>{rows.slice(0, 50).map((row, index) => <tr key={index} className="border-t border-slate-50">{renderRow(row)}</tr>)}</tbody></table></div>}</div>;
}

function FlagsView({ flags, onResolve }: { flags: ShopifySyncFlag[]; onResolve: (flag: ShopifySyncFlag) => void }) {
  return <EntitySection title="External Change Flags" description="Changes detected coming from Shopify that contradict ERP ownership. ERP stays authoritative; product and inventory values are restored on the next sync. Review and resolve each flag."><div className="mb-4 flex items-center gap-3 rounded-lg bg-orange-50 p-4 text-[11px] text-orange-700"><AlertTriangle size={18} /><span><b>{flags.length} open flag{flags.length === 1 ? '' : 's'}.</b> External Shopify edits are never imported silently — they are flagged for review.</span></div>{flags.length === 0 ? <EmptyState message="No external change flags — everything is in sync" /> : <div className="overflow-x-auto"><table className="w-full text-[11px]"><thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400"><tr>{['Time', 'SKU', 'Category', 'Shopify Value', 'Our Value', 'Remarks', 'Action'].map((heading) => <th key={heading} className="px-3 py-2.5 text-left font-bold">{heading}</th>)}</tr></thead><tbody>{flags.map((flag) => <tr key={flag.id} className="border-t border-slate-50"><td className="px-3 py-2.5 text-[9px] text-slate-400">{formatDate(flag.created_at)}</td><td className="px-3 py-2.5 font-bold">{flag.product_sku || '—'}</td><td className="px-3 py-2.5"><Badge color="orange">{flag.category.replace(/_/g, ' ')}</Badge></td><td className="px-3 py-2.5 text-slate-500">{flag.shopify_value || '—'}</td><td className="px-3 py-2.5 text-slate-500">{flag.our_value || '—'}</td><td className="px-3 py-2.5 text-slate-500">{flag.remarks || '—'}</td><td className="px-3 py-2.5"><button onClick={() => onResolve(flag)} className="flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[9px] font-bold text-emerald-600"><CheckCircle2 size={12} /> Resolve</button></td></tr>)}</tbody></table></div>}</EntitySection>;
}

function ErrorsView({ logs, onRetry }: { logs: ShopifySyncLog[]; onRetry: (log: ShopifySyncLog) => void }) {
  return <EntitySection title="Sync Errors" description="Failures are retained for review and retry. Resolve these before treating the integration as healthy."><div className="mb-4 flex items-center gap-3 rounded-lg bg-red-50 p-4 text-[11px] text-red-700"><AlertCircle size={18} /><span><b>{logs.length} errors require attention.</b> Failed writes are not silently discarded.</span></div>{logs.length === 0 ? <EmptyState message="No sync errors — everything is running smoothly" /> : <div className="overflow-x-auto"><table className="w-full text-[11px]"><thead className="bg-slate-50 text-[9px] uppercase tracking-wider text-slate-400"><tr>{['Time', 'Type', 'Direction', 'Operation', 'Record', 'Error', 'Attempts', 'Action'].map((heading) => <th key={heading} className="px-3 py-2.5 text-left font-bold">{heading}</th>)}</tr></thead><tbody>{logs.map((log) => <tr key={log.id} className="border-t border-slate-50"><td className="px-3 py-2.5 text-[9px] text-slate-400">{formatDate(log.synced_at ?? log.created_at)}</td><td className="px-3 py-2.5"><Badge color="slate">{log.sync_type}</Badge></td><td className="px-3 py-2.5 text-[9px] text-slate-500">{log.direction || '—'}</td><td className="px-3 py-2.5 text-[9px] text-slate-500">{log.operation || '—'}</td><td className="px-3 py-2.5 font-bold">{log.entity_name}</td><td className="px-3 py-2.5 text-red-600">{log.error_message || 'Operation failed'}</td><td className="px-3 py-2.5">{log.attempts}x</td><td className="px-3 py-2.5"><button onClick={() => onRetry(log)} className="flex items-center gap-1 rounded-md bg-orange-50 px-2 py-1 text-[10px] font-bold text-orange-600"><RotateCw size={12} /> Retry</button></td></tr>)}</tbody></table></div>}</EntitySection>;
}

function EntitySection({ title, description, action, children }: { title: string; description: string; action?: ReactNode; children: ReactNode }) { return <section className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm md:p-5"><div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-base font-bold">{title}</h3><p className="mt-1 max-w-3xl text-[10px] leading-relaxed text-slate-500">{description}</p></div>{action}</div>{children}</section>; }
function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) { return <div className="flex h-9 max-w-sm items-center gap-2 rounded-md bg-slate-50 px-3 text-slate-400"><Search size={14} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full bg-transparent text-xs outline-none placeholder:text-slate-400" /></div>; }
function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-[9px] font-semibold text-slate-400">{label}</p><p className="mt-1 truncate font-bold text-slate-700">{value}</p></div>; }
function Activity({ logs, syncBadge }: { logs: ShopifySyncLog[]; syncBadge: (status: string) => ReactNode }) { return <div className="mt-4 space-y-3">{logs.slice(0, 6).map((log) => <div key={log.id} className="flex gap-3"><div className={`mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full ${log.status === 'Failed' ? 'bg-red-50 text-red-500' : log.status === 'Flagged' ? 'bg-orange-50 text-orange-500' : 'bg-emerald-50 text-emerald-500'}`}>{log.status === 'Failed' ? <AlertCircle size={13} /> : log.status === 'Flagged' ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}</div><div className="flex-1 border-b border-slate-50 pb-3"><div className="flex items-start justify-between gap-2"><div><p className="text-[10px] font-bold">{log.sync_type} · {log.entity_name}{log.operation ? ` · ${log.operation.replace(/_/g, ' ')}` : ''}</p><p className="mt-0.5 text-[9px] text-slate-400">{formatDate(log.synced_at ?? log.created_at)}{log.direction ? ` · ${log.direction === 'import' ? 'Shopify → ERP' : 'ERP → Shopify'}` : ''}{log.error_message ? ` · ${log.error_message}` : ''}</p></div>{syncBadge(log.status)}</div></div></div>)}{logs.length === 0 && <EmptyState message="No sync activity recorded yet" />}</div>; }
function formatDate(value: string) { return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); }
function ConnectionSettings({ connection, onClose, onTest }: { connection: ShopifyStatus; onClose: () => void; onTest: () => void }) { return <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onClick={onClose}><div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}><div className="mb-4 flex items-center justify-between"><div><p className="text-sm font-bold">Shopify Connection</p><p className="mt-1 text-[10px] text-slate-400">Credentials are never displayed in this panel.</p></div><button onClick={onClose}><X size={16} /></button></div><div className="space-y-3 text-[11px]"><div className={`flex items-center justify-between rounded-lg p-3 ${connection.connected ? 'bg-emerald-50' : 'bg-orange-50'}`}><span className={`flex items-center gap-2 font-bold ${connection.connected ? 'text-emerald-700' : 'text-orange-700'}`}><Wifi size={14} /> {connection.connected ? 'Connected' : 'Not connected'}</span><Badge color={connection.connected ? 'green' : 'amber'}>{connection.connected ? 'Healthy' : 'Action required'}</Badge></div><Info label="Store" value={connection.storeDomain || 'Not configured'} /><Info label="API" value={connection.apiVersion ? `GraphQL Admin API · ${connection.apiVersion}` : 'GraphQL Admin API'} /><Info label="Webhooks" value="Products, inventory, orders and customers topics supported" /><Info label="Status" value={connection.message || 'Connection is healthy'} /></div><div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="rounded-md border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600">Close</button><button onClick={onTest} className="rounded-md bg-[#4714a1] px-3 py-2 text-[10px] font-bold text-white">Test Connection</button></div></div></div>; }
