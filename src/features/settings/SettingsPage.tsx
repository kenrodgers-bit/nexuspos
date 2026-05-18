import { ChangeEvent, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Download, RotateCcw, Upload } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import { db } from '../../db/db';
import type { InventoryLog, SettingsFormInput } from '../../db/schema';
import { settingsFormSchema } from '../../db/schema';
import { InstallPrompt } from '../../components/InstallPrompt';
import { exportBackup, parseBackupFile, restoreBackup } from '../../services/backupService';
import { useAppStore } from '../../store/appStore';
import { nowIso } from '../../utils/security';
import { syncService } from '../../services/syncService';
import { logoSrc } from '../../utils/brand';

export const SettingsPage = () => {
  const settings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);
  const currentUser = useAppStore((state) => state.currentUser);
  const appLogo = logoSrc(settings.logo);
  const [resetStockValue, setResetStockValue] = useState('0');
  const [resetPhrase, setResetPhrase] = useState('');
  const form = useForm<SettingsFormInput>({
    resolver: zodResolver(settingsFormSchema),
    values: settings
  });

  const save = form.handleSubmit(async (input) => {
    const next = { ...settings, ...input, setupCompleted: true, updatedAt: nowIso(), synced: false };
    await db.settings.put(next);
    setSettings(next);
    await syncService.queue('settings', 'default', 'update', next);
    toast.success('Settings saved locally');
  });

  const uploadLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await toDataUrl(file);
    const next = { ...settings, logo: dataUrl, updatedAt: nowIso(), synced: false };
    await db.settings.put(next);
    setSettings(next);
    toast.success('Logo saved offline');
  };

  const restore = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!confirm('Restore backup? This will overwrite local Nexus POS data on this device.')) return;
    try {
      const backup = await parseBackupFile(file);
      await restoreBackup(backup);
      const next = await db.settings.get('default');
      if (next) setSettings(next);
      toast.success('Backup restored');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Restore failed');
    }
  };

  const resetStock = async () => {
    if (!currentUser || currentUser.role !== 'admin') {
      toast.error('Only admins can reset stock');
      return;
    }
    const nextStock = Number(resetStockValue);
    if (!Number.isInteger(nextStock) || nextStock < 0) {
      toast.error('Enter a whole stock number of 0 or higher');
      return;
    }
    if (resetPhrase !== 'RESET STOCK') {
      toast.error('Type RESET STOCK to confirm');
      return;
    }

    const products = await db.products.filter((product) => product.active && !product.deleted).toArray();
    const changedProducts = products.filter((product) => product.stock !== nextStock);
    if (changedProducts.length === 0) {
      toast.success('All active products already match that stock count');
      setResetPhrase('');
      return;
    }

    const now = nowIso();
    const logs: InventoryLog[] = changedProducts.map((product) => ({
      id: uuid(),
      productId: product.id,
      productName: product.name,
      type: 'adjustment',
      quantityChange: nextStock - product.stock,
      previousStock: product.stock,
      newStock: nextStock,
      note: `Admin stock reset to ${nextStock}`,
      userId: currentUser.id,
      userName: currentUser.name,
      createdAt: now,
      updatedAt: now,
      synced: false,
      deleted: false
    }));

    await db.transaction('rw', db.products, db.inventory_logs, async () => {
      for (const product of changedProducts) {
        await db.products.update(product.id, { stock: nextStock, updatedAt: now, synced: false });
      }
      await db.inventory_logs.bulkAdd(logs);
    });

    await Promise.all([
      ...changedProducts.map((product) =>
        syncService.queue('products', product.id, 'update', { id: product.id, stock: nextStock, updatedAt: now })
      ),
      ...logs.map((log) => syncService.queue('inventory_logs', log.id, 'inventory', log))
    ]);

    setResetPhrase('');
    toast.success(`Stock reset for ${changedProducts.length} products`);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Settings</h1>
        <p className="text-sm text-slate-500">Business profile, receipts, backup and restore, theme, cloud sync, install controls.</p>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <form onSubmit={save} className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Business name" {...form.register('businessName')} />
            <Input label="Currency" {...form.register('currency')} />
            <Input label="Tax rate (%)" type="number" step="0.01" {...form.register('taxRate', { valueAsNumber: true })} />
            <Input label="Auto-lock minutes" type="number" {...form.register('autoLockMinutes', { valueAsNumber: true })} />
            <Input label="Business phone" {...form.register('businessPhone')} />
            <Input label="Business address" {...form.register('businessAddress')} />
            <label className="block text-sm font-semibold">
              Theme
              <select className="mt-1 min-h-12 w-full rounded-lg border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" {...form.register('theme')}>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label className="block text-sm font-semibold">
              Receipt width
              <select className="mt-1 min-h-12 w-full rounded-lg border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" {...form.register('receiptWidth')}>
                <option value="58mm">58mm thermal</option>
                <option value="80mm">80mm thermal</option>
              </select>
            </label>
          </div>
          <label className="mt-3 block text-sm font-semibold">
            Receipt footer
            <textarea className="mt-1 min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950" {...form.register('receiptFooter')} />
          </label>
          <label className="mt-3 flex min-h-12 items-center gap-3 rounded-lg bg-slate-50 px-3 text-sm font-semibold dark:bg-slate-950">
            <input type="checkbox" className="h-5 w-5 accent-teal-700" {...form.register('syncEnabled')} />
            Enable cloud sync queue
          </label>
          <button className="mt-4 min-h-12 w-full rounded-lg bg-teal-700 font-semibold text-white">Save settings</button>
        </form>

        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-3 font-bold">Business logo</h2>
            <div className="mb-3 grid h-24 w-24 place-items-center overflow-hidden rounded-lg bg-white shadow-soft">
              <img src={appLogo} alt="" className="h-full w-full object-cover" />
            </div>
            <label className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 font-semibold text-white dark:bg-white dark:text-slate-950">
              <Upload size={18} />
              Upload logo
              <input type="file" accept="image/*" className="hidden" onChange={(event) => void uploadLogo(event)} />
            </label>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-3 font-bold">Backup and restore</h2>
            <div className="grid gap-2">
              <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-teal-700 font-semibold text-white" type="button" onClick={() => void exportBackup()}>
                <Download size={18} />
                Backup JSON
              </button>
              <label className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg bg-amber-50 font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-100">
                <Upload size={18} />
                Restore JSON
                <input type="file" accept="application/json" className="hidden" onChange={(event) => void restore(event)} />
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-rose-200 bg-white p-4 shadow-soft dark:border-rose-900 dark:bg-slate-900">
            <h2 className="font-bold">Stock reset</h2>
            <p className="mt-1 text-sm text-slate-500">Reset every active product to one stock count after a full physical count.</p>
            <div className="mt-3 grid gap-3">
              <Input label="Set all active products to" type="number" min="0" step="1" value={resetStockValue} onChange={(event) => setResetStockValue(event.target.value)} />
              <Input label="Type RESET STOCK to confirm" value={resetPhrase} onChange={(event) => setResetPhrase(event.target.value)} />
              <button
                type="button"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-rose-700 font-semibold text-white"
                onClick={() => void resetStock()}
              >
                <RotateCcw size={18} />
                Reset stock counts
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-3 font-bold">Install app</h2>
            <p className="mb-3 text-sm text-slate-500">Use this button on Android Chrome or choose Install App from the browser menu.</p>
            <InstallPrompt />
          </div>
        </div>
      </section>
    </div>
  );
};

const toDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const Input = ({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) => (
  <label className="block text-sm font-semibold">
    {label}
    <input className="mt-1 min-h-12 w-full rounded-lg border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" {...props} />
  </label>
);
