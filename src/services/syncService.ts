import { v4 as uuid } from 'uuid';
import { db } from '../db/db';
import type { Settings, SyncAction, SyncQueueItem } from '../db/schema';
import { nowIso } from '../utils/security';

export interface SyncAdapter {
  push: (item: SyncQueueItem) => Promise<{ ok: boolean; remoteId?: string }>;
}

class MockSyncAdapter implements SyncAdapter {
  async push() {
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    return { ok: true };
  }
}

const markTableSynced = async (table: string, recordId: string) => {
  const target = db.table(table);
  const record = await target.get(recordId);
  if (record) {
    await target.update(recordId, { synced: true, updatedAt: nowIso() });
  }
};

class SyncService {
  private adapter: SyncAdapter = new MockSyncAdapter();
  private syncing = false;
  private listeners = new Set<(count: number) => void>();

  setAdapter(adapter: SyncAdapter) {
    this.adapter = adapter;
  }

  subscribe(listener: (count: number) => void) {
    this.listeners.add(listener);
    void this.pendingCount().then(listener);
    return () => this.listeners.delete(listener);
  }

  async pendingCount() {
    return db.sync_queue.filter((item) => !item.synced && !item.deleted).count();
  }

  private async emit() {
    const count = await this.pendingCount();
    this.listeners.forEach((listener) => listener(count));
  }

  async queue(table: string, recordId: string, action: SyncAction, payload: unknown) {
    const item: SyncQueueItem = {
      id: uuid(),
      table,
      recordId,
      action,
      payload,
      attempts: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      synced: false,
      deleted: false
    };
    await db.sync_queue.add(item);
    await this.emit();
    if (navigator.onLine) void this.process();
  }

  async process() {
    if (this.syncing || !navigator.onLine) return;
    const settings = await db.settings.get('default');
    if (settings && !settings.syncEnabled) return;
    this.syncing = true;
    try {
      const pending = await db.sync_queue.filter((item) => !item.synced && !item.deleted).sortBy('createdAt');
      for (const item of pending) {
        try {
          await db.sync_queue.update(item.id, { attempts: item.attempts + 1, lastAttemptAt: nowIso(), updatedAt: nowIso() });
          const response = await this.adapter.push(item);
          if (response.ok) {
            await db.transaction('rw', db.sync_queue, db.settings, async () => {
              await db.sync_queue.update(item.id, { synced: true, updatedAt: nowIso() });
              await db.settings.update('default', { lastSyncedAt: nowIso(), synced: false } satisfies Partial<Settings>);
            });
            await markTableSynced(item.table, item.recordId);
          }
        } catch (error) {
          await db.sync_queue.update(item.id, {
            lastError: error instanceof Error ? error.message : 'Sync failed',
            updatedAt: nowIso()
          });
        }
      }
    } finally {
      this.syncing = false;
      await this.emit();
    }
  }

  start() {
    window.addEventListener('online', () => void this.process());
    window.addEventListener('focus', () => void this.process());
    void this.process();
  }
}

export const syncService = new SyncService();
