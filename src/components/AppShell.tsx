import type { ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, Boxes, Home, LogOut, Package, ReceiptText, Settings, ShieldCheck, ShoppingCart, UserCircle, Users } from 'lucide-react';
import { clsx } from 'clsx';
import { useAppStore } from '../store/appStore';
import { StatusPills } from './StatusPills';
import { InstallPrompt } from './InstallPrompt';
import { BusinessSetupPrompt } from './BusinessSetupPrompt';

const adminNavItems = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/pos', label: 'POS', icon: ShoppingCart },
  { to: '/products', label: 'Items', icon: Package },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/account', label: 'Account', icon: UserCircle }
];

const cashierNavItems = [
  { to: '/pos', label: 'POS', icon: ShoppingCart },
  { to: '/receipts', label: 'Sales', icon: ReceiptText },
  { to: '/account', label: 'Account', icon: UserCircle }
];

const moreItems = [
  { to: '/inventory', label: 'Inventory', icon: Boxes, adminOnly: true },
  { to: '/receipts', label: 'Receipts', icon: ReceiptText },
  { to: '/users', label: 'Staff', icon: Users, adminOnly: true },
  { to: '/settings', label: 'Settings', icon: Settings, adminOnly: true }
];

export const AppShell = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentUser = useAppStore((state) => state.currentUser);
  const setUser = useAppStore((state) => state.setUser);
  const businessName = useAppStore((state) => state.settings.businessName);
  const isPOS = location.pathname === '/pos';
  const navItems = currentUser?.role === 'cashier' ? cashierNavItems : adminNavItems;
  const logout = () => {
    setUser(null);
    navigate('/login');
  };

  return (
    <div className="min-h-screen text-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/92 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-teal-700 text-sm font-black text-white shadow-soft">NX</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold leading-tight">{businessName}</span>
              <span className="flex min-w-0 items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                <ShieldCheck size={13} />
                <span className="truncate">{currentUser?.name ?? 'Locked'}</span>
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 sm:flex">
              <StatusPills />
              <InstallPrompt />
            </div>
            <button
              type="button"
              className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-300"
              onClick={logout}
              aria-label="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className="border-b border-slate-200 bg-white/90 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/90 sm:hidden">
        <StatusPills />
      </div>

      <main className={clsx('mx-auto w-full max-w-6xl px-3 pb-28 pt-4 sm:px-4', isPOS && 'max-w-7xl')}>{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:hidden">
        <div className="mx-auto grid max-w-md gap-1" style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-semibold',
                  isActive ? 'bg-teal-700 text-white' : 'text-slate-500 dark:text-slate-400'
                )
              }
            >
              <item.icon size={20} />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <aside className="fixed left-4 top-24 z-20 hidden w-44 space-y-2 lg:block">
        {moreItems.filter((item) => !item.adminOnly || currentUser?.role === 'admin').map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              clsx(
                'flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold shadow-sm',
                isActive ? 'bg-teal-700 text-white' : 'bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300'
              )
            }
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </aside>
      <BusinessSetupPrompt />
    </div>
  );
};
