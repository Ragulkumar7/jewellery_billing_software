import { useState, useEffect, useMemo } from 'react';
import {
  Bell, Boxes, CalendarDays, Check, ChevronDown, ChevronLeft, ClipboardList,
  CreditCard, FileBarChart, FileText, Gem, History, LayoutDashboard, Menu, Package, PanelLeft,
  Receipt, RefreshCw, Search, Settings, ShieldCheck, Sparkles, TrendingUp, Users, Wallet,
} from 'lucide-react';
import { api, clearToken, getToken, login, logout, type ApiUser } from '@/lib/api';
import { useSilverRate } from '@/lib/silver-rate-context';
import SalesInvoices from '@/views/SalesInvoices';
import SalesOrders from '@/views/SalesOrders';
import Customers from '@/views/Customers';
import Returns from '@/views/Returns';
import PurchaseOrders from '@/views/PurchaseOrders';
import PurchaseInvoices from '@/views/PurchaseInvoices';
import GRNModule from '@/views/GRN';
import Suppliers from '@/views/Suppliers';
import PurchaseReturns from '@/views/PurchaseReturns';
import SalesReport from '@/views/reports/SalesReport';
import BusinessReport from '@/views/reports/BusinessReport';
import GstReport from '@/views/reports/GstReport';
import SalesAnalytics from '@/views/reports/SalesAnalytics';
import InventoryReport from '@/views/reports/InventoryReport';
import UserRoles from '@/views/system/UserRoles';
import SettingsView from '@/views/system/Settings';
import ActivityLogView from '@/views/system/ActivityLog';
import Products from '@/views/Products';
import StockOverview from '@/views/StockOverview';
import LowStockAlert from '@/views/LowStockAlert';
import ShopifySync from '@/views/ShopifySync';
import SilverRate from '@/views/SilverRate';
import Expenses from '@/views/Expenses';
import Payments from '@/views/Payments';
import PurchaseSystem from '@/views/PurchaseSystem';
import Ledger from '@/views/Ledger';
import Dashboard from '@/views/Dashboard';

type NavGroup = { title: string; items: { label: string; icon: typeof LayoutDashboard }[] };

const groups: NavGroup[] = [
  { title: 'Main', items: [{ label: 'Dashboard', icon: LayoutDashboard }] },
  { title: 'Sales', items: [{ label: 'Sales Invoices', icon: FileText }, { label: 'Sales Orders', icon: ClipboardList }, { label: 'Customers', icon: Users }, { label: 'Returns', icon: History }] },
  { title: 'Purchases', items: [{ label: 'Purchase Orders', icon: FileText }, { label: 'Purchase Invoices', icon: Receipt }, { label: 'GRN / Stock Receive', icon: Boxes }, { label: 'Suppliers', icon: Users }, { label: 'Purchase Returns', icon: History }] },
  { title: 'Inventory', items: [{ label: 'Products', icon: Gem }, { label: 'Stock Overview', icon: Package }, { label: 'Low Stock Alert', icon: Bell }] },
  { title: 'Sync', items: [{ label: 'Shopify Sync', icon: RefreshCw }, { label: 'Silver Rate', icon: TrendingUp }] },
  { title: 'Accounts', items: [{ label: 'Expense', icon: Wallet }, { label: 'Payments', icon: CreditCard }, { label: 'Purchase System', icon: Receipt }, { label: 'Ledger', icon: FileText }] },
  { title: 'Reports', items: [{ label: 'Business Reports', icon: FileBarChart }, { label: 'Sales Report', icon: FileText }, { label: 'GST Reports', icon: ShieldCheck }, { label: 'Sales Analysis', icon: TrendingUp }, { label: 'Inventory Reports', icon: Boxes }] },
  { title: 'System', items: [{ label: 'Users & Roles', icon: Users }, { label: 'Settings', icon: Settings }, { label: 'Activity Log', icon: History }] },
];

