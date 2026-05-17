import { useState } from 'react';
import toast from 'react-hot-toast';
import { Printer, Share2 } from 'lucide-react';
import { db } from '../../db/db';
import type { Sale, SaleItem } from '../../db/schema';
import { Modal } from '../../components/Modal';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { useAppStore } from '../../store/appStore';
import { buildReceiptText, printReceipt, shareReceipt } from '../../services/receiptService';
import { money, paymentLabel, shortDateTime } from '../../utils/format';
import { ReceiptPreview } from './ReceiptPreview';

export const ReceiptsPage = () => {
  const settings = useAppStore((state) => state.settings);
  const sales = useLiveQuery(() => db.sales.orderBy('createdAt').reverse().toArray(), [], [] as Sale[]);
  const [selected, setSelected] = useState<{ sale: Sale; items: SaleItem[] } | null>(null);

  const openReceipt = async (sale: Sale) => {
    const items = await db.sale_items.where('saleId').equals(sale.id).toArray();
    setSelected({ sale, items });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Receipts</h1>
        <p className="text-sm text-slate-500">Thermal receipt preview, browser print, text fallback, and Android share sheet.</p>
      </div>

      <div className="space-y-2">
        {sales.map((sale) => (
          <button
            key={sale.id}
            type="button"
            onClick={() => void openReceipt(sale)}
            className="w-full rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-bold">{sale.receiptNumber}</p>
                <p className="text-xs text-slate-500">{shortDateTime(sale.createdAt)} · {sale.cashierName} · {paymentLabel(sale.paymentMethod)}</p>
              </div>
              <strong>{money(sale.total, settings.currency)}</strong>
            </div>
          </button>
        ))}
        {sales.length === 0 ? <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">No receipts yet.</div> : null}
      </div>

      <Modal open={Boolean(selected)} title="Receipt preview" onClose={() => setSelected(null)}>
        {selected ? (
          <div className="space-y-4">
            <ReceiptPreview sale={selected.sale} items={selected.items} settings={settings} />
            <pre className="max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{buildReceiptText(selected.sale, selected.items, settings)}</pre>
            <div className="grid grid-cols-2 gap-2">
              <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-slate-950 font-semibold text-white dark:bg-white dark:text-slate-950" onClick={printReceipt}>
                <Printer size={18} />
                Print
              </button>
              <button
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-teal-700 font-semibold text-white"
                onClick={async () => {
                  const nativeShare = await shareReceipt(buildReceiptText(selected.sale, selected.items, settings));
                  toast.success(nativeShare ? 'Share sheet opened' : 'Receipt copied');
                }}
              >
                <Share2 size={18} />
                Share
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};
