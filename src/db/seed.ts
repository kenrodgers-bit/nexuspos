import { v4 as uuid } from 'uuid';
import { db } from './db';
import type { Category, Product, Settings, Supplier, User } from './schema';
import { hashSecret, nowIso } from '../utils/security';

const stamp = () => ({ createdAt: nowIso(), updatedAt: nowIso(), synced: false });

const categorySeed = [
  ['Staples', '#0f766e'],
  ['Beverages', '#2563eb'],
  ['Household', '#f97316'],
  ['Snacks', '#7c3aed'],
  ['Personal Care', '#db2777']
] as const;

const productSeed: Array<Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'synced' | 'active'>> = [
  { name: 'Jogoo Maize Flour 2kg', categoryId: 'Staples', barcode: '6161100001012', buyingPrice: 145, sellingPrice: 185, stock: 36, lowStockThreshold: 8 },
  { name: 'Pishori Rice 1kg', categoryId: 'Staples', barcode: '6161100001029', buyingPrice: 185, sellingPrice: 240, stock: 22, lowStockThreshold: 6 },
  { name: 'Dola Wheat Flour 2kg', categoryId: 'Staples', barcode: '6161100001036', buyingPrice: 150, sellingPrice: 195, stock: 18, lowStockThreshold: 7 },
  { name: 'Ushindi Cooking Oil 1L', categoryId: 'Staples', barcode: '6161100001043', buyingPrice: 245, sellingPrice: 320, stock: 14, lowStockThreshold: 5 },
  { name: 'Mumias Sugar 1kg', categoryId: 'Staples', barcode: '6161100001050', buyingPrice: 135, sellingPrice: 175, stock: 30, lowStockThreshold: 10 },
  { name: 'Brookside Milk 500ml', categoryId: 'Beverages', barcode: '6161100001067', buyingPrice: 55, sellingPrice: 70, stock: 44, lowStockThreshold: 12 },
  { name: 'Ketepa Tea Leaves 250g', categoryId: 'Beverages', barcode: '6161100001074', buyingPrice: 155, sellingPrice: 210, stock: 20, lowStockThreshold: 5 },
  { name: 'Minute Maid Mango 1L', categoryId: 'Beverages', barcode: '6161100001081', buyingPrice: 135, sellingPrice: 180, stock: 15, lowStockThreshold: 5 },
  { name: 'Dasani Water 500ml', categoryId: 'Beverages', barcode: '6161100001098', buyingPrice: 28, sellingPrice: 50, stock: 60, lowStockThreshold: 20 },
  { name: 'Soda 500ml Assorted', categoryId: 'Beverages', barcode: '6161100001104', buyingPrice: 55, sellingPrice: 80, stock: 48, lowStockThreshold: 15 },
  { name: 'Ariel Detergent 500g', categoryId: 'Household', barcode: '6161100001111', buyingPrice: 190, sellingPrice: 260, stock: 16, lowStockThreshold: 4 },
  { name: 'Sunlight Bar Soap 800g', categoryId: 'Household', barcode: '6161100001128', buyingPrice: 115, sellingPrice: 155, stock: 26, lowStockThreshold: 6 },
  { name: 'Toilet Tissue 10 Pack', categoryId: 'Household', barcode: '6161100001135', buyingPrice: 310, sellingPrice: 420, stock: 9, lowStockThreshold: 4 },
  { name: 'Royco Cubes 20 Pack', categoryId: 'Household', barcode: '6161100001142', buyingPrice: 70, sellingPrice: 100, stock: 34, lowStockThreshold: 10 },
  { name: 'Blue Band 250g', categoryId: 'Staples', barcode: '6161100001159', buyingPrice: 105, sellingPrice: 145, stock: 20, lowStockThreshold: 6 },
  { name: 'Tropical Heat Crisps', categoryId: 'Snacks', barcode: '6161100001166', buyingPrice: 45, sellingPrice: 70, stock: 40, lowStockThreshold: 12 },
  { name: 'Britania Biscuits 100g', categoryId: 'Snacks', barcode: '6161100001173', buyingPrice: 35, sellingPrice: 55, stock: 38, lowStockThreshold: 10 },
  { name: 'Cadbury Chocolate 80g', categoryId: 'Snacks', barcode: '6161100001180', buyingPrice: 95, sellingPrice: 140, stock: 12, lowStockThreshold: 5 },
  { name: 'Colgate Toothpaste 140g', categoryId: 'Personal Care', barcode: '6161100001197', buyingPrice: 145, sellingPrice: 210, stock: 18, lowStockThreshold: 5 },
  { name: 'Always Pads 8 Pack', categoryId: 'Personal Care', barcode: '6161100001203', buyingPrice: 115, sellingPrice: 170, stock: 21, lowStockThreshold: 6 }
];

export const defaultSettings = (): Settings => ({
  id: 'default',
  businessName: 'Nexus Retail Shop',
  currency: 'KES',
  taxRate: 0,
  receiptFooter: 'Thank you for shopping with us.',
  theme: 'light',
  syncEnabled: true,
  autoLockMinutes: 10,
  receiptWidth: '58mm',
  businessPhone: '+254 700 000 000',
  businessAddress: 'Nairobi, Kenya',
  ...stamp()
});

export const initializeDatabase = async () => {
  const settingsCount = await db.settings.count();
  if (settingsCount > 0) return;

  const categories: Category[] = categorySeed.map(([name, color]) => ({
    id: uuid(),
    name,
    color,
    ...stamp()
  }));
  const categoryByName = new Map(categories.map((category) => [category.name, category.id]));

  const users: User[] = [
    {
      id: uuid(),
      name: 'Admin User',
      username: 'admin',
      role: 'admin',
      passwordHash: await hashSecret('admin123'),
      active: true,
      ...stamp()
    },
    {
      id: uuid(),
      name: 'Cashier One',
      role: 'cashier',
      pinHash: await hashSecret('1234'),
      active: true,
      ...stamp()
    }
  ];

  const products: Product[] = productSeed.map((product) => ({
    ...product,
    id: uuid(),
    categoryId: categoryByName.get(product.categoryId) ?? categories[0].id,
    active: true,
    ...stamp()
  }));

  const suppliers: Supplier[] = [
    { id: uuid(), name: 'Eastlands Wholesale', phone: '+254 711 222 333', notes: 'Dry goods and household restocks', ...stamp() },
    { id: uuid(), name: 'Nairobi Beverage Depot', phone: '+254 722 444 555', notes: 'Beverages and snacks', ...stamp() }
  ];

  await db.transaction('rw', [db.users, db.categories, db.products, db.suppliers, db.settings], async () => {
    await db.users.bulkAdd(users);
    await db.categories.bulkAdd(categories);
    await db.products.bulkAdd(products);
    await db.suppliers.bulkAdd(suppliers);
    await db.settings.add(defaultSettings());
  });
};

export const getSettings = async () => (await db.settings.get('default')) ?? defaultSettings();
