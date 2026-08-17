import { useState, useEffect } from 'react';
import {
  Activity, Bell, Boxes, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign,
  ClipboardList, Clock3, CreditCard, FileBarChart, FileText, Gem, History, LayoutDashboard, Menu,
  Package, PanelLeft, Receipt, RefreshCw, Search, Settings, ShieldCheck, ShoppingCart, Sparkles, Tags,
  TrendingUp, Truck, Users, Wallet,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { api, clearToken, getToken, login, logout, type ApiUser } from '@/lib/api';
import { useSilverRate } from '@/lib/silver-rate-context';
import { Panel, Footer } from '@/components/ui';
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
  'Dashboard': "Welcome back, Admin. Here's what's happening with your business today.",
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

function App() {
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(groups.map((g) => [g.title, true])));
  const [active, setActive] = useState('Dashboard');
  const [sidebar, setSidebar] = useState(true);
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
      case 'Dashboard': return <MainDashboard onNavigate={navigate} />;
      default: return <ComingSoon title={active} />;
    }
  }

  if (authLoading) return <div className="grid min-h-screen place-items-center bg-[#f7f8fc] text-sm text-slate-500">Loading session...</div>;
  if (!currentUser) return <LoginScreen onLogin={setCurrentUser} />;

  return <div className="min-h-screen bg-[#f7f8fc] text-[#1d2945]">
    <aside className={`fixed inset-y-0 left-0 z-30 w-[190px] border-r border-slate-100 bg-white transition-transform duration-300 ${sidebar ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex h-[72px] items-center gap-3 border-b border-slate-100 px-4"><div className="grid h-9 w-9 place-items-center rounded-lg bg-[#4714a1] text-white shadow-lg shadow-purple-200"><Gem size={21}/></div><div><p className="text-[15px] font-bold leading-tight">Opal Line<br/>Jewelry</p><p className="mt-1 text-[9px] font-semibold text-slate-400">92.5 Sterling Silver<br/>Jewellery</p></div></div>
       <nav className="h-[calc(100vh-72px)] overflow-y-auto px-3 py-4">{groups.map((group) => <div key={group.title} className="mb-3"><button onClick={() => toggle(group.title)} className="mb-1 flex w-full items-center justify-between px-1 text-[9px] font-bold uppercase tracking-[.12em] text-slate-400">{group.title}<ChevronDown size={12} className={`transition-transform ${open[group.title] ? '' : '-rotate-90'}`}/></button>{open[group.title] && <div className="space-y-0.5">{group.items.map(({label, icon: Icon}) => <button key={label} onClick={() => setActive(label)} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[10px] font-medium transition ${active === label ? 'bg-[#f0e7ff] font-bold text-[#5419b5]' : 'text-slate-600 hover:bg-slate-50'}`}><Icon size={13}/>{label}{!implemented.has(label) && <span className="ml-auto rounded bg-slate-100 px-1 text-[7px] font-bold text-slate-400">soon</span>}</button>)}</div>}</div>)}<button onClick={async () => { await logout(); setCurrentUser(null); }} className="mt-1 flex w-full items-center gap-2 border-t border-slate-100 px-2 pt-3 text-[10px] font-medium text-slate-600"><PanelLeft size={14}/> Logout</button></nav>
     </aside>
    <main className={`min-h-screen transition-[margin] duration-300 ${sidebar ? 'ml-[190px]' : 'ml-0'}`}>
       <header className="flex h-[72px] items-center justify-between border-b border-slate-100 bg-white px-6"><div className="flex items-center gap-4"><button onClick={() => setSidebar(!sidebar)} className="grid h-8 w-8 place-items-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50">{sidebar ? <ChevronLeft size={16}/> : <Menu size={17}/>}</button><div className="flex h-10 w-[325px] items-center gap-2 rounded-md bg-slate-50 px-3 text-slate-400"><Search size={15}/><input className="w-full bg-transparent text-xs outline-none placeholder:text-slate-400" placeholder="Search menu, customers, products..."/></div></div><div className="flex items-center gap-5 text-[10px]"><div className="text-right"><p className="text-slate-500">Silver Rate (92.5)</p><p className="font-bold text-emerald-600">₹{rate.toFixed(2)} <span className="font-normal text-slate-500">/ gm</span></p></div><Bell size={16} className="text-slate-600"/><Settings size={16} className="text-slate-600"/><div className="flex items-center gap-2 border-l border-slate-100 pl-4"><div><p className="font-bold">{currentUser.name}</p><p className="text-[8px] font-bold text-slate-400">{currentUser.roles?.[0]?.name || 'STAFF'}</p></div><div className="grid h-8 w-8 place-items-center rounded-lg bg-[#4714a1] text-xs font-bold text-white">{currentUser.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}</div></div></div></header>
      <div className="mx-auto max-w-[1180px] px-6 py-5">
        <div className="mb-4 flex items-start justify-between"><div><h1 className="text-xl font-bold">{headings[active] || active}</h1><p className="mt-1 text-[11px] text-slate-500">{subheadings[active] || ''}</p></div><button className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-[10px] text-slate-600"><CalendarDays size={14}/> Jul 31, 2026 - Aug 07, 2026 <ChevronDown size={12}/></button></div>
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

