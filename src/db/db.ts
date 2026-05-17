import Dexie, { type Table } from 'dexie';
import type {
  Category,
  Expense,
  InventoryLog,
  Product,
  Sale,
  SaleItem,
  Settings,
  Supplier,
  SyncQueueItem,
  User
} from './schema';

export class NexusDatabase extends Dexie {
  users!: Table<User, string>;
  products!: Table<Product, string>;
  categories!: Table<Category, string>;
  sales!: Table<Sale, string>;
  sale_items!: Table<SaleItem, string>;
  inventory_logs!: Table<InventoryLog, string>;
  suppliers!: Table<Supplier, string>;
  expenses!: Table<Expense, string>;
  settings!: Table<Settings, string>;
  sync_queue!: Table<SyncQueueItem, string>;

  constructor() {
    super('nexus_pos_db');
    this.version(1).stores({
      users: 'id, username, role, active, updatedAt, synced, deleted',
      products: 'id, name, categoryId, barcode, active, stock, updatedAt, synced, deleted',
      categories: 'id, name, updatedAt, synced, deleted',
      sales: 'id, receiptNumber, transactionId, cashierId, paymentMethod, createdAt, synced, deleted',
      sale_items: 'id, saleId, productId, createdAt, synced, deleted',
      inventory_logs: 'id, productId, type, createdAt, synced, deleted',
      suppliers: 'id, name, updatedAt, synced, deleted',
      expenses: 'id, category, paidAt, synced, deleted',
      settings: 'id, updatedAt, synced',
      sync_queue: 'id, table, recordId, action, attempts, createdAt, synced, deleted'
    });
  }
}

export const db = new NexusDatabase();
