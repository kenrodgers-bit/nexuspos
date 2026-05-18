import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { KeyRound, Settings, ShieldCheck, UserCog, Users } from 'lucide-react';
import { db } from '../../db/db';
import { hashSecret, nowIso, sanitizeText, verifySecret } from '../../utils/security';
import { useAppStore } from '../../store/appStore';
import { syncService } from '../../services/syncService';

export const AccountPage = () => {
  const currentUser = useAppStore((state) => state.currentUser);
  const setUser = useAppStore((state) => state.setUser);
  const [username, setUsername] = useState(currentUser?.username ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [busy, setBusy] = useState(false);

  if (!currentUser) return null;

  const refreshUser = async () => {
    const updated = await db.users.get(currentUser.id);
    if (updated) setUser(updated);
  };

  const updateAdminLogin = async (event: FormEvent) => {
    event.preventDefault();
    if (currentUser.role !== 'admin') return;
    if (!(await verifySecret(currentPassword, currentUser.passwordHash))) {
      toast.error('Current password is incorrect');
      return;
    }
    const cleanUsername = sanitizeText(username);
    if (cleanUsername.length < 3) {
      toast.error('Username must be at least 3 characters');
      return;
    }
    if (newPassword && newPassword.length < 6) {
      toast.error('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    const existing = await db.users.where('username').equalsIgnoreCase(cleanUsername).first();
    if (existing && existing.id !== currentUser.id) {
      toast.error('That username is already in use');
      return;
    }
    setBusy(true);
    try {
      const update = {
        username: cleanUsername,
        passwordHash: newPassword ? await hashSecret(newPassword) : currentUser.passwordHash,
        updatedAt: nowIso(),
        synced: false
      };
      await db.users.update(currentUser.id, update);
      await syncService.queue('users', currentUser.id, 'update', { id: currentUser.id, username: update.username });
      await refreshUser();
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Login details updated');
    } finally {
      setBusy(false);
    }
  };

  const updatePin = async (event: FormEvent) => {
    event.preventDefault();
    if (!(await verifySecret(currentPin, currentUser.pinHash))) {
      toast.error('Current PIN is incorrect');
      return;
    }
    if (!/^\d{4,8}$/.test(newPin)) {
      toast.error('New PIN must be 4 to 8 digits');
      return;
    }
    if (newPin !== confirmPin) {
      toast.error('PINs do not match');
      return;
    }
    setBusy(true);
    try {
      await db.users.update(currentUser.id, {
        pinHash: await hashSecret(newPin),
        updatedAt: nowIso(),
        synced: false
      });
      await syncService.queue('users', currentUser.id, 'update', { id: currentUser.id, pinChanged: true });
      await refreshUser();
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      toast.success('PIN updated');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Account</h1>
        <p className="text-sm text-slate-500">Manage your own login details on this device.</p>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="text-teal-700" />
            <div>
              <h2 className="font-bold">{currentUser.name}</h2>
              <p className="text-sm text-slate-500">{currentUser.role} account</p>
            </div>
          </div>

          {currentUser.role === 'admin' ? (
            <form className="space-y-3" onSubmit={(event) => void updateAdminLogin(event)}>
              <Input label="Username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
              <Input label="Current password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" />
              <Input label="New password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" />
              <Input label="Confirm new password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />
              <button disabled={busy} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-teal-700 font-semibold text-white disabled:opacity-60">
                <KeyRound size={18} />
                Update login details
              </button>
            </form>
          ) : (
            <form className="space-y-3" onSubmit={(event) => void updatePin(event)}>
              <Input label="Current PIN" inputMode="numeric" type="password" value={currentPin} onChange={(event) => setCurrentPin(event.target.value.replace(/\D/g, '').slice(0, 8))} />
              <Input label="New PIN" inputMode="numeric" type="password" value={newPin} onChange={(event) => setNewPin(event.target.value.replace(/\D/g, '').slice(0, 8))} />
              <Input label="Confirm new PIN" inputMode="numeric" type="password" value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 8))} />
              <button disabled={busy} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-teal-700 font-semibold text-white disabled:opacity-60">
                <KeyRound size={18} />
                Update PIN
              </button>
            </form>
          )}
        </div>

        <div className="space-y-4">
          {currentUser.role === 'admin' ? (
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-3 font-bold">Admin tools</h2>
              <div className="grid gap-2">
                <Link className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-slate-100 px-3 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200" to="/users">
                  <Users size={18} />
                  Staff accounts
                </Link>
                <Link className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-slate-100 px-3 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200" to="/settings">
                  <Settings size={18} />
                  Business settings
                </Link>
              </div>
            </div>
          ) : null}

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-2 flex items-center gap-2">
              <UserCog className="text-teal-700" />
              <h2 className="font-bold">Access note</h2>
            </div>
            <p className="text-sm text-slate-500">Changes are stored locally first and added to the sync queue when cloud sync is enabled.</p>
          </div>
        </div>
      </section>
    </div>
  );
};

const Input = ({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) => (
  <label className="block text-sm font-semibold">
    {label}
    <input className="mt-1 min-h-12 w-full rounded-lg border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" {...props} />
  </label>
);
