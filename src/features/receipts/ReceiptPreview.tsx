import type { Sale, SaleItem, Settings } from '../../db/schema';
import { money, paymentLabel, shortDateTime } from '../../utils/format';
import { logoSrc } from '../../utils/brand';

export const ReceiptPreview = ({ sale, items, settings }: { sale: Sale; items: SaleItem[]; settings: Settings }) => (
  <div id="printable-receipt" className={`receipt-paper rounded-lg p-4 shadow-soft ${settings.receiptWidth === '58mm' ? 'receipt-paper-58' : ''}`}>
    <div className="text-center">
      <img src={logoSrc(settings.logo)} alt="" className="mx-auto mb-2 h-14 w-14 rounded object-cover" />
      <h2 className="text-base font-bold">{settings.businessName}</h2>
      {settings.businessAddress ? <p>{settings.businessAddress}</p> : null}
      {settings.businessPhone ? <p>{settings.businessPhone}</p> : null}
    </div>
    <hr className="my-2 border-dashed border-slate-400" />
    <p>Receipt: {sale.receiptNumber}</p>
    <p>Txn: {sale.transactionId}</p>
    <p>Cashier: {sale.cashierName}</p>
    <p>Date: {shortDateTime(sale.createdAt)}</p>
    <hr className="my-2 border-dashed border-slate-400" />
    <div className="space-y-1">
      {items.map((item) => (
        <div key={item.id}>
          <p className="font-bold">{item.productName}</p>
          <div className="flex justify-between">
            <span>{item.quantity} x {money(item.unitPrice, settings.currency)}</span>
            <span>{money(item.total, settings.currency)}</span>
          </div>
        </div>
      ))}
    </div>
    <hr className="my-2 border-dashed border-slate-400" />
    <div className="space-y-1">
      <Row label="Subtotal" value={money(sale.subtotal, settings.currency)} />
      <Row label="Discount" value={money(sale.discount, settings.currency)} />
      <Row label="Tax" value={money(sale.tax, settings.currency)} />
      <Row label="Total" value={money(sale.total, settings.currency)} strong />
      <Row label="Payment" value={paymentLabel(sale.paymentMethod)} />
      {sale.paymentReference || sale.mpesaReference ? <Row label="Reference" value={sale.paymentReference ?? sale.mpesaReference ?? ''} /> : null}
      {sale.patientName ? <Row label="Patient" value={sale.patientName} /> : null}
      {sale.prescriptionReference ? <Row label="Rx ref" value={sale.prescriptionReference} /> : null}
      <Row label="Received" value={money(sale.amountReceived, settings.currency)} />
      <Row label="Change" value={money(sale.changeDue, settings.currency)} />
    </div>
    <hr className="my-2 border-dashed border-slate-400" />
    <p className="text-center">{settings.receiptFooter}</p>
  </div>
);

const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className={`flex justify-between gap-3 ${strong ? 'text-base font-bold' : ''}`}>
    <span>{label}</span>
    <span>{value}</span>
  </div>
);
