import { v4 as uuid } from 'uuid';
import { db } from './db';
import type { Category, Product, Settings, Supplier, User } from './schema';
import { hashSecret, nowIso } from '../utils/security';
import { DEFAULT_LOGO_SRC } from '../utils/brand';

const stamp = () => ({ createdAt: nowIso(), updatedAt: nowIso(), synced: false });

const categorySeed = [
  ['Analgesics', '#0f766e'],
  ['Antibiotics', '#2563eb'],
  ['Cough & Cold', '#f97316'],
  ['Vitamins', '#7c3aed'],
  ['First Aid', '#db2777']
] as const;

const productSeed: Array<Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'synced' | 'active'>> = [
  { name: 'Paracetamol 500mg', genericName: 'Paracetamol', strength: '500mg', dosageForm: 'Tablet', packSize: 'strip of 10', categoryId: 'Analgesics', barcode: '6161100001012', batchNumber: 'PCM-26A', expiryDate: '2027-10-31', requiresPrescription: false, buyingPrice: 18, sellingPrice: 30, stock: 120, lowStockThreshold: 30 },
  { name: 'Ibuprofen 400mg', genericName: 'Ibuprofen', strength: '400mg', dosageForm: 'Tablet', packSize: 'strip of 10', categoryId: 'Analgesics', barcode: '6161100001029', batchNumber: 'IBU-26B', expiryDate: '2027-08-31', requiresPrescription: false, buyingPrice: 35, sellingPrice: 60, stock: 80, lowStockThreshold: 20 },
  { name: 'Diclofenac Gel 30g', genericName: 'Diclofenac', strength: '1%', dosageForm: 'Gel', packSize: 'tube 30g', categoryId: 'Analgesics', barcode: '6161100001036', batchNumber: 'DIC-26C', expiryDate: '2027-09-30', requiresPrescription: false, buyingPrice: 120, sellingPrice: 190, stock: 25, lowStockThreshold: 8 },
  { name: 'Amoxicillin 500mg', genericName: 'Amoxicillin', strength: '500mg', dosageForm: 'Capsule', packSize: 'capsule strip of 10', categoryId: 'Antibiotics', barcode: '6161100001043', batchNumber: 'AMX-26A', expiryDate: '2027-07-31', requiresPrescription: true, buyingPrice: 110, sellingPrice: 180, stock: 45, lowStockThreshold: 12 },
  { name: 'Azithromycin 500mg', genericName: 'Azithromycin', strength: '500mg', dosageForm: 'Tablet', packSize: 'pack of 3 tablets', categoryId: 'Antibiotics', barcode: '6161100001050', batchNumber: 'AZI-26D', expiryDate: '2027-06-30', requiresPrescription: true, buyingPrice: 190, sellingPrice: 320, stock: 26, lowStockThreshold: 8 },
  { name: 'Metronidazole 400mg', genericName: 'Metronidazole', strength: '400mg', dosageForm: 'Tablet', packSize: 'strip of 10', categoryId: 'Antibiotics', barcode: '6161100001067', batchNumber: 'MET-26F', expiryDate: '2027-11-30', requiresPrescription: true, buyingPrice: 45, sellingPrice: 80, stock: 65, lowStockThreshold: 18 },
  { name: 'Cough Syrup Adult', genericName: 'Cough mixture', strength: '100ml', dosageForm: 'Syrup', packSize: 'bottle 100ml', categoryId: 'Cough & Cold', barcode: '6161100001074', batchNumber: 'COU-26A', expiryDate: '2027-05-31', requiresPrescription: false, buyingPrice: 95, sellingPrice: 160, stock: 32, lowStockThreshold: 10 },
  { name: 'Children Cough Syrup', genericName: 'Paediatric cough mixture', strength: '60ml', dosageForm: 'Syrup', packSize: 'bottle 60ml', categoryId: 'Cough & Cold', barcode: '6161100001081', batchNumber: 'CCS-26B', expiryDate: '2027-05-31', requiresPrescription: false, buyingPrice: 75, sellingPrice: 130, stock: 28, lowStockThreshold: 10 },
  { name: 'Cetirizine 10mg', genericName: 'Cetirizine', strength: '10mg', dosageForm: 'Tablet', packSize: 'strip of 10', categoryId: 'Cough & Cold', barcode: '6161100001098', batchNumber: 'CET-26A', expiryDate: '2028-01-31', requiresPrescription: false, buyingPrice: 22, sellingPrice: 45, stock: 90, lowStockThreshold: 25 },
  { name: 'Vitamin C 1000mg', genericName: 'Ascorbic acid', strength: '1000mg', dosageForm: 'Effervescent tablet', packSize: 'tube of 20 tablets', categoryId: 'Vitamins', barcode: '6161100001104', batchNumber: 'VTC-26A', expiryDate: '2028-03-31', requiresPrescription: false, buyingPrice: 180, sellingPrice: 280, stock: 20, lowStockThreshold: 6 },
  { name: 'Multivitamin Capsules', genericName: 'Multivitamin', strength: 'Adult formula', dosageForm: 'Capsule', packSize: 'bottle of 30', categoryId: 'Vitamins', barcode: '6161100001111', batchNumber: 'MVT-26B', expiryDate: '2028-02-29', requiresPrescription: false, buyingPrice: 260, sellingPrice: 420, stock: 18, lowStockThreshold: 5 },
  { name: 'Zinc Tablets 20mg', genericName: 'Zinc sulphate', strength: '20mg', dosageForm: 'Tablet', packSize: 'strip of 10', categoryId: 'Vitamins', barcode: '6161100001128', batchNumber: 'ZIN-26A', expiryDate: '2028-04-30', requiresPrescription: false, buyingPrice: 55, sellingPrice: 95, stock: 50, lowStockThreshold: 15 },
  { name: 'Oral Rehydration Salts', genericName: 'ORS', strength: 'WHO formula', dosageForm: 'Sachet', packSize: 'sachet', categoryId: 'First Aid', barcode: '6161100001135', batchNumber: 'ORS-26A', expiryDate: '2028-03-31', requiresPrescription: false, buyingPrice: 12, sellingPrice: 25, stock: 140, lowStockThreshold: 35 },
  { name: 'Hydrogen Peroxide', genericName: 'Hydrogen peroxide', strength: '3%', dosageForm: 'Solution', packSize: 'bottle 100ml', categoryId: 'First Aid', barcode: '6161100001142', batchNumber: 'HPX-26A', expiryDate: '2027-12-31', requiresPrescription: false, buyingPrice: 45, sellingPrice: 80, stock: 30, lowStockThreshold: 8 },
  { name: 'Surgical Gloves', genericName: 'Latex gloves', dosageForm: 'Pair', packSize: 'pair', categoryId: 'First Aid', barcode: '6161100001159', batchNumber: 'GLV-26A', expiryDate: '2029-01-31', requiresPrescription: false, buyingPrice: 18, sellingPrice: 35, stock: 160, lowStockThreshold: 40 },
  { name: 'Crepe Bandage', genericName: 'Crepe bandage', strength: '4 inch', dosageForm: 'Bandage', packSize: 'roll 4 inch', categoryId: 'First Aid', barcode: '6161100001166', batchNumber: 'CRP-26A', expiryDate: '2029-01-31', requiresPrescription: false, buyingPrice: 60, sellingPrice: 110, stock: 35, lowStockThreshold: 10 },
  { name: 'Antacid Suspension', genericName: 'Magnesium/aluminium antacid', strength: '200ml', dosageForm: 'Suspension', packSize: 'bottle 200ml', categoryId: 'Cough & Cold', barcode: '6161100001173', batchNumber: 'ANT-26B', expiryDate: '2027-06-30', requiresPrescription: false, buyingPrice: 150, sellingPrice: 240, stock: 22, lowStockThreshold: 6 },
  { name: 'Omeprazole 20mg', genericName: 'Omeprazole', strength: '20mg', dosageForm: 'Capsule', packSize: 'strip of 14', categoryId: 'Analgesics', barcode: '6161100001180', batchNumber: 'OME-26B', expiryDate: '2027-11-30', requiresPrescription: false, buyingPrice: 75, sellingPrice: 130, stock: 48, lowStockThreshold: 12 },
  { name: 'Clotrimazole Cream', genericName: 'Clotrimazole', strength: '1%', dosageForm: 'Cream', packSize: 'tube 20g', categoryId: 'First Aid', barcode: '6161100001197', batchNumber: 'CLO-26A', expiryDate: '2027-09-30', requiresPrescription: false, buyingPrice: 80, sellingPrice: 140, stock: 24, lowStockThreshold: 8 },
  { name: 'Ferrous Sulphate', genericName: 'Ferrous sulphate', strength: '200mg', dosageForm: 'Tablet', packSize: 'strip of 10', categoryId: 'Vitamins', barcode: '6161100001203', batchNumber: 'FER-26A', expiryDate: '2028-05-31', requiresPrescription: false, buyingPrice: 30, sellingPrice: 55, stock: 70, lowStockThreshold: 18 }
];

export const defaultSettings = (): Settings => ({
  id: 'default',
  businessName: 'Nexus Retail Shop',
  logo: DEFAULT_LOGO_SRC,
  currency: 'KES',
  taxRate: 0,
  receiptFooter: 'Thank you for shopping with us.',
  theme: 'light',
  syncEnabled: true,
  setupCompleted: false,
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
