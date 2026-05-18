import { v4 as uuid } from 'uuid';
import { db } from '../db/db';
import type { Settings, SyncAction, SyncQueueItem } from '../db/schema';
import { useAppStore } from '../store/appStore';
import { nowIso } from '../utils/security';

type SyncTable =
  | 'users'
  | 'products'
  | 'categories'
  | 'sales'
  | 'sale_items'
  | 'inventory_logs'
  | 'suppliers'
  | 'expenses'
  | 'settings';

export interface RemoteChange {
  id: string;
  table: SyncTable;
  recordId: string;
  action: SyncAction;
  payload: unknown;
  deviceId?: string;
  changedAt?: string;
}

export interface SyncResponse {
  ok: boolean;
  accepted: string[];
  changes: RemoteChange[];
  serverTime: string;
}

export interface SyncAdapter {
  sync: (request: { deviceId: string; lastPulledAt?: string; changes: SyncQueueItem[] }) => Promise<SyncResponse>;
}

const syncTables: SyncTable[] = [
  'users',
  'products',
  'categories',
  'sales',
  'sale_items',
  'inventory_logs',
  'suppliers',
  'expenses',
  'settings'
];

const DEVICE_KEY = 'nexus-pos-device-id';
const BOOTSTRAP_KEY = 'nexus-pos-cloud-bootstrap-v1';
const SYNC_INTERVAL_MS = 30_000;

const getDeviceId = () => {
  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const next = uuid();
  localStorage.setItem(DEVICE_KEY, next);
  return next;
};

const getEndpoint = () => import.meta.env.VITE_SYNC_ENDPOINT?.trim() || '/api/sync';
const getApiKey = () => import.meta.env.VITE_SYNC_API_KEY?.trim();

class HttpSyncAdapter implements SyncAdapter {
  async sync(request: { deviceId: string; lastPulledAt?: string; changes: SyncQueueItem[] }) {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const apiKey = getApiKey();
    if (apiKey) headers['x-sync-api-key'] = apiKey;

    const response = await fetch(getEndpoint(), {
      method: 'POST',
      headers,
      body: JSON.stringify(request)
    });
    if (!response.ok) throw new Error(`Cloud sync failed (${response.status})`);
    return (await response.json()) as SyncResponse;
  }
}

const markTableSynced = async (table: string, recordId: string) => {
  const target = db.table(table);
  const record = await target.get(recordId);
  if (record) await target.update(recordId, { synced: true });
};

const toRecord = (value: unknown) => (value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined);
const recordUpdatedAt = (record: Record<string, unknown> | undefined, fallback?: string) =>
  Date.parse(String(record?.updatedAt ?? fallback ?? '')) || 0;

const remoteShouldWin = (local: Record<string, unknown> | undefined, remote: Record<string, unknown>, changedAt?: string) => {
  if (!local) return true;
  const localTime = recordUpdatedAt(local);
  const remoteTime = recordUpdatedAt(remote, changedAt);
  if (!localTime || !remoteTime) return true;
  return remoteTime >= localTime;
};

const findMatchingLocalRecord = async (table: SyncTable, record: Record<string, unknown>) => {
  if (table === 'settings') return db.settings.get('default');
  if (table === 'products' && record.barcode) {
    return db.products.where('barcode').equals(String(record.barcode)).first();
  }
  if (table === 'categories' && record.name) {
    return db.categories.filter((category) => category.name.toLowerCase() === String(record.name).toLowerCase()).first();
  }
  if (table === 'users') {
    if (record.username) {
      return db.users.filter((user) => user.username?.toLowerCase() === String(record.username).toLowerCase()).first();
    }
    if (record.name && record.role) {
      return db.users
        .filter((user) => user.name.toLowerCase() === String(record.name).toLowerCase() && user.role === record.role)
        .first();
    }
  }
  return undefined;
};

const upsertRemoteRecord = async (table: SyncTable, payload: unknown, changedAt?: string) => {
  const record = toRecord(payload);
  if (!record) return;
  const remoteId = String(record.id ?? '');
  if (table === 'settings' && remoteId && remoteId !== 'default') return;
  if (!remoteId && table !== 'settings') return;
  const target = db.table(table);
  const lookupId = table === 'settings' ? 'default' : remoteId;
  const direct = (await target.get(lookupId)) as Record<string, unknown> | undefined;
  const matching = direct ?? ((await findMatchingLocalRecord(table, record)) as Record<string, unknown> | undefined);
  const localId = String(matching?.id ?? lookupId);
  const remoteRecord = {
    ...record,
    id: localId,
    updatedAt: String(record.updatedAt ?? changedAt ?? nowIso()),
    synced: true
  };

  if (!remoteShouldWin(matching, remoteRecord, changedAt)) return;
  await target.put(matching ? { ...matching, ...remoteRecord } : remoteRecord);

  if (table === 'settings') {
    const settings = await db.settings.get('default');
    if (settings) useAppStore.getState().setSettings(settings);
  }
};

const applyDelete = async (table: SyncTable, recordId: string, payload: unknown, changedAt?: string) => {
  const record = toRecord(payload) ?? { id: recordId };
  await upsertRemoteRecord(
    table,
    {
      ...record,
      id: record.id ?? recordId,
      active: table === 'products' || table === 'users' ? false : record.active,
      deleted: true,
      updatedAt: record.updatedAt ?? changedAt ?? nowIso()
    },
    changedAt
  );
};

