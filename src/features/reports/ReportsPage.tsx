import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, TrendingUp } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { db } from '../../db/db';
import type { Sale, SaleItem } from '../../db/schema';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { useAppStore } from '../../store/appStore';
import { downloadFile, money, paymentLabel } from '../../utils/format';

const daysBack = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

export const ReportsPage = () => {
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(0);
  const currency = useAppStore((state) => state.settings.currency);
  const sales = useLiveQuery(() => db.sales.toArray(), [], [] as Sale[]);
  const items = useLiveQuery(() => db.sale_items.toArray(), [], [] as SaleItem[]);
  const completed = sales.filter((sale) => sale.status === 'completed');

  const stats = useMemo(() => {
    const today = completed.filter((sale) => new Date(sale.createdAt) >= daysBack(1));
    const week = completed.filter((sale) => new Date(sale.createdAt) >= daysBack(7));
    const month = completed.filter((sale) => new Date(sale.createdAt) >= daysBack(30));
    const sum = (rows: Sale[]) => rows.reduce((total, sale) => total + sale.total, 0);
    const profit = (rows: Sale[]) => rows.reduce((total, sale) => total + sale.profit, 0);
    return {
      daily: sum(today),
      weekly: sum(week),
      monthly: sum(month),
      profit: profit(month)
    };
  }, [completed]);

  const topProducts = useMemo(() => {
    const map = new Map<string, { name: string; quantity: number; total: number }>();
    items.forEach((item) => {
      const existing = map.get(item.productId) ?? { name: item.productName, quantity: 0, total: 0 };
      existing.quantity += item.quantity;
      existing.total += item.total;
      map.set(item.productId, existing);
    });
    return [...map.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 8);
  }, [items]);

  const byCashier = useMemo(() => groupSales(completed, (sale) => sale.cashierName), [completed]);
  const byPayment = useMemo(() => groupSales(completed, (sale) => paymentLabel(sale.paymentMethod)), [completed]);
  const chartData = useMemo(() => {
    const rows = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      return { label: date.toLocaleDateString('en-KE', { weekday: 'short' }), revenue: 0 };
    });
    completed.forEach((sale) => {
      const saleDate = new Date(sale.createdAt);
      const row = rows.find((_, index) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - index));
        return saleDate.toDateString() === date.toDateString();
      });
      if (row) row.revenue += sale.total;
    });
    return rows;
  }, [completed]);

  const exportCsv = () => {
    const rows = [
      ['Receipt', 'Date', 'Cashier', 'Payment', 'Subtotal', 'Discount', 'Tax', 'Total', 'Profit'],
      ...completed.map((sale) => [
        sale.receiptNumber,
        sale.createdAt,
        sale.cashierName,
        sale.paymentMethod,
        sale.subtotal,
        sale.discount,
        sale.tax,
        sale.total,
        sale.profit
      ])
    ];
    downloadFile('nexus-pos-sales.csv', rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
  };

  useEffect(() => {
    if (!chartRef.current) return;
    const update = () => setChartWidth(chartRef.current?.getBoundingClientRect().width ?? 0);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(chartRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black">Reports</h1>
          <p className="text-sm text-slate-500">Generated entirely from local IndexedDB sales.</p>
        </div>
        <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 font-semibold text-white" onClick={exportCsv}>
          <Download size={18} />
          Export CSV
        </button>
      </div>

      <section className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 md:grid-cols-4">
        <ReportMetric label="Daily sales" value={money(stats.daily, currency)} />
        <ReportMetric label="Weekly sales" value={money(stats.weekly, currency)} />
        <ReportMetric label="Monthly sales" value={money(stats.monthly, currency)} />
        <ReportMetric label="Profit report" value={money(stats.profit, currency)} />
      </section>

      <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp className="text-teal-700" />
          <h2 className="font-bold">Revenue by day</h2>
        </div>
        <div ref={chartRef} className="h-64 min-w-0">
          {chartWidth > 0 ? (
            <BarChart width={chartWidth} height={256} data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} />
              <YAxis axisLine={false} tickLine={false} width={54} />
              <Tooltip formatter={(value) => money(Number(value), currency)} />
              <Bar dataKey="revenue" fill="#0f766e" radius={[8, 8, 0, 0]} />
            </BarChart>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <ReportList title="Top-selling products" rows={topProducts.map((item) => [item.name, `${item.quantity} sold · ${money(item.total, currency)}`])} />
        <ReportList title="Sales by cashier" rows={byCashier.map((item) => [item.label, money(item.total, currency)])} />
        <ReportList title="Payment methods" rows={byPayment.map((item) => [item.label, money(item.total, currency)])} />
      </section>
    </div>
  );
};

const groupSales = (sales: Sale[], key: (sale: Sale) => string) => {
  const map = new Map<string, { label: string; total: number }>();
  sales.forEach((sale) => {
    const label = key(sale);
    const current = map.get(label) ?? { label, total: 0 };
    current.total += sale.total;
    map.set(label, current);
  });
  return [...map.values()].sort((a, b) => b.total - a.total);
};

const ReportMetric = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-2 break-words text-lg font-black">{value}</p>
  </div>
);

const ReportList = ({ title, rows }: { title: string; rows: string[][] }) => (
  <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
    <h2 className="mb-3 font-bold">{title}</h2>
    <div className="space-y-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-950">
          <span className="min-w-0 break-words font-semibold">{label}</span>
          <span className="shrink-0 text-right text-slate-500">{value}</span>
        </div>
      ))}
      {rows.length === 0 ? <p className="text-sm text-slate-500">No data yet.</p> : null}
    </div>
  </div>
);
