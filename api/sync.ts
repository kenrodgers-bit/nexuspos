import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

const PREFIX = 'nexus-pos:v1';
const CHANGE_LOG_KEY = `${PREFIX}:changes`;
const PROCESSED_TTL_SECONDS = 60 * 60 * 24 * 45;
const MAX_CHANGES_PER_PULL = 750;
const SYNC_SECRET = process.env.SYNC_API_KEY;

type SyncChange = {
  id: string;
  table: string;
  recordId: string;
  action: string;
  payload: unknown;
  deviceId?: string;
  changedAt?: string;
};

type SyncRequest = {
  deviceId?: string;
  lastPulledAt?: string;
  changes?: SyncChange[];
};

const json = (response: unknown, status = 200) => ({
  statusCode: status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  },
  body: JSON.stringify(response)
});

const parseBody = (body: unknown): SyncRequest => {
  if (!body) return {};
  if (typeof body === 'string') return JSON.parse(body) as SyncRequest;
  return body as SyncRequest;
};

const recordKey = (table: string, recordId: string) => `${PREFIX}:record:${table}:${recordId}`;
const processedKey = (changeId: string) => `${PREFIX}:processed:${changeId}`;

const isValidTable = (table: string) =>
  [
    'users',
    'products',
    'categories',
    'sales',
    'sale_items',
    'inventory_logs',
    'suppliers',
    'expenses',
    'settings'
  ].includes(table);

const writeRecordSnapshot = async (change: SyncChange) => {
  await redis.set(recordKey(change.table, change.recordId), {
    table: change.table,
    recordId: change.recordId,
    action: change.action,
    payload: change.payload,
    changedAt: change.changedAt
  });
};

const appendChange = async (change: SyncChange, score: number) => {
  await redis.zadd(CHANGE_LOG_KEY, {
    score,
    member: JSON.stringify(change)
  });
};

const pullChanges = async (deviceId: string, lastPulledAt?: string) => {
  const since = lastPulledAt ? Date.parse(lastPulledAt) + 1 : 0;
  const min = Number.isFinite(since) ? since : 0;
  const rawChanges = await redis.zrange<string[]>(CHANGE_LOG_KEY, min, '+inf', {
    byScore: true,
    offset: 0,
    count: MAX_CHANGES_PER_PULL
  });

  return rawChanges
    .map((raw) => {
      try {
        return typeof raw === 'string' ? (JSON.parse(raw) as SyncChange) : (raw as SyncChange);
      } catch {
        return undefined;
      }
    })
    .filter((change): change is SyncChange => Boolean(change && change.deviceId !== deviceId));
};

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    return res.status(204).setHeader('cache-control', 'no-store').end();
  }
  if (req.method !== 'POST') {
    const payload = json({ error: 'Method not allowed' }, 405);
    return res.status(payload.statusCode).setHeader('cache-control', 'no-store').json(JSON.parse(payload.body));
  }
  if (SYNC_SECRET && req.headers['x-sync-api-key'] !== SYNC_SECRET) {
    const payload = json({ error: 'Unauthorized' }, 401);
    return res.status(payload.statusCode).setHeader('cache-control', 'no-store').json(JSON.parse(payload.body));
  }

  try {
    const body = parseBody(req.body);
    const deviceId = typeof body.deviceId === 'string' && body.deviceId ? body.deviceId : 'unknown-device';
    const incoming = Array.isArray(body.changes) ? body.changes : [];
    const accepted: string[] = [];

    for (const [index, item] of incoming.entries()) {
      if (!item.id || !item.table || !item.recordId || !isValidTable(item.table)) continue;
      const alreadyProcessed = await redis.get(processedKey(item.id));
      if (alreadyProcessed) {
        accepted.push(item.id);
        continue;
      }

      const score = Date.now() + index;
      const change: SyncChange = {
        id: item.id,
        table: item.table,
        recordId: item.recordId,
        action: item.action,
        payload: item.payload,
        deviceId,
        changedAt: new Date(score).toISOString()
      };

      await writeRecordSnapshot(change);
      await appendChange(change, score);
      await redis.set(processedKey(item.id), '1', { ex: PROCESSED_TTL_SECONDS });
      accepted.push(item.id);
    }

    const serverTime = new Date().toISOString();
    const changes = await pullChanges(deviceId, body.lastPulledAt);
    return res.status(200).setHeader('cache-control', 'no-store').json({ ok: true, accepted, changes, serverTime });
  } catch (error) {
    return res.status(500).setHeader('cache-control', 'no-store').json({
      error: error instanceof Error ? error.message : 'Sync failed'
    });
  }
}
