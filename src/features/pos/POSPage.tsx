import { FormEvent, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { v4 as uuid } from 'uuid';
import { Barcode, Minus, Plus, ReceiptText, Search, Share2, ShoppingCart, X } from 'lucide-react';
import { db } from '../../db/db';
import type { Category, PaymentMethod, Product, Sale, SaleItem } from '../../db/schema';
import { Modal } from '../../components/Modal';
import { ReceiptPreview } from '../receipts/ReceiptPreview';
import { useAppStore } from '../../store/appStore';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { money, paymentLabel } from '../../utils/format';
import { nowIso, sanitizeText } from '../../utils/security';
import { syncService } from '../../services/syncService';
import { buildReceiptText, printReceipt, shareReceipt } from '../../services/receiptService';

interface CartLine {
  product: Product;
  quantity: number;
  discount: number;
}

const receiptNumber = () => `NP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
const transactionId = () => `TX-${Date.now()}-${uuid().slice(0, 8).toUpperCase()}`;
const paymentMethods: PaymentMethod[] = ['cash', 'mpesa', 'card', 'bank_transfer', 'other'];
const todayKey = () => new Date().toISOString().slice(0, 10);
const isExpired = (expiryDate?: string) => Boolean(expiryDate && expiryDate < todayKey());
const receiptProductName = (product: Product) => {
  const name = product.name.toLowerCase();
  const packSize = product.packSize?.toLowerCase() ?? '';
  const strength = product.strength && !name.includes(product.strength.toLowerCase()) ? product.strength : undefined;
  const dosageForm = product.dosageForm && !packSize.includes(product.dosageForm.toLowerCase()) ? product.dosageForm : undefined;
  const details = [strength, dosageForm, product.packSize].filter(Boolean).join(' ');
  return details ? `${product.name} (${details})` : product.name;
};

export const POSPage = () => {
  const settings = useAppStore((state) => state.settings);
  const currentUser = useAppStore((state) => state.currentUser);
  const products = useLiveQuery(() => db.products.filter((product) => product.active && !product.deleted).toArray(), [], [] as Product[]);
  const categories = useLiveQuery(() => db.categories.toArray(), [], [] as Category[]);
  const [search, setSearch] = useState('');
  const [barcode, setBarcode] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [amountReceived, setAmountReceived] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [patientName, setPatientName] = useState('');
  const [prescriptionReference, setPrescriptionReference] = useState('');
  const [globalDiscount, setGlobalDiscount] = useState('0');
  const [lastReceipt, setLastReceipt] = useState<{ sale: Sale; items: SaleItem[] } | null>(null);

  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const visibleProducts = products.filter((product) => {
    if (product.deleted || !product.active) return false;
    const matchesText = [
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
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesCategory = categoryId === 'all' || product.categoryId === categoryId;
    return matchesText && matchesCategory;
  });

  const subtotal = cart.reduce((sum, line) => sum + line.quantity * line.product.sellingPrice, 0);
  const itemDiscount = cart.reduce((sum, line) => sum + line.discount, 0);
  const discount = itemDiscount + Number(globalDiscount || 0);
  const taxable = Math.max(0, subtotal - discount);
  const tax = taxable * (settings.taxRate / 100);
  const total = Math.max(0, taxable + tax);
  const received = paymentMethod === 'cash' ? Number(amountReceived || 0) : total;
  const change = Math.max(0, received - total);
  const requiresPrescription = cart.some((line) => line.product.requiresPrescription);

  const addProduct = (product: Product) => {
    if (isExpired(product.expiryDate)) {
      toast.error(`${product.name} is expired`);
      return;
    }
    setCart((lines) => {
      const current = lines.find((line) => line.product.id === product.id);
      if (current && current.quantity >= product.stock) {
        toast.error('Insufficient stock');
        return lines;
      }
      if (!current && product.stock < 1) {
        toast.error('Product is out of stock');
        return lines;
      }
      if (current) return lines.map((line) => (line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line));
      return [...lines, { product, quantity: 1, discount: 0 }];
    });
  };

  const scanBarcode = (event: FormEvent) => {
    event.preventDefault();
    const found = products.find((product) => product.barcode === barcode.trim());
    if (!found) toast.error('Barcode not found');
    else addProduct(found);
    setBarcode('');
  };

  const updateQuantity = (productId: string, next: number) => {
    setCart((lines) =>
      lines.flatMap((line) => {
        if (line.product.id !== productId) return [line];
        if (next <= 0) return [];
        if (next > line.product.stock) {
          toast.error('Insufficient stock');
          return [line];
        }
        return [{ ...line, quantity: next }];
      })
    );
  };

  const checkout = async () => {
    if (!currentUser) return;
    if (cart.length === 0) {
      toast.error('Add products to cart');
      return;
    }
    if (paymentMethod === 'cash' && received < total) {
      toast.error('Amount received is below total');
      return;
    }
    if (requiresPrescription && prescriptionReference.trim().length < 3) {
      toast.error('Prescription reference is required for Rx items');
      return;
    }
    toast.dismiss();
    const saleId = uuid();
    const createdAt = nowIso();
    const saleItems: SaleItem[] = cart.map((line) => {
      const lineTotal = line.quantity * line.product.sellingPrice - line.discount;
      const profit = line.quantity * (line.product.sellingPrice - line.product.buyingPrice) - line.discount;
      return {
        id: uuid(),
        saleId,
        productId: line.product.id,
        productName: receiptProductName(line.product),
        quantity: line.quantity,
        unitPrice: line.product.sellingPrice,
        buyingPrice: line.product.buyingPrice,
        discount: line.discount,
        total: lineTotal,
        profit,
        createdAt,
        updatedAt: createdAt,
        synced: false,
        deleted: false
      };
    });
    const sale: Sale = {
      id: saleId,
      receiptNumber: receiptNumber(),
      transactionId: transactionId(),
      cashierId: currentUser.id,
      cashierName: currentUser.name,
      subtotal,
      discount,
      tax,
      total,
      profit: saleItems.reduce((sum, item) => sum + item.profit, 0),
      paymentMethod,
      amountReceived: received,
      changeDue: change,
      mpesaReference: paymentMethod === 'mpesa' ? paymentReference.trim() || undefined : undefined,
      paymentReference: paymentMethod !== 'cash' ? paymentReference.trim() || undefined : undefined,
      patientName: patientName ? sanitizeText(patientName) : undefined,
      prescriptionReference: requiresPrescription ? sanitizeText(prescriptionReference) : undefined,
      status: 'completed',
      createdAt,
      updatedAt: createdAt,
      synced: false,
      deleted: false
    };

    try {
      await db.transaction('rw', db.sales, db.sale_items, db.products, db.inventory_logs, async () => {
        for (const line of cart) {
          const fresh = await db.products.get(line.product.id);
          if (!fresh || fresh.stock < line.quantity) throw new Error(`${line.product.name} has insufficient stock`);
          if (isExpired(fresh.expiryDate)) throw new Error(`${line.product.name} is expired`);
          await db.products.update(fresh.id, { stock: fresh.stock - line.quantity, updatedAt: nowIso(), synced: false });
          await db.inventory_logs.add({
            id: uuid(),
            productId: fresh.id,
            productName: fresh.name,
            type: 'sale',
            quantityChange: -line.quantity,
            previousStock: fresh.stock,
            newStock: fresh.stock - line.quantity,
            userId: currentUser.id,
            userName: currentUser.name,
            createdAt,
            updatedAt: createdAt,
            synced: false,
            deleted: false
          });
        }
        await db.sales.add(sale);
        await db.sale_items.bulkAdd(saleItems);
      });
      await syncService.queue('sales', sale.id, 'sale', { sale, items: saleItems });
      setLastReceipt({ sale, items: saleItems });
      setDrawerOpen(false);
      setCart([]);
      setGlobalDiscount('0');
      setAmountReceived('');
      setPaymentReference('');
      setPatientName('');
      setPrescriptionReference('');
      toast.success('Sale saved locally');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Checkout failed');
    }
  };

  const receiptText = lastReceipt ? buildReceiptText(lastReceipt.sale, lastReceipt.items, settings) : '';

  return (
    <div className="space-y-4 pb-20">
      <section className="grid gap-3 md:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-soft dark:border-slate-800 dark:bg-slate-900">
            <div className="flex gap-2">
              <label className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  className="min-h-12 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 outline-none focus:border-teal-700 dark:border-slate-700 dark:bg-slate-950"
                  placeholder="Search products"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <form onSubmit={scanBarcode} className="relative hidden flex-1 md:block">
                <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  className="min-h-12 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 outline-none focus:border-teal-700 dark:border-slate-700 dark:bg-slate-950"
                  placeholder="Barcode"
                  value={barcode}
                  onChange={(event) => setBarcode(event.target.value)}
                />
              </form>
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setCategoryId('all')}
                className={`min-h-10 whitespace-nowrap rounded-lg px-4 text-sm font-semibold ${categoryId === 'all' ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
              >
                All
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setCategoryId(category.id)}
                  className={`min-h-10 whitespace-nowrap rounded-lg px-4 text-sm font-semibold ${categoryId === category.id ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
            {visibleProducts.map((product) => {
              const drugDetails = [product.genericName, product.strength, product.dosageForm, product.packSize].filter(Boolean).join(' | ');
              const expired = isExpired(product.expiryDate);
              return (
              <button
                key={product.id}
                type="button"
                onClick={() => addProduct(product)}
                className={`min-h-40 min-w-0 rounded-lg border bg-white p-3 text-left shadow-sm transition active:scale-[0.98] dark:bg-slate-900 ${expired ? 'border-rose-200 opacity-80 dark:border-rose-900' : 'border-slate-200 dark:border-slate-800'}`}
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap gap-1">
                    <span className="min-w-0 rounded-lg bg-teal-50 px-2 py-1 text-[11px] font-bold text-teal-700 dark:bg-teal-950 dark:text-teal-200">
                      {categoryMap.get(product.categoryId)?.name ?? 'Item'}
                    </span>
                    {product.requiresPrescription ? <span className="rounded-lg bg-amber-100 px-2 py-1 text-[11px] font-black text-amber-800 dark:bg-amber-950 dark:text-amber-100">Rx</span> : null}
                  </div>
                  <span className={`text-xs font-bold ${product.stock <= product.lowStockThreshold ? 'text-amber-600' : 'text-slate-400'}`}>{product.stock} left</span>
                </div>
                <h3 className="line-clamp-2 min-h-10 break-words font-bold">{product.name}</h3>
                {drugDetails ? <p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-500">{drugDetails}</p> : null}
                {product.expiryDate ? <p className={`mt-1 text-[11px] font-bold ${expired ? 'text-rose-600' : 'text-slate-400'}`}>Exp {product.expiryDate}</p> : null}
                <p className="mt-2 break-words text-lg font-black text-teal-700">{money(product.sellingPrice, settings.currency)}</p>
              </button>
              );
            })}
          </div>
        </div>

        <CartPanel
          containerClassName="hidden md:block"
          cart={cart}
          subtotal={subtotal}
          discount={discount}
          tax={tax}
          total={total}
          change={change}
          amountReceived={amountReceived}
          setAmountReceived={setAmountReceived}
          globalDiscount={globalDiscount}
          setGlobalDiscount={setGlobalDiscount}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          paymentReference={paymentReference}
          setPaymentReference={setPaymentReference}
          patientName={patientName}
          setPatientName={setPatientName}
          prescriptionReference={prescriptionReference}
          setPrescriptionReference={setPrescriptionReference}
          requiresPrescription={requiresPrescription}
          currency={settings.currency}
          updateQuantity={updateQuantity}
          setCart={setCart}
          checkout={checkout}
        />
      </section>

      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="fixed bottom-24 right-4 z-30 inline-flex min-h-14 min-w-14 items-center justify-center rounded-full bg-teal-700 text-white shadow-soft md:hidden"
        aria-label="Open cart"
      >
        <ShoppingCart size={22} />
        {cart.length > 0 ? <span className="absolute -right-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-amber-400 px-1 text-xs font-black text-slate-950">{cart.length}</span> : null}
      </button>

      <Modal open={drawerOpen} title="Cart" onClose={() => setDrawerOpen(false)}>
        <CartPanel
          containerClassName="block"
          cart={cart}
          subtotal={subtotal}
          discount={discount}
          tax={tax}
          total={total}
          change={change}
          amountReceived={amountReceived}
          setAmountReceived={setAmountReceived}
          globalDiscount={globalDiscount}
          setGlobalDiscount={setGlobalDiscount}
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          paymentReference={paymentReference}
          setPaymentReference={setPaymentReference}
          patientName={patientName}
          setPatientName={setPatientName}
          prescriptionReference={prescriptionReference}
          setPrescriptionReference={setPrescriptionReference}
          requiresPrescription={requiresPrescription}
          currency={settings.currency}
          updateQuantity={updateQuantity}
          setCart={setCart}
          checkout={checkout}
        />
      </Modal>

      <Modal open={Boolean(lastReceipt)} title="Receipt saved" onClose={() => setLastReceipt(null)}>
        {lastReceipt ? (
          <div className="space-y-4">
            <ReceiptPreview sale={lastReceipt.sale} items={lastReceipt.items} settings={settings} />
            <div className="grid grid-cols-2 gap-2">
              <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-slate-950 font-semibold text-white dark:bg-white dark:text-slate-950" onClick={printReceipt}>
                <ReceiptText size={18} />
                Print
              </button>
              <button
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-teal-700 font-semibold text-white"
                onClick={async () => {
                  const nativeShare = await shareReceipt(receiptText);
                  toast.success(nativeShare ? 'Share sheet opened' : 'Receipt text copied');
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

interface CartPanelProps {
  cart: CartLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  change: number;
  amountReceived: string;
  setAmountReceived: (value: string) => void;
  globalDiscount: string;
  setGlobalDiscount: (value: string) => void;
  paymentMethod: PaymentMethod;
  setPaymentMethod: (value: PaymentMethod) => void;
  paymentReference: string;
  setPaymentReference: (value: string) => void;
  patientName: string;
  setPatientName: (value: string) => void;
  prescriptionReference: string;
  setPrescriptionReference: (value: string) => void;
  requiresPrescription: boolean;
  currency: string;
  updateQuantity: (productId: string, next: number) => void;
  setCart: React.Dispatch<React.SetStateAction<CartLine[]>>;
  checkout: () => Promise<void>;
  containerClassName?: string;
}

const CartPanel = ({
  containerClassName = '',
  cart,
  subtotal,
  discount,
  tax,
  total,
  change,
  amountReceived,
  setAmountReceived,
  globalDiscount,
  setGlobalDiscount,
  paymentMethod,
  setPaymentMethod,
  paymentReference,
  setPaymentReference,
  patientName,
  setPatientName,
  prescriptionReference,
  setPrescriptionReference,
  requiresPrescription,
  currency,
  updateQuantity,
  setCart,
  checkout
}: CartPanelProps) => (
  <aside className={`${containerClassName} rounded-lg border border-slate-200 bg-white p-3 shadow-soft dark:border-slate-800 dark:bg-slate-900 md:sticky md:top-24 md:max-h-[calc(100vh-7rem)] md:overflow-y-auto`}>
    <div className="mb-3 flex items-center justify-between">
      <h2 className="font-black">Cart</h2>
      <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold dark:bg-slate-800">{cart.length} items</span>
    </div>
    <div className="space-y-2">
      {cart.map((line) => (
        <div key={line.product.id} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold">{line.product.name}</p>
                {line.product.requiresPrescription ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-800 dark:bg-amber-950 dark:text-amber-100">Rx</span> : null}
              </div>
              <p className="text-xs text-slate-500">
                {[line.product.strength, line.product.dosageForm, line.product.packSize, `${money(line.product.sellingPrice, currency)} each`].filter(Boolean).join(' | ')}
              </p>
            </div>
            <button
              type="button"
              className="grid min-h-10 min-w-10 place-items-center rounded-lg text-slate-500"
              onClick={() => setCart((lines) => lines.filter((item) => item.product.id !== line.product.id))}
              aria-label="Remove item"
            >
              <X size={17} />
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700">
              <button className="grid min-h-10 min-w-10 place-items-center" type="button" onClick={() => updateQuantity(line.product.id, line.quantity - 1)} aria-label="Decrease quantity">
                <Minus size={16} />
              </button>
              <span className="min-w-10 text-center text-sm font-bold">{line.quantity}</span>
              <button className="grid min-h-10 min-w-10 place-items-center" type="button" onClick={() => updateQuantity(line.product.id, line.quantity + 1)} aria-label="Increase quantity">
                <Plus size={16} />
              </button>
            </div>
            <input
              className="min-h-10 w-24 rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              type="number"
              min="0"
              placeholder="Disc"
              value={line.discount}
              onChange={(event) => setCart((lines) => lines.map((item) => (item.product.id === line.product.id ? { ...item, discount: Number(event.target.value || 0) } : item)))}
            />
          </div>
        </div>
      ))}
      {cart.length === 0 ? <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">Cart is empty</div> : null}
    </div>

    <div className="mt-4 space-y-3">
      <label className="block text-sm font-semibold">
        Discount
        <input className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" type="number" value={globalDiscount} onChange={(event) => setGlobalDiscount(event.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        {paymentMethods.map((method) => (
          <button
            key={method}
            type="button"
            onClick={() => setPaymentMethod(method)}
            className={`min-h-11 rounded-lg text-sm font-bold ${paymentMethod === method ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
          >
            {paymentLabel(method)}
          </button>
        ))}
      </div>
      {paymentMethod === 'cash' ? (
        <label className="block text-sm font-semibold">
          Amount received
          <input className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" type="number" value={amountReceived} onChange={(event) => setAmountReceived(event.target.value)} />
        </label>
      ) : null}
      {paymentMethod !== 'cash' ? (
        <label className="block text-sm font-semibold">
          Reference note
          <input className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-950" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} />
        </label>
      ) : null}
      {requiresPrescription ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="text-sm font-black text-amber-900 dark:text-amber-100">Prescription details required</p>
          <label className="mt-2 block text-sm font-semibold">
            Patient name (optional)
            <input className="mt-1 min-h-11 w-full rounded-lg border border-amber-200 bg-white px-3 dark:border-amber-900 dark:bg-slate-950" value={patientName} onChange={(event) => setPatientName(event.target.value)} />
          </label>
          <label className="mt-2 block text-sm font-semibold">
            Prescription / Rx reference
            <input className="mt-1 min-h-11 w-full rounded-lg border border-amber-200 bg-white px-3 dark:border-amber-900 dark:bg-slate-950" value={prescriptionReference} onChange={(event) => setPrescriptionReference(event.target.value)} />
          </label>
        </div>
      ) : null}
      <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950">
        <SummaryRow label="Subtotal" value={money(subtotal, currency)} />
        <SummaryRow label="Discount" value={money(discount, currency)} />
        <SummaryRow label="Tax" value={money(tax, currency)} />
        <SummaryRow label="Change" value={money(change, currency)} />
        <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 text-lg font-black dark:border-slate-800">
          <span>Total</span>
          <span>{money(total, currency)}</span>
        </div>
      </div>
      <div className="bg-white pt-3 dark:bg-slate-900 md:sticky md:bottom-0 md:z-50 md:-mx-3 md:-mb-3 md:p-3">
        <button
          type="button"
          onClick={() => void checkout()}
          className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-lg bg-teal-700 font-black text-white shadow-soft disabled:opacity-50"
          disabled={cart.length === 0}
        >
          <ShoppingCart size={18} />
          Complete checkout
        </button>
      </div>
    </div>
  </aside>
);

const SummaryRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between">
    <span className="text-slate-500">{label}</span>
    <span className="font-semibold">{value}</span>
  </div>
);