const implemented = new Set(['Dashboard', 'Sales Invoices', 'Sales Orders', 'Customers', 'Returns', 'Purchase Orders', 'Purchase Invoices', 'GRN / Stock Receive', 'Suppliers', 'Purchase Returns', 'Products', 'Stock Overview', 'Low Stock Alert', 'Shopify Sync', 'Silver Rate', 'Expense', 'Payments', 'Purchase System', 'Ledger', 'Business Reports', 'Sales Report', 'GST Reports', 'Sales Analysis', 'Inventory Reports', 'Users & Roles', 'Settings', 'Activity Log']);

const headings: Record<string, string> = {
  'Dashboard': 'Dashboard Overview',
  'Sales Invoices': 'Sales Invoices',
  'Sales Orders': 'Sales Orders',
  'Customers': 'Customers',
  'Returns': 'Sales Returns',
  'Purchase Orders': 'Purchase Orders',
  'Purchase Invoices': 'Purchase Invoices',
  'GRN / Stock Receive': 'Goods Receipt Note',
  'Suppliers': 'Supplier Management',
  'Purchase Returns': 'Purchase Returns',
  'Products': 'Products',
  'Stock Overview': 'Stock Overview',
  'Low Stock Alert': 'Low Stock Alert',
  'Shopify Sync': 'Shopify Sync',
  'Silver Rate': 'Silver Rate Management',
  'Expense': 'Expenses',
  'Payments': 'Payments',
  'Purchase System': 'Purchase System',
  'Ledger': 'Ledger',
  'Business Reports': 'Business Reports',
  'Sales Report': 'Sales Report',
  'GST Reports': 'GST Reports',
  'Sales Analysis': 'Sales Analytics',
  'Inventory Reports': 'Inventory Reports',
  'Users & Roles': 'Users & Roles',
  'Settings': 'System Settings',
  'Activity Log': 'Activity Log',
};

const subheadings: Record<string, string> = {
  'Dashboard': 'Business health at a glance — sales, purchases, receivables, stock position, silver rate and Shopify sync for the selected period.',
  'Sales Invoices': 'Every sale needs an identifiable customer — create invoices, confirm drafts, record payments and print.',
  'Sales Orders': 'Create and track sales orders — confirm, convert to invoices, and control cancellations.',
  'Customers': 'Manage customer profiles, Shopify customers and purchase history.',
  'Returns': 'Process returns and exchanges against sales invoices.',
  'Purchase Orders': 'Create and track purchase orders — submit, approve, and receive stock against them.',
  'Purchase Invoices': 'Record what the supplier billed — approve to create the payable, then track payments.',
  'GRN / Stock Receive': 'Receive stock against approved POs — verify quantities, weights, and update inventory.',
  'Suppliers': 'Maintain supplier master data — contacts, bank details, balances, and purchase history.',
  'Purchase Returns': 'Return damaged, defective or incorrect goods to suppliers and adjust stock.',
  'Products': 'Product master list — manage all jewellery items, pricing, stock and Shopify sync.',
  'Stock Overview': 'Current inventory position at a glance — summary, stock list and history.',
  'Low Stock Alert': 'Products that need attention before they run out of stock.',
  'Shopify Sync': 'Control center for syncing products, inventory and orders with Shopify.',
  'Silver Rate': 'Manage 92.5 silver rates — update, review history, and recalculate product prices.',
  'Expense': 'Record and track business expenses by category, payment method, and approval status.',
  'Payments': 'Track money received and paid — customer receipts, supplier payments, expense payments, and refunds.',
  'Purchase System': 'Financial view of purchases — invoice amounts, GST, payments and outstanding balances.',
  'Ledger': 'Complete transaction history with running balance — traceable financial records.',
  'Business Reports': 'Business performance overview — sales, purchases, expenses, profit and trends.',
  'Sales Report': 'Detailed sales breakdowns by day, week, month, product, customer and more.',
  'GST Reports': 'GST summary for sales and purchases — output, input and net position.',
  'Sales Analysis': 'Deep-dive analytics on products, customers, channels, payments and silver weight.',
  'Inventory Reports': 'Stock summary, movement history and product analysis — fast/slow movers.',
  'Users & Roles': 'Manage system users and role-based permissions across all modules.',
  'Settings': 'Configure business, invoice, tax, payment, inventory, silver rate, Shopify and notification settings.',
  'Activity Log': 'Audit trail of every important action — who did what, when, and what changed.',
};

