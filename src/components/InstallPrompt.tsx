import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Download } from 'lucide-react';
import { installService } from '../services/installService';

export const InstallPrompt = () => {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const unsubscribe = installService.subscribe((event) => setAvailable(Boolean(event) && !installService.isStandalone()));
    return () => {
      unsubscribe();
    };
  }, []);

  if (!available) return null;

  return (
    <button
      type="button"
      onClick={async () => {
        const accepted = await installService.prompt();
        toast.success(accepted ? 'Nexus POS install started' : 'Install dismissed');
      }}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white shadow-soft dark:bg-white dark:text-slate-950"
    >
      <Download size={18} />
      Install App
    </button>
  );
};