function MainDashboard({ onNavigate }: { onNavigate: (v: string) => void }) {
  const { currentRate } = useSilverRate();
  return <>
    <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
      {['New Invoice', 'Sales Invoices', 'Customers', 'Products', 'Returns', 'Silver Rate', 'Reports', 'Expense', 'Stock Transfer'].map((item, i) => <button key={item} onClick={() => onNavigate(item === 'New Invoice' ? 'Sales Invoices' : item)} className="flex shrink-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-[10px] font-semibold text-slate-700 shadow-sm hover:border-[#cab4f3] hover:text-[#5419b5]"><Sparkles size={13} className={i === 0 ? 'text-[#5419b5]' : 'text-slate-400'}/>{item}</button>)}
    </div>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
      {[['Today’s Sales', '₹1,24,560', '▲ 18.6% vs yesterday', 'orange', CalendarDays], ['Today’s Purchases', '₹85,230', '▲ 12.4% vs yesterday', 'navy', History], ['Total Orders', '32', '▲ 9.7% vs yesterday', 'teal', ShoppingCart], ['Total Invoices', '47', '▲ 15.2% vs yesterday', 'blue', FileText], ['Gross Profit', '₹39,330', '▲ 21.3% vs yesterday', 'violet', CircleDollarSign], ['Outstanding', '₹1,12,450', '5 Invoices', 'cyan', Wallet]].map(([title, value, sub, color, Icon]) => { const I = Icon as typeof CalendarDays; return <div key={title as string} className={`rounded-xl p-4 text-white shadow-sm bg-${color as string}`}><div className="mb-3 flex items-center justify-between"><p className="text-[10px] font-medium">{title as string}</p><div className="grid h-8 w-8 place-items-center rounded-lg bg-white/20"><I size={16}/></div></div><p className="text-lg font-bold">{value as string}</p><p className="mt-1 text-[9px] text-white/80">{sub as string}</p></div>; })}
    </div>
    <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-6">{[['Total Products','312','Active Products',Package],['Low Stock Items','18','Needs Reorder',Bell],['Total Customers','186','Active Customers',Users],['Total Suppliers','24','Active Suppliers',Users],['Today’s Expenses','₹12,450','',Wallet],['Pending Payments','₹1,12,450','8 Invoices',CreditCard]].map(([a,b,c,Icon]) => { const I = Icon as typeof Package; return <div key={a as string} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-4 shadow-sm"><div><p className="text-[9px] font-semibold text-slate-500">{a as string}</p><p className="mt-2 text-base font-bold">{b as string}</p><p className="mt-1 text-[9px] text-slate-400">{c as string}</p></div><div className="grid h-8 w-8 place-items-center rounded-lg bg-purple-50 text-[#6f39bd]"><I size={16}/></div></div>; })}</div>
    <div className="mt-5 grid gap-3 xl:grid-cols-3"><Panel title="Sales Overview" icon={TrendingUp}><div className="h-44 pt-3"><svg viewBox="0 0 500 160" className="h-full w-full"><path d="M0 124 C55 118 80 110 125 87 S190 67 220 36 S285 77 326 88 S390 87 420 66 S465 52 500 14 V160 H0Z" fill="#fff0e5"/><path d="M0 124 C55 118 80 110 125 87 S190 67 220 36 S285 77 326 88 S390 87 420 66 S465 52 500 14" fill="none" stroke="#fb7a14" strokeWidth="3"/><g fill="#fb7a14">{[0,125,220,326,420,500].map((x) => <circle key={x} cx={x} cy={x===0?124:x===125?87:x===220?36:x===326?88:x===420?66:14} r="4"/>)}</g></svg></div><div className="flex justify-between px-2 text-[9px] text-slate-400"><span>Sat</span><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span></div></Panel><Panel title="Top Selling Products" icon={Gem}><div className="space-y-3 text-[10px]">{['Silver Chain','Silver Ring','Silver Bracelet','Silver Pendant','Silver Earrings'].map((x,i) => <div className="flex items-center justify-between border-b border-slate-50 pb-2" key={x}><span className="flex items-center gap-2"><Gem size={13} className="text-slate-400"/>{x}</span><span className="text-slate-500">{[135,98,75,62,58][i]} gm</span><b>₹{[18900,14210,11250,9610,8520][i].toLocaleString('en-IN')}</b></div>)}</div><Footer text="View All Products"/></Panel><Panel title="Payment Status" icon={CreditCard}><div className="flex items-center justify-center gap-5 py-5"><div className="h-32 w-32 rounded-full" style={{background:'conic-gradient(#ff921e 0 34%, #32b764 34% 99%, #ef5350 99% 100%)'}}><div className="m-7 h-18 w-18 rounded-full bg-white"/></div><div className="space-y-3 text-[10px]"><p><i className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-500"/>Paid<br/><span className="ml-4 text-slate-500">₹2,35,600 (67%)</span></p><p><i className="mr-2 inline-block h-2 w-2 rounded-full bg-orange-400"/>Pending<br/><span className="ml-4 text-slate-500">₹1,12,450 (32%)</span></p><p><i className="mr-2 inline-block h-2 w-2 rounded-full bg-red-400"/>Overdue<br/><span className="ml-4 text-slate-500">₹5,870 (1%)</span></p></div></div><Footer text="View Receivables"/></Panel></div>
    <div className="mt-3 grid gap-3 xl:grid-cols-3"><Panel title="Silver Rate History (92.5)" icon={Activity}><div className="flex justify-between text-[10px] text-emerald-600"><span>₹90</span><b>Today: ₹{currentRate.toFixed(2)} / gm</b></div><div className="mt-3 h-20"><svg viewBox="0 0 500 80" className="h-full w-full"><path d="M0 45 C55 52 75 66 120 58 S180 23 230 28 S290 24 335 33 S390 61 420 48 S470 38 500 10" fill="none" stroke="#29ad65" strokeWidth="2"/></svg></div><div className="flex justify-between text-[9px] text-slate-400"><span>01 Aug</span><span>02 Aug</span><span>03 Aug</span><span>04 Aug</span><span>05 Aug</span><span>06 Aug</span><span>07 Aug</span></div></Panel><Panel title="Low Stock Alert" icon={Bell}><div className="space-y-3 text-[10px]">{['Silver Chain 18 inch','Silver Ring Plain','Silver Bracelet Classic'].map((x,i)=><div className="flex justify-between" key={x}><span className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-slate-100"><Gem size={11}/></span>{x}</span><b className="text-red-500">Stock: {i+2} pcs</b></div>)}</div><Footer text="View All Low Stock"/></Panel><Panel title="Recent Activities" icon={Activity}><div className="space-y-3 text-[10px]">{[`Silver rate updated to ₹${currentRate.toFixed(2)} / gm`,'Purchase Invoice PI–2026–087 created','Sales Invoice SI–2026–194 created','Payment received from Rajesh Jewellers'].map((x,i)=><div className="flex justify-between" key={x}><span className="flex items-center gap-2"><Clock3 size={12} className="text-[#6f39bd]"/>{x}</span><span className="text-[9px] text-slate-400">{i?`Today, 08:${45-i*7} AM`:'Today, 09:00 AM'}</span></div>)}</div><Footer text="View All Activities"/></Panel></div>
  </>;
}

export default App;