// ---------- Dashboard date range ----------

type RangeKey = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'all';

const RANGE_PRESETS: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'quarter', label: 'This Quarter' },
  { key: 'year', label: 'This Year' },
  { key: 'all', label: 'All Time' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatRange(from: string, to: string): string {
  if (!from || !to) return 'All Time';
  if (from === to) {
    const [y, m, d] = from.split('-').map(Number);
    return `${d} ${MONTHS[m - 1]} ${y}`;
  }
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  if (fy === ty && fm === tm) return `${fd} – ${td} ${MONTHS[tm - 1]} ${ty}`;
  if (fy === ty) return `${fd} ${MONTHS[fm - 1]} – ${td} ${MONTHS[tm - 1]} ${ty}`;
  return `${fd} ${MONTHS[fm - 1]} ${fy} – ${td} ${MONTHS[tm - 1]} ${ty}`;
}

function computeRange(key: RangeKey): { from: string; to: string; display: string } {
  const now = new Date();
  const today = toDateStr(now);
  switch (key) {
    case 'today': return { from: today, to: today, display: formatRange(today, today) };
    case 'week': {
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      const from = toDateStr(monday);
      return { from, to: today, display: formatRange(from, today) };
    }
    case 'month': {
      const from = `${today.slice(0, 8)}01`;
      return { from, to: today, display: formatRange(from, today) };
    }
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3) * 3;
      const from = `${now.getFullYear()}-${String(q + 1).padStart(2, '0')}-01`;
      return { from, to: today, display: formatRange(from, today) };
    }
    case 'year': {
      const from = `${now.getFullYear()}-01-01`;
      return { from, to: today, display: formatRange(from, today) };
    }
    case 'all': return { from: '2000-01-01', to: today, display: 'All Time' };
  }
}

