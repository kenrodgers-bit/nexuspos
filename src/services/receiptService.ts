import type { Sale, SaleItem, Settings } from '../db/schema';
import { money, paymentLabel, shortDateTime } from '../utils/format';

export const buildReceiptText = (sale: Sale, items: SaleItem[], settings: Settings) => {
  const line = '-'.repeat(settings.receiptWidth === '58mm' ? 32 : 42);
  const rows = items.map((item) => {
    const qty = `${item.quantity} x ${money(item.unitPrice, settings.currency)}`;
    return `${item.productName}\n${qty.padEnd(20)} ${money(item.total, settings.currency)}`;
  });
  return [
    settings.businessName,
    settings.businessAddress,
    settings.businessPhone,
    line,
    `Receipt: ${sale.receiptNumber}`,
    `Txn: ${sale.transactionId}`,
    `Cashier: ${sale.cashierName}`,
    `Date: ${shortDateTime(sale.createdAt)}`,
    line,
    ...rows,
    line,
    `Subtotal: ${money(sale.subtotal, settings.currency)}`,
    `Discount: ${money(sale.discount, settings.currency)}`,
    `Tax: ${money(sale.tax, settings.currency)}`,
    `Total: ${money(sale.total, settings.currency)}`,
    `Paid: ${paymentLabel(sale.paymentMethod)}`,
    sale.mpesaReference ? `M-Pesa Ref: ${sale.mpesaReference}` : undefined,
    `Received: ${money(sale.amountReceived, settings.currency)}`,
    `Change: ${money(sale.changeDue, settings.currency)}`,
    line,
    settings.receiptFooter
  ]
    .filter(Boolean)
    .join('\n');
};

export const printReceipt = () => {
  window.print();
};

export const shareReceipt = async (text: string) => {
  const nav = navigator as Navigator & {
    share?: (data: ShareData) => Promise<void>;
    clipboard?: Clipboard;
  };
  if (nav.share) {
    await nav.share({ title: 'Nexus POS Receipt', text });
    return true;
  }
  if (nav.clipboard) await nav.clipboard.writeText(text);
  return false;
};
