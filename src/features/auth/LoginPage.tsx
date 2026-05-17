import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { LockKeyhole, Shield, WifiOff } from 'lucide-react';
import { db } from '../../db/db';
import { verifySecret } from '../../utils/security';
import { useAppStore } from '../../store/appStore';
import { InstallPrompt } from '../../components/InstallPrompt';
import { StatusPills } from '../../components/StatusPills';

const pinKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'];

export const LoginPage = () => {
  const navigate = useNavigate();
  const setUser = useAppStore((state) => state.setUser);
  const unlockSession = useAppStore((state) => state.unlockSession);
  const settings = useAppStore((state) => state.settings);
  const locked = useAppStore((state) => state.locked);
  const [mode, setMode] = useState<'pin' | 'admin'>('pin');
  const [pin, setPin] = useState('');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const finishLogin = async (userId: string) => {
    await db.users.update(userId, { lastLoginAt: new Date().toISOString(), updatedAt: new Date().toISOString(), synced: false });
    const user = await db.users.get(userId);
    if (!user) return;
    setUser(user);
    unlockSession();
    navigate('/', { replace: true });
  };

  const submitPin = async (candidate = pin) => {
    if (candidate.length < 4) return;
    setBusy(true);
    try {
      const users = await db.users.where('role').equals('cashier').and((user) => user.active && !user.deleted).toArray();
      const match = await asyncFind(users, async (user) => verifySecret(candidate, user.pinHash));
      if (!match) {
        toast.error('Invalid cashier PIN');
        setPin('');
        return;
      }
      await finishLogin(match.id);
    } finally {
      setBusy(false);
    }
  };

  const submitAdmin = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const user = await db.users.where('username').equalsIgnoreCase(username.trim()).first();
      if (!user || user.role !== 'admin' || !user.active || !(await verifySecret(password, user.passwordHash))) {
        toast.error('Invalid admin login');
        return;
      }
      await finishLogin(user.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center px-4 py-8 text-slate-950 dark:text-white">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-lg bg-teal-700 text-lg font-black text-white">
              {settings.logo ? <img src={settings.logo} alt="" className="h-full w-full object-cover" /> : 'NX'}
            </div>
            <div>
              <h1 className="text-xl font-black">Nexus POS</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">{settings.businessName}</p>
            </div>
          </div>
          <WifiOff className="text-slate-400" size={20} />
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <StatusPills />
          <InstallPrompt />
        </div>

        {locked ? (
          <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Session locked after inactivity. Sign in again to continue.
          </div>
        ) : null}

        <div className="mb-5 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setMode('pin')}
            className={`min-h-11 rounded-lg text-sm font-semibold ${mode === 'pin' ? 'bg-white text-teal-700 shadow-sm dark:bg-slate-950' : 'text-slate-500'}`}
          >
            Cashier PIN
          </button>
          <button
            type="button"
            onClick={() => setMode('admin')}
            className={`min-h-11 rounded-lg text-sm font-semibold ${mode === 'admin' ? 'bg-white text-teal-700 shadow-sm dark:bg-slate-950' : 'text-slate-500'}`}
          >
            Admin
          </button>
        </div>

        {mode === 'pin' ? (
          <div>
            <div className="mb-4 flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
              <LockKeyhole size={22} className="text-teal-700" />
              <span className="font-mono text-2xl tracking-[0.6em]">{pin.padEnd(4, '•').slice(0, 8)}</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {pinKeys.map((key) => (
                <button
                  key={key}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (key === 'clear') setPin('');
                    else if (key === 'back') setPin((value) => value.slice(0, -1));
                    else {
                      const next = `${pin}${key}`.slice(0, 8);
                      setPin(next);
                      if (next.length >= 4) void submitPin(next);
                    }
                  }}
                  className="min-h-16 rounded-lg bg-slate-950 text-lg font-bold text-white shadow-sm active:scale-[0.98] disabled:opacity-50 dark:bg-teal-700"
                >
                  {key === 'clear' ? 'Clear' : key === 'back' ? 'Back' : key}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={submitAdmin}>
            <label className="block">
              <span className="text-sm font-semibold">Username</span>
              <input
                className="mt-1 min-h-12 w-full rounded-lg border border-slate-200 bg-white px-3 outline-none focus:border-teal-700 dark:border-slate-700 dark:bg-slate-950"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Password</span>
              <input
                className="mt-1 min-h-12 w-full rounded-lg border border-slate-200 bg-white px-3 outline-none focus:border-teal-700 dark:border-slate-700 dark:bg-slate-950"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>
            <button disabled={busy} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 font-semibold text-white disabled:opacity-60">
              <Shield size={18} />
              Sign in as admin
            </button>
          </form>
        )}

        <p className="mt-5 text-center text-xs text-slate-500 dark:text-slate-400">Default admin: admin / admin123. Cashier PIN: 1234.</p>
      </section>
    </div>
  );
};

const asyncFind = async <T,>(items: T[], predicate: (item: T) => Promise<boolean>) => {
  for (const item of items) {
    if (await predicate(item)) return item;
  }
  return undefined;
};
