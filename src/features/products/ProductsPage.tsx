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

const blankProductForm = (categoryId = ''): ProductFormInput => ({
  name: '',
  genericName: '',
  strength: '',
  dosageForm: '',
  packSize: '',
  categoryId,
  barcode: '',
  batchNumber: '',
  expiryDate: '',
  requiresPrescription: false,
  buyingPrice: 0,
  sellingPrice: 0,
  stock: 0,
  lowStockThreshold: 5,
  image: ''
});

const cleanOptional = (value?: string) => {
  const cleaned = sanitizeText(value ?? '');
  return cleaned || undefined;
};

const todayKey = () => new Date().toISOString().slice(0, 10);

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
    defaultValues: blankProductForm()
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      editing
        ? {
            name: editing.name,
            genericName: editing.genericName ?? '',
            strength: editing.strength ?? '',
            dosageForm: editing.dosageForm ?? '',
            packSize: editing.packSize ?? '',
            categoryId: editing.categoryId,
            barcode: editing.barcode ?? '',
            batchNumber: editing.batchNumber ?? '',
            expiryDate: editing.expiryDate ?? '',
            requiresPrescription: Boolean(editing.requiresPrescription),
            buyingPrice: editing.buyingPrice,
            sellingPrice: editing.sellingPrice,
            stock: editing.stock,
            lowStockThreshold: editing.lowStockThreshold,
            image: editing.image ?? ''
          }
        : blankProductForm(categories[0]?.id ?? '')
    );
  }, [categories, editing, form, open]);

  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);
  const visibleProducts = products.filter((product) => {
    const text = [
      product.name,
      product.genericName,
      product.strength,
      product.dosageForm,
      product.packSize,
      product.barcode,
      product.batchNumber
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return !product.deleted && text.includes(search.toLowerCase()) && (categoryId === 'all' || product.categoryId === categoryId);
  });

  const saveProduct = form.handleSubmit(async (input) => {
    const data = {
      ...input,
      name: sanitizeText(input.name),
      genericName: cleanOptional(input.genericName),
      strength: cleanOptional(input.strength),
      dosageForm: cleanOptional(input.dosageForm),
      packSize: cleanOptional(input.packSize),
      barcode: cleanOptional(input.barcode),
      batchNumber: cleanOptional(input.batchNumber),
      expiryDate: input.expiryDate || undefined,
      requiresPrescription: Boolean(input.requiresPrescription),
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
          <input className="min-h-12 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 dark:border-slate-700 dark:bg-slate-950" placeholder="Search product, generic, barcode or batch" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          <Filter label="All" active={categoryId === 'all'} onClick={() => setCategoryId('all')} />
          {categories.map((category) => (
            <Filter key={category.id} label={category.name} active={categoryId === category.id} onClick={() => setCategoryId(category.id)} />
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visibleProducts.map((product) => {
          const drugDetails = [product.genericName, product.strength, product.dosageForm, product.packSize].filter(Boolean).join(' | ');
          const expired = Boolean(product.expiryDate && product.expiryDate < todayKey());
          return (
          <article key={product.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="break-words font-bold">{product.name}</h2>
                  {product.requiresPrescription ? <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-800 dark:bg-amber-950 dark:text-amber-100">Rx</span> : null}
                </div>
                {drugDetails ? <p className="mt-1 text-xs font-semibold text-slate-500">{drugDetails}</p> : null}
                <p className="mt-1 text-xs text-slate-500">
                  {[categoryMap.get(product.categoryId), product.barcode || 'No barcode', product.batchNumber ? `Batch ${product.batchNumber}` : null].filter(Boolean).join(' | ')}
                </p>
                {product.expiryDate ? (
                  <p className={`mt-1 text-xs font-bold ${expired ? 'text-rose-600' : 'text-slate-500'}`}>
                    Expiry {product.expiryDate}{expired ? ' - expired' : ''}
                  </p>
                ) : null}
              </div>
              <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-bold ${product.active ? 'bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-200' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
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
          );
        })}
      </div>

      <Modal open={open} title={editing ? 'Edit product' : 'Add product'} onClose={() => setOpen(false)}>
        <form className="space-y-3" onSubmit={saveProduct}>
          <Input label="Product name" error={form.formState.errors.name?.message} {...form.register('name')} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Generic name" placeholder="Paracetamol" error={form.formState.errors.genericName?.message} {...form.register('genericName')} />
            <Input label="Strength" placeholder="500mg" error={form.formState.errors.strength?.message} {...form.register('strength')} />
            <Input label="Dosage form" placeholder="Tablet, syrup, cream" error={form.formState.errors.dosageForm?.message} {...form.register('dosageForm')} />
            <Input label="Pack size" placeholder="strip of 10, bottle 100ml" error={form.formState.errors.packSize?.message} {...form.register('packSize')} />
          </div>
          <label className="block text-sm font-semibold">
            Category
            <select className="mt-1 min-h-12 w-full rounded-lg border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" {...form.register('categoryId')}>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Barcode" {...form.register('barcode')} />
            <Input label="Batch number" error={form.formState.errors.batchNumber?.message} {...form.register('batchNumber')} />
            <Input label="Expiry date" type="date" error={form.formState.errors.expiryDate?.message} {...form.register('expiryDate')} />
            <label className="flex min-h-12 items-center gap-3 rounded-lg bg-slate-50 px-3 text-sm font-semibold dark:bg-slate-950 sm:mt-6">
              <input type="checkbox" className="h-5 w-5 accent-teal-700" {...form.register('requiresPrescription')} />
              Prescription required
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
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
