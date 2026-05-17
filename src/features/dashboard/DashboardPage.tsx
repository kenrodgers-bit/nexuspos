import { useMemo } from 'react';
import { AlertTriangle, Banknote, CreditCard, Receipt, RefreshCcw, ShoppingBag, TrendingUp } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { db } from '../../db/db';
import type { Sale } from '../../db/schema';
import { useLiveQuery } from '../../hooks/useLiveQuery';
import { useAppStore } from '../../store/appStore';
import { isSameDay, money, paymentLabel, shortDateTime, startOfDayIso } from '../../utils/format';

export const DashboardPage = () => {
  const currency = useAppStore((state) => state.settings.currency);
  const pendingSync = useAppStore((state) => state.pendingSync);
  const sales = useLiveQuery(() => db.sales.orderBy('createdAt').reverse().toArray(), [], [] as Sale[]);
  const products = useLiveQuery(() => db.products.toArray(), [], []);
  const todaySales = sales.filter((sale) => sale.status === 'completed' && isSameDay(sale.createdAt));
  const revenue = todaySales.reduce((sum, sale) => sum + sale.total, 0);
  const profit = todaySales.reduce((sum, sale) => sum + sale.profit, 0);
  const lowStock = products.filter((product) => product.active && !product.deleted && product.stock <= product.lowStockThreshold);

  const chartData = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      return {
        label: date.toLocaleDateString('en-KE', { weekday: 'short' }),
        date,
        revenue: 0
      };
    });
    sales.forEach((sale) => {
      const bucket = days.find((day) => isSameDay(sale.createdAt, day.date));
      if (bucket) bucket.revenue += sale.total;
    });
    return days;
  }, [sales]);

  const paymentSummary = todaySales.reduce<Record<string, number>>((acc, sale) => {
    acc[sale.paymentMethod] = (acc[sale.paymentMethod] ?? 0) + sale.total;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric icon={Banknote} label="Revenue today" value={money(revenue, currency)} />
        <Metric icon={Receipt} label="Sales today" value={todaySales.length.toString()} />
        <Metric icon={TrendingUp} label="Profit estimate" value={money(profit, currency)} />
        <Metric icon={RefreshCcw} label="Pending sync" value={pendingSync.toString()} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">Sales chart</h2>
            <span className="text-xs text-slate-500">Since {new Date(startOfDayIso()).toLocaleDateString('en-KE')}</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0f766e" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#0f766e" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={54} />
                <Tooltip formatter={(value) => money(Number(value), currency)} />
                <Area type="monotone" dataKey="revenue" stroke="#0f766e" strokeWidth={3} fill="url(#salesGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 font-bold">Payment summary</h2>
          <div className="space-y-3">
            {(['cash', 'mpesa', 'card'] as const).map((method) => (
              <div key={method} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
                <span className="inline-flex items-center gap-2 text-sm font-semibold">
                  <CreditCard size={17} className="text-teal-700" />
                  {paymentLabel(method)}
                </span>
                <span className="text-sm font-bold">{money(paymentSummary[method] ?? 0, currency)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 font-bold">Recent transactions</h2>
          <div className="space-y-2">
            {sales.slice(0, 6).map((sale) => (
              <div key={sale.id} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 dark:bg-slate-950">
                <div>
                  <p className="text-sm font-semibold">{sale.receiptNumber}</p>
                  <p className="text-xs text-slate-500">{shortDateTime(sale.createdAt)} · {sale.cashierName}</p>
                </div>
                <strong>{money(sale.total, currency)}</strong>
              </div>
            ))}
            {sales.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">No sales yet. Your first checkout will appear here.</p> : null}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 font-bold">Low stock alerts</h2>
          <div className="space-y-2">
            {lowStock.slice(0, 8).map((product) => (
              <div key={product.id} className="flex items-center justify-between rounded-lg bg-amber-50 p-3 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                <span className="inline-flex items-center gap-2 text-sm font-semibold">
                  <AlertTriangle size={17} />
                  {product.name}
                </span>
                <span className="text-sm">{product.stock} left</span>
              </div>
            ))}
            {lowStock.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">Stock levels are healthy.</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
};

const Metric = ({ icon: Icon, label, value }: { icon: typeof ShoppingBag; label: string; value: string }) => (
  <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-900">
    <div className="mb-3 grid h-11 w-11 place-items-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-200">
      <Icon size={20} />
    </div>
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-xl font-black">{value}</p>
  </div>
);
