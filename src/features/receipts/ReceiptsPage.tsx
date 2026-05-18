import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { v4 as uuid } from 'uuid';
import { Printer, RotateCcw, Share2 } from 'lucide-react';
import { db } from '../../db/db';
import type { InventoryLog, Product, Sale, SaleItem } from '../../db/schema';
import { Modal } from '../../components/Modal';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { useAppStore } from '../../store/appStore';
import { buildReceiptText, printReceipt, shareReceipt } from '../../services/receiptService';
import { money, paymentLabel, shortDateTime } from '../../utils/format';
import { nowIso, sanitizeText } from '../../utils/security';
import { syncService } from '../../services/syncService';
import { ReceiptPreview } from './ReceiptPreview';

export const ReceiptsPage = () => {
  const settings = useAppStore((state) => state.settings);
  const currentUser = useAppStore((state) => state.currentUser);
  const sales = useLiveQuery(() => db.sales.orderBy('createdAt').reverse().toArray(), [], [] as Sale[]);
  const [selected, setSelected] = useState<{ sale: Sale; items: SaleItem[] } | null>(null);
  const [dateFilter, setDateFilter] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [reviewNote, setReviewNote] = useState('');

  const visibleSales = useMemo(() => {
    return sales.filter((sale) => {
      const owned = currentUser?.role === 'admin' || sale.cashierId === currentUser?.id;
      const matchesDate = !dateFilter || sale.createdAt.slice(0, 10) === dateFilter;
      return owned && matchesDate && !sale.deleted;
    });
  }, [currentUser?.id, currentUser?.role, dateFilter, sales]);

  const openReceipt = async (sale: Sale) => {
    const items = await db.sale_items.where('saleId').equals(sale.id).toArray();
    setSelected({ sale, items });
    setVoidReason('');
    setReviewNote('');
  };

  const refreshSelected = async (saleId: string) => {
    const sale = await db.sales.get(saleId);
    if (!sale) return;
    const items = await db.sale_items.where('saleId').equals(saleId).toArray();
    setSelected({ sale, items });
  };

  const requestVoid = async () => {
    if (!selected || !currentUser) return;
    const reason = sanitizeText(voidReason);
    if (reason.length < 5) {
      toast.error('Enter a clear void reason');
      return;
    }
    const update: Partial<Sale> = {
      voidRequestStatus: 'pending',
      voidReason: reason,
      voidRequestedAt: nowIso(),
      updatedAt: nowIso(),
      synced: false
    };
    await db.sales.update(selected.sale.id, update);
    await syncService.queue('sales', selected.sale.id, 'update', { ...selected.sale, ...update });
    await refreshSelected(selected.sale.id);
    toast.success('Void request sent to admin');
  };

  const reviewVoid = async (approved: boolean) => {
    if (!selected || !currentUser) return;
    const now = nowIso();
    const productUpdates: Product[] = [];
    const inventoryLogs: InventoryLog[] = [];
    const saleUpdate: Partial<Sale> = {
      status: approved ? 'voided' : 'completed',
      voidRequestStatus: approved ? 'approved' : 'rejected',
      voidReviewedAt: now,
      voidReviewedBy: currentUser.id,
      voidReviewNote: reviewNote ? sanitizeText(reviewNote) : undefined,
      updatedAt: now,
      synced: false
    };
    await db.transaction('rw', db.sales, db.products, db.inventory_logs, async () => {
      if (approved) {
        for (const item of selected.items) {
          const product = await db.products.get(item.productId);
          if (!product) continue;
          const nextStock = product.stock + item.quantity;
          const productUpdate: Product = { ...product, stock: nextStock, updatedAt: now, synced: false };
          const log: InventoryLog = {
            id: uuid(),
            productId: product.id,
            productName: product.name,
            type: 'adjustment',
            quantityChange: item.quantity,
            previousStock: product.stock,
            newStock: nextStock,
            note: `Void approved for ${selected.sale.receiptNumber}`,
            userId: currentUser.id,
            userName: currentUser.name,
            createdAt: now,
            updatedAt: now,
            synced: false,
            deleted: false
          };
          productUpdates.push(productUpdate);
          inventoryLogs.push(log);
          await db.products.update(product.id, productUpdate);
          await db.inventory_logs.add(log);
        }
      }
      await db.sales.update(selected.sale.id, saleUpdate);
    });
    await syncService.queue('sales', selected.sale.id, 'update', {
      ...selected.sale,
      id: selected.sale.id,
      ...saleUpdate,
      productUpdates,
      inventoryLogs
    });
    await refreshSelected(selected.sale.id);
    toast.success(approved ? 'Sale voided and stock restored' : 'Void request rejected');
  };

  const isCashier = currentUser?.role === 'cashier';
  const canRequestVoid = isCashier && selected?.sale.cashierId === currentUser?.id && selected.sale.status === 'completed' && selected.sale.voidRequestStatus !== 'pending';
  const canReviewVoid = currentUser?.role === 'admin' && selected?.sale.voidRequestStatus === 'pending';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black">{isCashier ? 'My sales' : 'Receipts'}</h1>
          <p className="text-sm text-slate-500">
            {isCashier ? 'View your locked sales, reprint receipts, and request voids.' : 'Review receipts and cashier void requests.'}
          </p>
        </div>
        <label className="block text-sm font-semibold">
          Filter date
          <input className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-950 sm:w-48" type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
        </label>
      </div>

      <div className="space-y-2">
        {visibleSales.map((sale) => (
          <button
            key={sale.id}
            type="button"
            onClick={() => void openReceipt(sale)}
            className="w-full rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold">{sale.receiptNumber}</p>
                  <StatusLabel sale={sale} />
                </div>
                <p className="text-xs text-slate-500">{shortDateTime(sale.createdAt)} · {sale.cashierName} · {paymentLabel(sale.paymentMethod)}</p>
              </div>
              <strong className="shrink-0">{money(sale.total, settings.currency)}</strong>
            </div>
          </button>
        ))}
        {visibleSales.length === 0 ? <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">No sales found.</div> : null}
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

            {selected.sale.voidRequestStatus ? (
              <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950">
                <p className="font-bold">Void status: {selected.sale.voidRequestStatus}</p>
                {selected.sale.voidReason ? <p className="text-slate-500">Reason: {selected.sale.voidReason}</p> : null}
                {selected.sale.voidReviewNote ? <p className="text-slate-500">Admin note: {selected.sale.voidReviewNote}</p> : null}
              </div>
            ) : null}

            {canRequestVoid ? (
              <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
                <label className="block text-sm font-semibold text-amber-900 dark:text-amber-100">
                  Request void reason
                  <textarea className="mt-1 min-h-24 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-slate-950 dark:border-amber-900 dark:bg-slate-950 dark:text-white" value={voidReason} onChange={(event) => setVoidReason(event.target.value)} />
                </label>
                <button className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-amber-600 font-semibold text-white" onClick={() => void requestVoid()}>
                  <RotateCcw size={18} />
                  Request void
                </button>
              </div>
            ) : null}

            {canReviewVoid ? (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                <label className="block text-sm font-semibold">
                  Admin note
                  <textarea className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button className="min-h-12 rounded-lg bg-rose-50 font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-200" onClick={() => void reviewVoid(false)}>
                    Reject
                  </button>
                  <button className="min-h-12 rounded-lg bg-teal-700 font-semibold text-white" onClick={() => void reviewVoid(true)}>
                    Approve void
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

const StatusLabel = ({ sale }: { sale: Sale }) => {
  if (sale.status === 'voided') return <span className="rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-200">Voided</span>;
  if (sale.voidRequestStatus === 'pending') return <span className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-100">Void pending</span>;
  if (sale.voidRequestStatus === 'rejected') return <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">Void rejected</span>;
  return <span className="rounded-lg bg-teal-50 px-2 py-1 text-[11px] font-bold text-teal-700 dark:bg-teal-950 dark:text-teal-200">Locked</span>;
};
