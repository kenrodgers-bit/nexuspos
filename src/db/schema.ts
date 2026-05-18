import { z } from 'zod';

export type Role = 'admin' | 'cashier';
export type ThemeMode = 'light' | 'dark';
export type PaymentMethod = 'cash' | 'mpesa' | 'card';
export type SyncAction = 'create' | 'update' | 'delete' | 'sale' | 'inventory';

export interface BaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  synced: boolean;
  deleted?: boolean;
}

export interface User extends BaseRecord {
  name: string;
  username?: string;
  role: Role;
  passwordHash?: string;
  pinHash?: string;
  active: boolean;
  lastLoginAt?: string;
}

export interface Category extends BaseRecord {
  name: string;
  color: string;
}

export interface Product extends BaseRecord {
  name: string;
  categoryId: string;
  barcode?: string;
  buyingPrice: number;
  sellingPrice: number;
  stock: number;
  lowStockThreshold: number;
  image?: string;
  active: boolean;
}

export interface Sale extends BaseRecord {
  receiptNumber: string;
  transactionId: string;
  cashierId: string;
  cashierName: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  profit: number;
  paymentMethod: PaymentMethod;
  amountReceived: number;
  changeDue: number;
  mpesaReference?: string;
  status: 'completed' | 'voided';
}

export interface SaleItem extends BaseRecord {
  saleId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  buyingPrice: number;
  discount: number;
  total: number;
  profit: number;
}

export interface InventoryLog extends BaseRecord {
  productId: string;
  productName: string;
  type: 'sale' | 'restock' | 'adjustment';
  quantityChange: number;
  previousStock: number;
  newStock: number;
  supplier?: string;
  note?: string;
  userId: string;
  userName: string;
}

export interface Supplier extends BaseRecord {
  name: string;
  phone?: string;
  notes?: string;
}

export interface Expense extends BaseRecord {
  description: string;
  amount: number;
  category: string;
  paidAt: string;
}

export interface Settings extends BaseRecord {
  businessName: string;
  logo?: string;
  currency: string;
  taxRate: number;
  receiptFooter: string;
  theme: ThemeMode;
  syncEnabled: boolean;
  lastSyncedAt?: string;
  autoLockMinutes: number;
  receiptWidth: '58mm' | '80mm';
  businessPhone?: string;
  businessAddress?: string;
}

export interface SyncQueueItem extends BaseRecord {
  table: string;
  recordId: string;
  action: SyncAction;
  payload: unknown;
  attempts: number;
  lastError?: string;
  lastAttemptAt?: string;
}

export const productFormSchema = z.object({
  name: z.string().trim().min(2, 'Product name is required').max(80),
  categoryId: z.string().min(1, 'Choose a category'),
  barcode: z.string().trim().max(64).optional(),
  buyingPrice: z.number().min(0),
  sellingPrice: z.number().min(0.01),
  stock: z.number().int().min(0),
  lowStockThreshold: z.number().int().min(0),
  image: z.string().optional()
});

export const inventoryFormSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().refine((value) => value !== 0, 'Quantity cannot be zero'),
  supplier: z.string().trim().max(80).optional(),
  note: z.string().trim().max(180).optional(),
  type: z.enum(['restock', 'adjustment'])
});

export const settingsFormSchema = z.object({
  businessName: z.string().trim().min(2).max(80),
  currency: z.string().trim().min(1).max(8),
  taxRate: z.number().min(0).max(100),
  receiptFooter: z.string().trim().max(180),
  theme: z.enum(['light', 'dark']),
  syncEnabled: z.boolean(),
  autoLockMinutes: z.number().int().min(1).max(120),
  receiptWidth: z.enum(['58mm', '80mm']),
  businessPhone: z.string().trim().max(40).optional(),
  businessAddress: z.string().trim().max(120).optional()
});

export const userFormSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    username: z.string().trim().max(40).optional(),
    role: z.enum(['admin', 'cashier']),
    password: z.string().min(6).optional().or(z.literal('')),
    pin: z.string().regex(/^\d{4,8}$/, 'PIN must be 4 to 8 digits').optional().or(z.literal('')),
    active: z.boolean()
  })
  .superRefine((value, ctx) => {
    if (value.role === 'admin' && !value.username) {
      ctx.addIssue({ code: 'custom', message: 'Admin users need a username', path: ['username'] });
    }
  });

export type ProductFormInput = z.infer<typeof productFormSchema>;
export type InventoryFormInput = z.infer<typeof inventoryFormSchema>;
export type SettingsFormInput = z.infer<typeof settingsFormSchema>;
export type UserFormInput = z.infer<typeof userFormSchema>;
