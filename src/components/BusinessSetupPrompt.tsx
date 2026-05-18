import { FormEvent, useState } from 'react';
import toast from 'react-hot-toast';
import { Store } from 'lucide-react';
import { db } from '../db/db';
import { syncService } from '../services/syncService';
import { useAppStore } from '../store/appStore';
import { nowIso, sanitizeText } from '../utils/security';

const defaultBusinessName = 'Nexus Retail Shop';

export const BusinessSetupPrompt = () => {
  const currentUser = useAppStore((state) => state.currentUser);
  const settings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);
  const [businessName, setBusinessName] = useState(settings.businessName === defaultBusinessName ? '' : settings.businessName);
  const [businessPhone, setBusinessPhone] = useState(settings.businessPhone ?? '');
  const [businessAddress, setBusinessAddress] = useState(settings.businessAddress ?? '');
  const [busy, setBusy] = useState(false);

  const shouldShow = currentUser?.role === 'admin' && settings.setupCompleted !== true && settings.businessName === defaultBusinessName;
  if (!shouldShow) return null;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const cleanName = sanitizeText(businessName);
    if (cleanName.length < 2) {
      toast.error('Enter the chemist or shop name');
      return;
    }
    setBusy(true);
    try {
      const next = {
        ...settings,
        businessName: cleanName,
        businessPhone: businessPhone ? sanitizeText(businessPhone) : undefined,
        businessAddress: businessAddress ? sanitizeText(businessAddress) : undefined,
        setupCompleted: true,
        updatedAt: nowIso(),
        synced: false
      };
      await db.settings.put(next);
      setSettings(next);
      await syncService.queue('settings', 'default', 'update', next);
      toast.success('Receipt business name saved');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-end bg-slate-950/55 p-0 sm:place-items-center sm:p-4">
      <form onSubmit={(event) => void save(event)} className="w-full max-w-lg rounded-t-lg bg-white p-4 shadow-soft dark:bg-slate-900 sm:rounded-lg">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-lg bg-teal-700 text-white">
            <Store size={22} />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-950 dark:text-white">Set receipt business name</h2>
            <p className="text-sm text-slate-500">This appears on printed and shared receipts.</p>
          </div>
        </div>
        <div className="space-y-3">
          <label className="block text-sm font-semibold">
            Chemist or shop name
            <input
              className="mt-1 min-h-12 w-full rounded-lg border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-950"
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
              placeholder="e.g. Afya Chemist"
              autoFocus
            />
          </label>
          <label className="block text-sm font-semibold">
            Phone
            <input className="mt-1 min-h-12 w-full rounded-lg border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" value={businessPhone} onChange={(event) => setBusinessPhone(event.target.value)} />
          </label>
          <label className="block text-sm font-semibold">
            Address
            <input className="mt-1 min-h-12 w-full rounded-lg border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" value={businessAddress} onChange={(event) => setBusinessAddress(event.target.value)} />
          </label>
          <button disabled={busy} className="min-h-12 w-full rounded-lg bg-teal-700 font-semibold text-white disabled:opacity-60">
            Save and continue
          </button>
        </div>
      </form>
    </div>
  );
};
