import { useRegisterSW } from 'virtual:pwa-register/react';
import { RotateCw } from 'lucide-react';

export const UpdatePrompt = () => {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker
  } = useRegisterSW({
    onRegisteredSW() {
      return undefined;
    }
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed inset-x-3 bottom-24 z-50 rounded-lg border border-teal-200 bg-white p-3 shadow-soft dark:border-teal-900 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-950 dark:text-white">Update available</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Refresh to use the newest offline app shell.</p>
        </div>
        <button
          type="button"
          onClick={() => void updateServiceWorker(true)}
          className="grid min-h-11 min-w-11 place-items-center rounded-lg bg-teal-700 text-white"
          aria-label="Update app"
        >
          <RotateCw size={18} />
        </button>
      </div>
    </div>
  );
};
