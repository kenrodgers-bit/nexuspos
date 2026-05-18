import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { Edit3, Plus, Search, Trash2 } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import { db } from '../../db/db';
import type { Category, Product, ProductFormInput } from '../../db/schema';
import { productFormSchema } from '../../db/schema';
import { Modal } from '../../components/Modal';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { money } from '../../utils/format';
import { nowIso, sanitizeText } from '../../utils/security';
import { syncService } from '../../services/syncService';
import { useAppStore } from '../../store/appStore';

export const ProductsPage = () => {
  const currency = useAppStore((state) => state.settings.currency);
  const products = useLiveQuery(() => db.products.toArray(), [], [] as Product[]);
  const categories = useLiveQuery(() => db.categories.toArray(), [], [] as Category[]);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const form = useForm<ProductFormInput>({
    resolver: zodResolver(productFormSchema),
    defaultValues: { name: '', packSize: '', categoryId: '', barcode: '', buyingPrice: 0, sellingPrice: 0, stock: 0, lowStockThreshold: 5, image: '' }
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      editing
        ? {
            name: editing.name,
            packSize: editing.packSize ?? '',
            categoryId: editing.categoryId,
            barcode: editing.barcode ?? '',
            buyingPrice: editing.buyingPrice,
            sellingPrice: editing.sellingPrice,
            stock: editing.stock,
            lowStockThreshold: editing.lowStockThreshold,
            image: editing.image ?? ''
          }
        : { name: '', packSize: '', categoryId: categories[0]?.id ?? '', barcode: '', buyingPrice: 0, sellingPrice: 0, stock: 0, lowStockThreshold: 5, image: '' }
    );
  }, [categories, editing, form, open]);

  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);
  const visibleProducts = products.filter((product) => {
    const text = `${product.name} ${product.packSize ?? ''} ${product.barcode ?? ''}`.toLowerCase();
    return !product.deleted && text.includes(search.toLowerCase()) && (categoryId === 'all' || product.categoryId === categoryId);
  });

  const saveProduct = form.handleSubmit(async (input) => {
    const data = {
      ...input,
      name: sanitizeText(input.name),
      packSize: input.packSize ? sanitizeText(input.packSize) : undefined,
      barcode: input.barcode ? sanitizeText(input.barcode) : undefined,
      updatedAt: nowIso(),
      synced: false,
      active: true
    };
    if (editing) {
      await db.products.update(editing.id, data);
      await syncService.queue('products', editing.id, 'update', { id: editing.id, ...data });
      toast.success('Product updated');
    } else {
      const product: Product = { id: uuid(), ...data, createdAt: nowIso(), deleted: false };
      await db.products.add(product);
      await syncService.queue('products', product.id, 'create', product);
      toast.success('Product added');
    }
    setOpen(false);
    setEditing(null);
  });

  const disableProduct = async (product: Product) => {
    if (!confirm(`Disable ${product.name}?`)) return;
    await db.products.update(product.id, { active: false, deleted: true, updatedAt: nowIso(), synced: false });
    await syncService.queue('products', product.id, 'delete', { id: product.id });
    toast.success('Product disabled');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black">Products</h1>
          <p className="text-sm text-slate-500">Offline CRUD, pricing, barcodes, stock thresholds.</p>
        </div>
        <button
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 font-semibold text-white"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus size={18} />
          Add product
        </button>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input className="min-h-12 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 dark:border-slate-700 dark:bg-slate-950" placeholder="Search products or barcode" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          <Filter label="All" active={categoryId === 'all'} onClick={() => setCategoryId('all')} />
          {categories.map((category) => (
            <Filter key={category.id} label={category.name} active={categoryId === category.id} onClick={() => setCategoryId(category.id)} />
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visibleProducts.map((product) => (
          <article key={product.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold">{product.name}</h2>
                <p className="text-xs text-slate-500">{[categoryMap.get(product.categoryId), product.packSize, product.barcode || 'No barcode'].filter(Boolean).join(' · ')}</p>
              </div>
              <span className={`rounded-lg px-2 py-1 text-xs font-bold ${product.active ? 'bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-200' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
                {product.active ? 'Active' : 'Disabled'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950">
              <div><span className="block text-xs text-slate-500">Buy</span><strong>{money(product.buyingPrice, currency)}</strong></div>
              <div><span className="block text-xs text-slate-500">Sell</span><strong>{money(product.sellingPrice, currency)}</strong></div>
              <div><span className="block text-xs text-slate-500">Stock</span><strong>{product.stock}</strong></div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-100 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                onClick={() => {
                  setEditing(product);
                  setOpen(true);
                }}
              >
                <Edit3 size={16} />
                Edit
              </button>
              <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-rose-50 font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-200" onClick={() => void disableProduct(product)}>
                <Trash2 size={16} />
                Disable
              </button>
            </div>
          </article>
        ))}
      </div>

      <Modal open={open} title={editing ? 'Edit product' : 'Add product'} onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={saveProduct}>
          <Input label="Product name" error={form.formState.errors.name?.message} {...form.register('name')} />
          <Input label="Pack size" placeholder="strip of 10, bottle 100ml" error={form.formState.errors.packSize?.message} {...form.register('packSize')} />
          <label className="block text-sm font-semibold">
            Category
            <select className="mt-1 min-h-12 w-full rounded-lg border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" {...form.register('categoryId')}>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <Input label="Barcode" {...form.register('barcode')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Buying price" type="number" step="0.01" error={form.formState.errors.buyingPrice?.message} {...form.register('buyingPrice', { valueAsNumber: true })} />
            <Input label="Selling price" type="number" step="0.01" error={form.formState.errors.sellingPrice?.message} {...form.register('sellingPrice', { valueAsNumber: true })} />
            <Input label="Stock" type="number" error={form.formState.errors.stock?.message} {...form.register('stock', { valueAsNumber: true })} />
            <Input label="Low stock" type="number" error={form.formState.errors.lowStockThreshold?.message} {...form.register('lowStockThreshold', { valueAsNumber: true })} />
          </div>
          <button className="min-h-12 w-full rounded-lg bg-teal-700 font-semibold text-white">Save product</button>
        </form>
      </Modal>
    </div>
  );
};

const Filter = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button type="button" onClick={onClick} className={`min-h-10 whitespace-nowrap rounded-lg px-4 text-sm font-semibold ${active ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
    {label}
  </button>
);

const Input = ({ label, error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) => (
  <label className="block text-sm font-semibold">
    {label}
    <input className="mt-1 min-h-12 w-full rounded-lg border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" {...props} />
    {error ? <span className="mt-1 block text-xs text-rose-600">{error}</span> : null}
  </label>
);