const applyCompositeSale = async (change: RemoteChange) => {
  const payload = toRecord(change.payload);
  if (!payload) return false;
  const sale = payload.sale;
  const items = Array.isArray(payload.items) ? payload.items : [];
  const productUpdates = Array.isArray(payload.productUpdates) ? payload.productUpdates : [];
  const inventoryLogs = Array.isArray(payload.inventoryLogs) ? payload.inventoryLogs : [];
  if (!sale) return false;

  await upsertRemoteRecord('sales', sale, change.changedAt);
  for (const item of items) await upsertRemoteRecord('sale_items', item, change.changedAt);
  for (const product of productUpdates) await upsertRemoteRecord('products', product, change.changedAt);
  for (const log of inventoryLogs) await upsertRemoteRecord('inventory_logs', log, change.changedAt);
  return true;
};

const applySaleUpdateWithRelatedRecords = async (change: RemoteChange) => {
  if (change.table !== 'sales') return false;
  const payload = toRecord(change.payload);
  if (!payload) return false;
  const productUpdates = Array.isArray(payload.productUpdates) ? payload.productUpdates : [];
  const inventoryLogs = Array.isArray(payload.inventoryLogs) ? payload.inventoryLogs : [];
  if (!productUpdates.length && !inventoryLogs.length) return false;
  const { productUpdates: _productUpdates, inventoryLogs: _inventoryLogs, ...saleUpdate } = payload;
  await upsertRemoteRecord('sales', saleUpdate, change.changedAt);
  for (const product of productUpdates) await upsertRemoteRecord('products', product, change.changedAt);
  for (const log of inventoryLogs) await upsertRemoteRecord('inventory_logs', log, change.changedAt);
  void _productUpdates;
  void _inventoryLogs;
  return true;
};

const applyRemoteChange = async (change: RemoteChange, deviceId: string) => {
  if (change.deviceId === deviceId || !syncTables.includes(change.table)) return;
  if (change.action === 'delete') {
    await applyDelete(change.table, change.recordId, change.payload, change.changedAt);
    return;
  }
  if (change.action === 'sale' && (await applyCompositeSale(change))) return;
  if (await applySaleUpdateWithRelatedRecords(change)) return;
  await upsertRemoteRecord(change.table, change.payload, change.changedAt);
};

class SyncService {
  private adapter: SyncAdapter = new HttpSyncAdapter();
  private syncing = false;
  private started = false;
  private deviceId = getDeviceId();
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

  async queue(table: string, recordId: string, action: SyncAction, payload: unknown, autoProcess = true) {
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
    if (autoProcess && navigator.onLine) void this.process();
  }

  private async queueCloudBootstrap() {
    if (localStorage.getItem(BOOTSTRAP_KEY)) return;
    const createdAt = nowIso();
    const items: SyncQueueItem[] = [];
    for (const table of syncTables) {
      const records = await db.table(table).toArray();
      for (const record of records) {
        if (!record?.id) continue;
        items.push({
          id: uuid(),
          table,
          recordId: String(record.id),
          action: 'update',
          payload: record,
          attempts: 0,
          createdAt,
          updatedAt: createdAt,
          synced: false,
          deleted: false
        });
      }
    }
    if (items.length) await db.sync_queue.bulkAdd(items);
    localStorage.setItem(BOOTSTRAP_KEY, 'queued');
    await this.emit();
  }

  async process() {
    if (this.syncing || !navigator.onLine) return;
    const settings = await db.settings.get('default');
    if (settings && !settings.syncEnabled) return;

    this.syncing = true;
    try {
      await this.queueCloudBootstrap();
      const currentSettings = (await db.settings.get('default')) ?? settings;
      const pending = await db.sync_queue.filter((item) => !item.synced && !item.deleted).sortBy('createdAt');
      const attemptAt = nowIso();
      if (pending.length) {
        await Promise.all(
          pending.map((item) =>
            db.sync_queue.update(item.id, { attempts: item.attempts + 1, lastAttemptAt: attemptAt, updatedAt: attemptAt })
          )
        );
      }

      const response = await this.adapter.sync({
        deviceId: this.deviceId,
        lastPulledAt: currentSettings?.lastSyncedAt,
        changes: pending
      });

      if (response.accepted.length) {
        await db.transaction('rw', db.sync_queue, async () => {
          await Promise.all(response.accepted.map((id) => db.sync_queue.update(id, { synced: true, updatedAt: nowIso() })));
        });
        await Promise.all(
          pending
            .filter((item) => response.accepted.includes(item.id))
            .map((item) => markTableSynced(item.table, item.recordId))
        );
      }

      for (const change of response.changes) {
        await applyRemoteChange(change, this.deviceId);
      }

      await db.settings.update('default', { lastSyncedAt: response.serverTime, synced: false } satisfies Partial<Settings>);
      const nextSettings = await db.settings.get('default');
      if (nextSettings) useAppStore.getState().setSettings(nextSettings);
    } catch (error) {
      const pending = await db.sync_queue.filter((item) => !item.synced && !item.deleted).toArray();
      if (pending.length) {
        await Promise.all(
          pending.map((item) =>
            db.sync_queue.update(item.id, {
              lastError: error instanceof Error ? error.message : 'Sync failed',
              updatedAt: nowIso()
            })
          )
        );
      }
    } finally {
      this.syncing = false;
      await this.emit();
    }
  }

  start() {
    if (this.started) return;
    this.started = true;
    window.addEventListener('online', () => void this.process());
    window.addEventListener('focus', () => void this.process());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.process();
    });
    window.setInterval(() => void this.process(), SYNC_INTERVAL_MS);
    void this.process();
  }
}

export const syncService = new SyncService();
