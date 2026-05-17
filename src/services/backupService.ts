import { db } from '../db/db';
import { defaultSettings } from '../db/seed';
import { downloadFile } from '../utils/format';

const tables = ['users', 'products', 'categories', 'sales', 'sale_items', 'inventory_logs', 'suppliers', 'expenses', 'settings', 'sync_queue'] as const;

export interface BackupPayload {
  app: 'Nexus POS';
  version: 1;
  exportedAt: string;
  tables: Record<(typeof tables)[number], unknown[]>;
}

export const exportBackup = async () => {
  const payload = {
    app: 'Nexus POS',
    version: 1,
    exportedAt: new Date().toISOString(),
    tables: Object.fromEntries(await Promise.all(tables.map(async (table) => [table, await db.table(table).toArray()])))
  } satisfies BackupPayload;
  downloadFile(`nexus-pos-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2));
};

export const parseBackupFile = async (file: File): Promise<BackupPayload> => {
  const text = await file.text();
  const parsed = JSON.parse(text) as BackupPayload;
  if (parsed.app !== 'Nexus POS' || parsed.version !== 1 || !parsed.tables) {
    throw new Error('This file is not a valid Nexus POS backup.');
  }
  for (const table of tables) {
    if (!Array.isArray(parsed.tables[table])) {
      throw new Error(`Backup is missing the ${table} table.`);
    }
  }
  return parsed;
};

export const restoreBackup = async (backup: BackupPayload) => {
  await db.transaction('rw', tables.map((table) => db.table(table)), async () => {
    for (const table of tables) {
      await db.table(table).clear();
      if (backup.tables[table].length > 0) await db.table(table).bulkPut(backup.tables[table]);
    }
    if ((await db.settings.count()) === 0) await db.settings.put(defaultSettings());
  });
};
