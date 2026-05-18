import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { UpdatePrompt } from './components/UpdatePrompt';
import { initializeDatabase, getSettings } from './db/seed';
import { AccountPage } from './features/account/AccountPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { InventoryPage } from './features/inventory/InventoryPage';
import { LoginPage } from './features/auth/LoginPage';
import { POSPage } from './features/pos/POSPage';
import { ProductsPage } from './features/products/ProductsPage';
import { ReceiptsPage } from './features/receipts/ReceiptsPage';
import { ReportsPage } from './features/reports/ReportsPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { UsersPage } from './features/users/UsersPage';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { syncService } from './services/syncService';
import { useAppStore } from './store/appStore';
import { useAutoLock } from './hooks/useAutoLock';
import { useOnlineStatus } from './hooks/useOnlineStatus';

const ShellRoute = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <AppShell>{children}</AppShell>
  </ProtectedRoute>
);

export default function App() {
  const [ready, setReady] = useState(false);
  const setSettings = useAppStore((state) => state.setSettings);
  const settings = useAppStore((state) => state.settings);
  const setPendingSync = useAppStore((state) => state.setPendingSync);
  useOnlineStatus();
  useAutoLock();

  useEffect(() => {
    let mounted = true;
    void initializeDatabase()
      .then(getSettings)
      .then((loadedSettings) => {
        if (!mounted) return;
        setSettings(loadedSettings);
        document.documentElement.classList.toggle('dark', loadedSettings.theme === 'dark');
        setReady(true);
      });
    const unsubscribe = syncService.subscribe(setPendingSync);
    syncService.start();
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [setPendingSync, setSettings]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.theme === 'dark');
  }, [settings.theme]);

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center text-slate-900 dark:text-white">
        <div>
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-lg bg-teal-700 text-lg font-black text-white">NX</div>
          <p className="font-semibold">Starting Nexus POS...</p>
          <p className="mt-1 text-sm text-slate-500">Preparing the offline database.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<ShellRoute><DashboardPage /></ShellRoute>} />
        <Route path="/pos" element={<ShellRoute><POSPage /></ShellRoute>} />
        <Route path="/products" element={<ShellRoute><ProductsPage /></ShellRoute>} />
        <Route path="/inventory" element={<ShellRoute><InventoryPage /></ShellRoute>} />
        <Route path="/reports" element={<ShellRoute><ReportsPage /></ShellRoute>} />
        <Route path="/receipts" element={<ShellRoute><ReceiptsPage /></ShellRoute>} />
        <Route path="/account" element={<ShellRoute><AccountPage /></ShellRoute>} />
        <Route path="/settings" element={<ShellRoute><ProtectedRoute role="admin"><SettingsPage /></ProtectedRoute></ShellRoute>} />
        <Route path="/users" element={<ShellRoute><ProtectedRoute role="admin"><UsersPage /></ProtectedRoute></ShellRoute>} />
        <Route path="*" element={<ShellRoute><DashboardPage /></ShellRoute>} />
      </Routes>
      <UpdatePrompt />
    </>
  );
}