function App() {
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(groups.map((g) => [g.title, true])));
  const [active, setActive] = useState('Dashboard');
  const [sidebar, setSidebar] = useState(true);
  const [rangeKey, setRangeKey] = useState<RangeKey>('month');
  const [rangeOpen, setRangeOpen] = useState(false);
  const range = useMemo(() => computeRange(rangeKey), [rangeKey]);
  const { currentRate: rate } = useSilverRate();
  const [currentUser, setCurrentUser] = useState<ApiUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) { setAuthLoading(false); return; }
    api<ApiUser>('/api/auth/me').then(setCurrentUser).catch(() => { clearToken(); }).finally(() => setAuthLoading(false));
  }, []);


  const toggle = (title: string) => setOpen((c) => ({ ...c, [title]: !c[title] }));
  const navigate = (v: string) => setActive(v);

  function renderView() {
    switch (active) {
      case 'Sales Invoices': return <SalesInvoices permissions={currentUser?.permissions || []} onNavigate={navigate} />;
      case 'Sales Orders': return <SalesOrders permissions={currentUser?.permissions || []} />;
      case 'Customers': return <Customers permissions={currentUser?.permissions || []} />;
      case 'Returns': return <Returns />;
      case 'Purchase Orders': return <PurchaseOrders permissions={currentUser?.permissions || []} />;
      case 'Purchase Invoices': return <PurchaseInvoices permissions={currentUser?.permissions || []} />;
      case 'GRN / Stock Receive': return <GRNModule permissions={currentUser?.permissions || []} />;
      case 'Suppliers': return <Suppliers permissions={currentUser?.permissions || []} />;
      case 'Purchase Returns': return <PurchaseReturns permissions={currentUser?.permissions || []} />;
      case 'Products': return <Products />;
      case 'Stock Overview': return <StockOverview />;
      case 'Low Stock Alert': return <LowStockAlert onNavigate={navigate} />;
      case 'Shopify Sync': return <ShopifySync />;
      case 'Silver Rate': return <SilverRate />;
      case 'Expense': return <Expenses permissions={currentUser?.permissions || []} />;
      case 'Payments': return <Payments permissions={currentUser?.permissions || []} />;
      case 'Purchase System': return <PurchaseSystem permissions={currentUser?.permissions || []} onNavigate={navigate} />;
      case 'Ledger': return <Ledger permissions={currentUser?.permissions || []} onNavigate={navigate} />;
      case 'Business Reports': return <BusinessReport permissions={currentUser?.permissions || []} />;
      case 'Sales Report': return <SalesReport permissions={currentUser?.permissions || []} onNavigate={navigate} />;
      case 'GST Reports': return <GstReport permissions={currentUser?.permissions || []} />;
      case 'Sales Analysis': return <SalesAnalytics permissions={currentUser?.permissions || []} />;
      case 'Inventory Reports': return <InventoryReport permissions={currentUser?.permissions || []} onNavigate={navigate} />;
       case 'Users & Roles': return <UserRoles permissions={currentUser?.permissions || []} />;
      case 'Settings': return <SettingsView permissions={currentUser?.permissions || []} />;
      case 'Activity Log': return <ActivityLogView />;
      case 'Dashboard': return <Dashboard onNavigate={navigate} from={range.from} to={range.to} showComparison={rangeKey !== 'all'} />;
      default: return <ComingSoon title={active} />;
    }
  }

  if (authLoading) return <div className="grid min-h-screen place-items-center bg-[#f7f8fc] text-sm text-slate-500">Loading session...</div>;
  if (!currentUser) return <LoginScreen onLogin={setCurrentUser} />;

  return <div className="min-h-screen bg-[#f7f8fc] text-[#1d2945]">
    <aside className={`fixed inset-y-0 left-0 z-30 w-[232px] border-r border-slate-100 bg-white transition-transform duration-300 ${sidebar ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-[72px] items-center gap-3 border-b border-slate-100 px-4"><div className="grid h-9 w-9 place-items-center rounded-lg bg-[#4714a1] text-white shadow-lg shadow-purple-200"><Gem size={21}/></div><div><p className="text-[15px] font-bold leading-tight">Opal Line<br/>Jewelry</p><p className="mt-1 text-[9px] font-semibold text-slate-400">92.5 Sterling Silver<br/>Jewellery</p></div></div>
      <nav className="h-[calc(100vh-72px)] overflow-y-auto px-3 py-4">{groups.map((group) => <div key={group.title} className="mb-4"><button onClick={() => toggle(group.title)} className="mb-1.5 flex w-full items-center justify-between rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-[.14em] text-slate-500 transition hover:text-slate-700">{group.title}<ChevronDown size={14} className={`transition-transform ${open[group.title] ? '' : '-rotate-90'}`}/></button>{open[group.title] && <div className="space-y-0.5">{group.items.map(({label, icon: Icon}) => <button key={label} onClick={() => setActive(label)} className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[11px] font-medium transition ${active === label ? 'bg-[#f0e7ff] font-bold text-[#5419b5]' : 'text-slate-600 hover:bg-slate-50'}`}><Icon size={14}/>{label}{!implemented.has(label) && <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[7px] font-bold text-slate-400">soon</span>}</button>)}</div>}</div>)}<button onClick={async () => { await logout(); setCurrentUser(null); }} className="mt-2 flex w-full items-center gap-2.5 border-t border-slate-100 px-2.5 pt-3 text-[11px] font-medium text-slate-600 transition hover:text-slate-900"><PanelLeft size={14}/> Logout</button></nav>
    </aside>
    <main className={`min-h-screen transition-[margin] duration-300 ${sidebar ? 'ml-[232px]' : 'ml-0'}`}>
      <header className="flex h-[72px] items-center justify-between gap-4 border-b border-slate-100 bg-white px-5 md:px-6"><div className="flex min-w-0 items-center gap-4"><button onClick={() => setSidebar(!sidebar)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">{sidebar ? <ChevronLeft size={16}/> : <Menu size={17}/>}</button><div className="flex h-10 w-[280px] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-slate-500 transition focus-within:border-[#cab4f3] focus-within:bg-white sm:w-[360px] xl:w-[420px]"><Search size={15}/><input className="w-full bg-transparent text-[13px] outline-none placeholder:text-slate-400" placeholder="Search menu, customers, products..."/></div></div><div className="flex shrink-0 items-center gap-4 text-[10px] sm:gap-5"><div className="hidden text-right sm:block"><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">92.5 Silver</p><p className="text-base font-bold text-emerald-600">₹{rate.toFixed(2)} <span className="text-[10px] font-semibold text-slate-500">/g</span></p></div><Bell size={16} className="text-slate-600"/><Settings size={16} className="text-slate-600"/><div className="flex items-center gap-2.5 border-l border-slate-100 pl-4"><div className="hidden text-right sm:block"><p className="text-xs font-bold">{currentUser.name}</p><p className="text-[9px] font-semibold text-slate-400">{currentUser.roles?.[0]?.name && currentUser.roles[0].name !== currentUser.name ? currentUser.roles[0].name : 'Administrator'}</p></div><div className="grid h-8 w-8 place-items-center rounded-lg bg-[#4714a1] text-xs font-bold text-white">{currentUser.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}</div></div></div></header>
      <div className="px-5 py-5 md:px-6 xl:px-8">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div><h1 className="text-xl font-bold">{headings[active] || active}</h1><p className="mt-1 max-w-3xl text-xs text-slate-500">{subheadings[active] || ''}</p></div>
          <div className="relative">
            <button onClick={() => setRangeOpen((v) => !v)} className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:border-[#cab4f3]"><CalendarDays size={14} className="text-slate-400"/>{range.display}<ChevronDown size={13} className={`transition-transform ${rangeOpen ? 'rotate-180' : ''}`}/></button>
            {rangeOpen && <div className="absolute right-0 top-11 z-30 w-44 overflow-hidden rounded-lg border border-slate-100 bg-white py-1 shadow-xl">{RANGE_PRESETS.map((p) => <button key={p.key} onClick={() => { setRangeKey(p.key); setRangeOpen(false); }} className={`flex w-full items-center justify-between px-3 py-2 text-left text-[11px] font-semibold ${rangeKey === p.key ? 'bg-purple-50 text-[#5419b5]' : 'text-slate-600 hover:bg-slate-50'}`}>{p.label}{rangeKey === p.key && <Check size={13}/>}</button>)}</div>}
          </div>
        </div>
        {renderView()}
      </div>
    </main>
  </div>;
}

function LoginScreen({ onLogin }: { onLogin: (user: ApiUser) => void }) {
  const [identity, setIdentity] = useState('manager@opalline.in');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    setError(null);
    try { const user = await login(identity, password); onLogin(user); } catch (authError) { setError(authError instanceof Error ? authError.message : 'Unable to sign in'); }
    setBusy(false);
  }

  return <div className="grid min-h-screen place-items-center bg-[#f7f8fc] p-4 text-[#1d2945]">
    <form onSubmit={(event) => { event.preventDefault(); signIn(); }} className="w-full max-w-sm rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-lg bg-[#4714a1] text-white"><Gem size={21}/></div><div><p className="font-bold">Opal Line Jewelry</p><p className="text-[10px] text-slate-400">Secure staff sign-in</p></div></div>
       <div className="space-y-3"><label className="block text-[10px] font-bold text-slate-500">Email or Username<input required value={identity} onChange={(e) => setIdentity(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-xs outline-none focus:border-[#6f39bd]" /></label><label className="block text-[10px] font-bold text-slate-500">Password<input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-xs outline-none focus:border-[#6f39bd]" /></label></div>
       <p className="mt-3 text-[10px] text-slate-400">Manager: manager@opalline.in · Role administration: master@opalline.in</p>
       {error && <p className="mt-3 text-[10px] font-semibold text-red-500">{error}</p>}
      <button disabled={busy} className="mt-5 w-full rounded-md bg-[#4714a1] py-2.5 text-[11px] font-bold text-white disabled:opacity-50">{busy ? 'Signing in...' : 'Sign In'}</button>
    </form>
  </div>;
}

function ComingSoon({ title }: { title: string }) {
  return <div className="grid place-items-center rounded-xl border border-dashed border-slate-200 bg-white py-20 text-center"><div><div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-purple-50 text-[#6f39bd]"><Sparkles size={24}/></div><p className="text-sm font-bold">{title}</p><p className="mt-1 text-xs text-slate-400">This module is part of the upcoming build.</p></div></div>;
}

export default App;
