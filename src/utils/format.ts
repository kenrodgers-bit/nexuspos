import type { PaymentMethod } from '../db/schema';

export const money = (value: number, currency = 'KES') =>
  new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(Number.isFinite(value) ? value : 0);

export const shortDateTime = (value: string | Date) =>
  new Intl.DateTimeFormat('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(typeof value === 'string' ? new Date(value) : value);

export const isSameDay = (value: string, date = new Date()) => {
  const parsed = new Date(value);
  return parsed.getFullYear() === date.getFullYear() && parsed.getMonth() === date.getMonth() && parsed.getDate() === date.getDate();
};

export const startOfDayIso = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export const paymentLabel = (method: PaymentMethod) => {
  if (method === 'mpesa') return 'M-Pesa';
  if (method === 'bank_transfer') return 'Bank Transfer';
  return method[0].toUpperCase() + method.slice(1);
};

export const downloadFile = (filename: string, content: string, type = 'application/json') => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};
