import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Plus, UserCog } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import { db } from '../../db/db';
import type { User, UserFormInput } from '../../db/schema';
import { userFormSchema } from '../../db/schema';
import { Modal } from '../../components/Modal';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { hashSecret, nowIso, sanitizeText } from '../../utils/security';
import { shortDateTime } from '../../utils/format';
import { syncService } from '../../services/syncService';
import { useAppStore } from '../../store/appStore';

export const UsersPage = () => {
  const currentUser = useAppStore((state) => state.currentUser);
  const users = useLiveQuery(() => db.users.toArray(), [], [] as User[]);
  const sales = useLiveQuery(() => db.sales.toArray(), [], []);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const form = useForm<UserFormInput>({
    resolver: zodResolver(userFormSchema),
    defaultValues: { name: '', username: '', role: 'cashier', password: '', pin: '', active: true }
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      editing
        ? { name: editing.name, username: editing.username ?? '', role: editing.role, password: '', pin: '', active: editing.active }
        : { name: '', username: '', role: 'cashier', password: '', pin: '', active: true }
    );
  }, [editing, form, open]);

  const activityByUser = new Map<string, number>();
  sales.forEach((sale) => activityByUser.set(sale.cashierId, (activityByUser.get(sale.cashierId) ?? 0) + 1));

  const saveUser = form.handleSubmit(async (input) => {
    if (!editing && input.role === 'cashier' && !input.pin) {
      toast.error('New staff cashier accounts need a PIN');
      return;
    }
    if (!editing && input.role === 'admin' && !input.password) {
      toast.error('New admin accounts need a password');
      return;
    }
    const base = {
      name: sanitizeText(input.name),
      username: input.username ? sanitizeText(input.username) : undefined,
      role: input.role,
      active: input.active,
      updatedAt: nowIso(),
      synced: false
    };
    const passwordHash = input.password ? await hashSecret(input.password) : undefined;
    const pinHash = input.pin ? await hashSecret(input.pin) : undefined;
    if (editing) {
      const update: Partial<User> = { ...base };
      if (passwordHash) update.passwordHash = passwordHash;
      if (pinHash) update.pinHash = pinHash;
      await db.users.update(editing.id, update);
      await syncService.queue('users', editing.id, 'update', update);
      toast.success('Staff account updated');
    } else {
      const user: User = {
        id: uuid(),
        ...base,
        passwordHash,
        pinHash,
        createdAt: nowIso(),
        deleted: false
      };
      await db.users.add(user);
      await syncService.queue('users', user.id, 'create', user);
      toast.success('Staff account added');
    }
    setOpen(false);
    setEditing(null);
  });

  const disable = async (user: User) => {
    if (user.id === currentUser?.id && user.active) {
      toast.error('You cannot deactivate your own account');
      return;
    }
    await db.users.update(user.id, { active: !user.active, updatedAt: nowIso(), synced: false });
    await syncService.queue('users', user.id, 'update', { active: !user.active });
    toast.success(user.active ? 'Staff account deactivated' : 'Staff account reactivated');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black">Staff accounts</h1>
          <p className="text-sm text-slate-500">Create staff logins, assign roles, and deactivate accounts for staff away from work.</p>
        </div>
        <button
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 font-semibold text-white"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus size={18} />
          Add staff
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {users.map((user) => (
          <article key={user.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold">{user.name}</h2>
                <p className="text-xs text-slate-500">{user.role} · {user.username ?? 'PIN login'}</p>
              </div>
              <span className={`rounded-lg px-2 py-1 text-xs font-bold ${user.active ? 'bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-200' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
                {user.active ? 'Active' : 'Disabled'}
              </span>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950">
              <p>{activityByUser.get(user.id) ?? 0} completed sales</p>
              <p className="text-xs text-slate-500">Last login: {user.lastLoginAt ? shortDateTime(user.lastLoginAt) : 'Never'}</p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-100 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                onClick={() => {
                  setEditing(user);
                  setOpen(true);
                }}
              >
                <UserCog size={16} />
                Edit
              </button>
              <button className="min-h-11 rounded-lg bg-amber-50 font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-100" onClick={() => void disable(user)}>
                {user.active ? 'Deactivate' : 'Reactivate'}
              </button>
            </div>
          </article>
        ))}
      </div>

      <Modal open={open} title={editing ? 'Edit staff account' : 'Add staff account'} onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={saveUser}>
          <Input label="Name" error={form.formState.errors.name?.message} {...form.register('name')} />
          <label className="block text-sm font-semibold">
            Role
            <select className="mt-1 min-h-12 w-full rounded-lg border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" {...form.register('role')}>
              <option value="cashier">Cashier</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <Input label="Username (admin)" error={form.formState.errors.username?.message} {...form.register('username')} />
          <Input label="Password (admin)" type="password" error={form.formState.errors.password?.message} {...form.register('password')} />
          <Input label="Cashier PIN" inputMode="numeric" error={form.formState.errors.pin?.message} {...form.register('pin')} />
          <label className="flex min-h-12 items-center gap-3 rounded-lg bg-slate-50 px-3 text-sm font-semibold dark:bg-slate-950">
            <input type="checkbox" className="h-5 w-5 accent-teal-700" {...form.register('active')} />
            Active user
          </label>
          <button className="min-h-12 w-full rounded-lg bg-teal-700 font-semibold text-white">Save staff</button>
        </form>
      </Modal>
    </div>
  );
};

const Input = ({ label, error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) => (
  <label className="block text-sm font-semibold">
    {label}
    <input className="mt-1 min-h-12 w-full rounded-lg border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" {...props} />
    {error ? <span className="mt-1 block text-xs text-rose-600">{error}</span> : null}
  </label>
);
