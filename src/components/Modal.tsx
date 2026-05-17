import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}

export const Modal = ({ open, title, children, onClose }: ModalProps) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4">
      <section className="max-h-[92vh] w-full overflow-y-auto rounded-t-lg bg-white p-4 shadow-soft dark:bg-slate-900 sm:max-w-lg sm:rounded-lg">
        <header className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950 dark:text-white">{title}</h2>
          <button
            className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-slate-200 text-slate-500 dark:border-slate-700"
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
};
