import { useRegisterSW } from 'virtual:pwa-register/react';
import { CheckCircle2, RotateCw } from 'lucide-react';
import { useState } from 'react';

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
let updateCheckTimer: number | undefined;

export const UpdatePrompt = () => {
  const [status, setStatus] = useState<'idle' | 'offline-ready' | 'checking' | 'updating'>('idle');
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady]
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      const checkForUpdate = () => {
        if (!navigator.onLine) return;
        setStatus('checking');
        void registration.update().finally(() => {
          setStatus((current) => (current === 'checking' ? 'idle' : current));
        });
      };
      window.clearInterval(updateCheckTimer);
      updateCheckTimer = window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
      checkForUpdate();
    },
    onOfflineReady() {
      setStatus('offline-ready');
      window.setTimeout(() => setStatus('idle'), 3500);
    },
    onNeedRefresh() {
      setStatus('updating');
    }
  });

  const visible = needRefresh || offlineReady || status !== 'idle';
  if (!visible) return null;

  const updating = needRefresh || status === 'updating' || status === 'checking';

  return (
    <div className="fixed inset-x-3 bottom-24 z-50 rounded-lg border border-teal-200 bg-white p-3 shadow-soft dark:border-teal-900 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950 dark:text-white">{updating ? 'Updating app' : 'Offline app ready'}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {updating ? 'Nexus POS is applying the newest app shell automatically.' : 'Nexus POS will keep working without internet.'}
          </p>
        </div>
        <div className="grid min-h-11 min-w-11 place-items-center rounded-lg bg-teal-700 text-white" aria-hidden="true">
          {updating ? <RotateCw size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
        </div>
      </div>
    </div>
  );
};
