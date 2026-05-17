import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Boxes, History, PackagePlus } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import { db } from '../../db/db';
import type { InventoryFormInput, InventoryLog, Product } from '../../db/schema';
import { inventoryFormSchema } from '../../db/schema';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { useAppStore } from '../../store/appStore';
import { nowIso, sanitizeText } from '../../utils/security';
import { shortDateTime } from '../../utils/format';
import { syncService } from '../../services/syncService';

export const InventoryPage = () => {
  const user = useAppStore((state) => state.currentUser);
  const products = useLiveQuery(() => db.products.filter((product) => product.active && !product.deleted).toArray(), [], [] as Product[]);
  const logs = useLiveQuery(() => db.inventory_logs.orderBy('createdAt').reverse().limit(80).toArray(), [], [] as InventoryLog[]);
  const lowStock = useMemo(() => products.filter((product) => !product.deleted && product.stock <= product.lowStockThreshold), [products]);
  const form = useForm<InventoryFormInput>({
    resolver: zodResolver(inventoryFormSchema),
    defaultValues: { productId: '', quantity: 1, supplier: '', note: '', type: 'restock' }
  });

  const save = form.handleSubmit(async (input) => {
    if (!user) return;
    const product = await db.products.get(input.productId);
    if (!product) {
      toast.error('Product not found');
      return;
    }
    const quantityChange = input.type === 'restock' ? Math.abs(input.quantity) : input.quantity;
    const nextStock = product.stock + quantityChange;
    if (nextStock < 0) {
      toast.error('Stock cannot go below zero');
      return;
    }
    const log: InventoryLog = {
      id: uuid(),
      productId: product.id,
      productName: product.name,
      type: input.type,
      quantityChange,
      previousStock: product.stock,
      newStock: nextStock,
      supplier: input.supplier ? sanitizeText(input.supplier) : undefined,
      note: input.note ? sanitizeText(input.note) : undefined,
      userId: user.id,
      userName: user.name,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      synced: false,
      deleted: false
    };
    await db.transaction('rw', db.products, db.inventory_logs, async () => {
      await db.products.update(product.id, { stock: nextStock, updatedAt: nowIso(), synced: false });
      await db.inventory_logs.add(log);
    });
    await syncService.queue('inventory_logs', log.id, 'inventory', log);
    form.reset({ productId: product.id, quantity: 1, supplier: '', note: '', type: 'restock' });
    toast.success('Inventory updated offline');
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Inventory</h1>
        <p className="text-sm text-slate-500">Restock products, adjust stock, and audit every movement locally.</p>
      </div>

      <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <form onSubmit={save} className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-2">
            <PackagePlus className="text-teal-700" />
            <h2 className="font-bold">Stock update</h2>
          </div>
          <div className="space-y-3">
            <label className="block text-sm font-semibold">
              Product
              <select className="mt-1 min-h-12 w-full rounded-lg border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" {...form.register('productId')}>
                <option value="">Choose product</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.name} · {product.stock} in stock</option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold">
              Type
              <select className="mt-1 min-h-12 w-full rounded-lg border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" {...form.register('type')}>
                <option value="restock">Restock</option>
                <option value="adjustment">Adjustment</option>
              </select>
            </label>
            <label className="block text-sm font-semibold">
              Quantity change
              <input className="mt-1 min-h-12 w-full rounded-lg border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" type="number" {...form.register('quantity', { valueAsNumber: true })} />
              {form.formState.errors.quantity ? <span className="text-xs text-rose-600">{form.formState.errors.quantity.message}</span> : null}
            </label>
            <label className="block text-sm font-semibold">
              Supplier
              <input className="mt-1 min-h-12 w-full rounded-lg border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" {...form.register('supplier')} />
            </label>
            <label className="block text-sm font-semibold">
              Note
              <textarea className="mt-1 min-h-24 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950" {...form.register('note')} />
            </label>
            <button className="min-h-12 w-full rounded-lg bg-teal-700 font-semibold text-white">Save stock movement</button>
          </div>
        </form>

        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center gap-2">
              <Boxes className="text-amber-600" />
              <h2 className="font-bold">Low stock list</h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {lowStock.map((product) => (
                <div key={product.id} className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                  <p className="font-bold">{product.name}</p>
                  <p>{product.stock} left · threshold {product.lowStockThreshold}</p>
                </div>
              ))}
              {lowStock.length === 0 ? <p className="text-sm text-slate-500">No low-stock products.</p> : null}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center gap-2">
              <History className="text-teal-700" />
              <h2 className="font-bold">Inventory logs</h2>
            </div>
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log.id} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950">
                  <div className="flex items-center justify-between gap-3">
                    <strong>{log.productName}</strong>
                    <span className={log.quantityChange >= 0 ? 'text-teal-700' : 'text-rose-600'}>{log.quantityChange > 0 ? '+' : ''}{log.quantityChange}</span>
                  </div>
                  <p className="text-xs text-slate-500">{shortDateTime(log.createdAt)} · {log.userName} · {log.previousStock} → {log.newStock}</p>
                  {log.supplier || log.note ? <p className="mt-1 text-xs text-slate-500">{[log.supplier, log.note].filter(Boolean).join(' · ')}</p> : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
