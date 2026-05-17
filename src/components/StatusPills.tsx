import { CloudOff, RefreshCcw, Wifi } from 'lucide-react';
import { useAppStore } from '../store/appStore';

export const StatusPills = () => {
  const online = useAppStore((state) => state.online);
  const pendingSync = useAppStore((state) => state.pendingSync);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${
          online ? 'bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-200' : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-200'
        }`}
      >
        {online ? <Wifi size={15} /> : <CloudOff size={15} />}
        {online ? 'Online' : 'Offline'}
      </span>
      <span className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-slate-100 px-3 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
        <RefreshCcw size={15} />
        {pendingSync} pending
      </span>
    </div>
  );
};
