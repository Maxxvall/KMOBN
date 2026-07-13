import type { CacheTableKey } from './indexedDbCache';
import { isIndexedDbAvailable } from './indexedDbCache';
import { getOfflineUserId } from './offlineIdentity';

export type PendingOperation = 'upsert' | 'delete';

export interface PendingChange {
  id: string;
  userId: string;
  table: CacheTableKey;
  recordId: string;
  operation: PendingOperation;
  data: unknown;
  sequence: number;
  timestamp: string;
  retryCount: number;
  lastError?: string;
}

const QUEUE_DB_NAME = 'kmobn_offline_queue';
const QUEUE_DB_VERSION = 3;
const STORE_NAME = 'pending_changes';
const QUARANTINE_STORE_NAME = 'quarantined_changes';

let cachedDb: IDBDatabase | null = null;
let cachedDbPromise: Promise<IDBDatabase> | null = null;
let lastSequence = 0;
const listeners = new Set<() => void>();
const SUPPORTED_TABLES = new Set<CacheTableKey>([
  'estimates',
  'templates',
  'materials',
  'works',
  'bundles',
  'salary_calculations',
]);

const notifyListeners = (): void => {
  listeners.forEach(listener => listener());
};

const nextSequence = (): number => {
  const fromClock = Date.now() * 1000;
  lastSequence = Math.max(fromClock, lastSequence + 1);
  return lastSequence;
};

const buildChangeId = (userId: string, table: CacheTableKey, recordId: string): string =>
  JSON.stringify([userId, table, recordId]);

const ensureIndexes = (store: IDBObjectStore): void => {
  if (!store.indexNames.contains('by_table')) {
    store.createIndex('by_table', 'table', { unique: false });
  }
  if (!store.indexNames.contains('by_timestamp')) {
    store.createIndex('by_timestamp', 'timestamp', { unique: false });
  }
  if (!store.indexNames.contains('by_user')) {
    store.createIndex('by_user', 'userId', { unique: false });
  }
  if (!store.indexNames.contains('by_user_sequence')) {
    store.createIndex('by_user_sequence', ['userId', 'sequence'], { unique: false });
  }
};

const openQueueDb = (): Promise<IDBDatabase> => {
  if (cachedDb) return Promise.resolve(cachedDb);
  if (cachedDbPromise) return cachedDbPromise;

  cachedDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      cachedDbPromise = null;
      reject(new Error('IndexedDB is not available'));
      return;
    }

    const request = indexedDB.open(QUEUE_DB_NAME, QUEUE_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(STORE_NAME)
        ? request.transaction!.objectStore(STORE_NAME)
        : db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      ensureIndexes(store);
      if (!db.objectStoreNames.contains(QUARANTINE_STORE_NAME)) {
        db.createObjectStore(QUARANTINE_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      cachedDb = request.result;
      cachedDb.onclose = () => { cachedDb = null; cachedDbPromise = null; };
      cachedDb.onversionchange = () => { cachedDb?.close(); cachedDb = null; cachedDbPromise = null; };
      resolve(cachedDb);
    };
    request.onerror = () => {
      cachedDbPromise = null;
      reject(request.error);
    };
    request.onblocked = () => {
      cachedDbPromise = null;
      reject(new Error('Offline queue database upgrade is blocked'));
    };
  });

  return cachedDbPromise;
};

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const waitForTransaction = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

const isScopedChange = (value: unknown): value is PendingChange => {
  if (!value || typeof value !== 'object') return false;
  const change = value as Partial<PendingChange>;
  return typeof change.id === 'string'
    && typeof change.userId === 'string'
    && typeof change.table === 'string'
    && typeof change.recordId === 'string'
    && (change.operation === 'upsert' || change.operation === 'delete')
    && typeof change.sequence === 'number';
};

type LegacyPendingChange = {
  id: string;
  table: CacheTableKey;
  operation: PendingOperation;
  data: unknown;
  timestamp?: string;
  retryCount?: number;
};

type QuarantinedChange = {
  id: string;
  raw: unknown;
  reason: 'legacy-v1' | 'unrecognized';
  quarantinedAt: string;
};

const isLegacyChange = (value: unknown): value is LegacyPendingChange => {
  if (!value || typeof value !== 'object' || isScopedChange(value)) return false;
  const change = value as Partial<LegacyPendingChange>;
  return typeof change.id === 'string'
    && typeof change.table === 'string'
    && SUPPORTED_TABLES.has(change.table as CacheTableKey)
    && (change.operation === 'upsert' || change.operation === 'delete')
    && Array.isArray(change.data);
};

const getLegacyItems = (change: LegacyPendingChange): Array<{ recordId: string; data: unknown }> => {
  const values = change.data as unknown[];
  if (change.operation === 'upsert') {
    return values.map(value => {
      const recordId = value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string'
        ? (value as { id: string }).id
        : '';
      if (!recordId) throw new Error(`Legacy ${change.table} upsert contains a record without id`);
      return { recordId, data: value };
    });
  }
  return values.map(value => {
    const recordId = typeof value === 'string'
      ? value
      : value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string'
        ? (value as { id: string }).id
        : '';
    if (!recordId) throw new Error(`Legacy ${change.table} delete contains an invalid id`);
    return { recordId, data: null };
  });
};

const quarantineLegacyChanges = async (db: IDBDatabase): Promise<void> => {
  const tx = db.transaction([STORE_NAME, QUARANTINE_STORE_NAME], 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const quarantine = tx.objectStore(QUARANTINE_STORE_NAME);
  const all = await requestToPromise(store.getAll());
  const unscoped = (all ?? []).filter(value => !isScopedChange(value));
  if (!unscoped.length) {
    await waitForTransaction(tx);
    return;
  }

  const quarantinedAt = new Date().toISOString();
  for (const raw of unscoped) {
    const rawId = raw && typeof raw === 'object' && typeof (raw as { id?: unknown }).id === 'string'
      ? (raw as { id: string }).id
      : `unrecognized:${nextSequence()}`;
    const entry: QuarantinedChange = {
      id: rawId,
      raw,
      reason: isLegacyChange(raw) ? 'legacy-v1' : 'unrecognized',
      quarantinedAt,
    };
    quarantine.put(entry);
    if (raw && typeof raw === 'object' && typeof (raw as { id?: unknown }).id === 'string') {
      store.delete((raw as { id: string }).id);
    }
  }
  await waitForTransaction(tx);
  notifyListeners();
};

const getQuarantined = async (db: IDBDatabase): Promise<QuarantinedChange[]> => {
  const tx = db.transaction(QUARANTINE_STORE_NAME, 'readonly');
  const result = await requestToPromise(tx.objectStore(QUARANTINE_STORE_NAME).getAll());
  await waitForTransaction(tx);
  return (result ?? []) as QuarantinedChange[];
};

const enqueue = async (
  userId: string,
  table: CacheTableKey,
  operation: PendingOperation,
  items: Array<{ recordId: string; data: unknown }>,
): Promise<void> => {
  if (!userId) throw new Error('Offline change requires a userId');
  if (!items.length) return;

  const db = await openQueueDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const now = new Date().toISOString();

  for (const item of items) {
    if (!item.recordId) throw new Error(`Offline ${operation} requires a recordId`);
    const record: PendingChange = {
      id: buildChangeId(userId, table, item.recordId),
      userId,
      table,
      recordId: item.recordId,
      operation,
      data: item.data,
      sequence: nextSequence(),
      timestamp: now,
      retryCount: 0,
    };
    store.put(record);
  }

  await waitForTransaction(tx);
  notifyListeners();
};

export const offlineQueue = {
  async enqueueUpserts<T extends { id: string }>(userId: string, table: CacheTableKey, records: T[]): Promise<void> {
    await enqueue(userId, table, 'upsert', records.map(record => ({ recordId: record.id, data: record })));
  },

  async enqueueDeletes(userId: string, table: CacheTableKey, recordIds: string[]): Promise<void> {
    await enqueue(userId, table, 'delete', recordIds.map(recordId => ({ recordId, data: null })));
  },

  async getAll(userId: string): Promise<PendingChange[]> {
    if (!userId) return [];
    const db = await openQueueDb();
    await quarantineLegacyChanges(db);
    const tx = db.transaction(STORE_NAME, 'readonly');
    const result = await requestToPromise(tx.objectStore(STORE_NAME).getAll());
    await waitForTransaction(tx);
    return (result ?? [])
      .filter(isScopedChange)
      .filter(change => change.userId === userId)
      .sort((left, right) => left.sequence - right.sequence);
  },

  async getForTable(userId: string, table: CacheTableKey): Promise<PendingChange[]> {
    const changes = await offlineQueue.getAll(userId);
    return changes.filter(change => change.table === table);
  },

  async acknowledge(id: string, sequence: number): Promise<boolean> {
    const db = await openQueueDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const current = await requestToPromise(store.get(id)) as PendingChange | undefined;
    const shouldDelete = isScopedChange(current) && current.sequence === sequence;
    if (shouldDelete) store.delete(id);
    await waitForTransaction(tx);
    if (shouldDelete) notifyListeners();
    return shouldDelete;
  },

  async markFailed(id: string, sequence: number, error: unknown): Promise<boolean> {
    const db = await openQueueDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const current = await requestToPromise(store.get(id)) as PendingChange | undefined;
    const shouldUpdate = isScopedChange(current) && current.sequence === sequence;
    if (shouldUpdate) {
      store.put({
        ...current,
        retryCount: current.retryCount + 1,
        lastError: error instanceof Error ? error.message : String(error),
      });
    }
    await waitForTransaction(tx);
    if (shouldUpdate) notifyListeners();
    return shouldUpdate;
  },

  async count(userId: string): Promise<number> {
    return (await offlineQueue.getAll(userId)).length;
  },

  async getQuarantinedCount(): Promise<number> {
    const db = await openQueueDb();
    await quarantineLegacyChanges(db);
    return (await getQuarantined(db)).length;
  },

  async getClaimableQuarantinedCount(): Promise<number> {
    const db = await openQueueDb();
    await quarantineLegacyChanges(db);
    return (await getQuarantined(db)).filter(entry => isLegacyChange(entry.raw)).length;
  },

  async claimQuarantined(userId: string): Promise<number> {
    if (!userId || getOfflineUserId() !== userId) {
      throw new Error('The active user must explicitly claim legacy offline changes');
    }
    const db = await openQueueDb();
    await quarantineLegacyChanges(db);
    const entries = await getQuarantined(db);
    const claimable = entries.filter(entry => isLegacyChange(entry.raw));
    if (!claimable.length) return 0;

    const tx = db.transaction([STORE_NAME, QUARANTINE_STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const quarantine = tx.objectStore(QUARANTINE_STORE_NAME);
    let migratedCount = 0;
    for (const entry of claimable) {
      const change = entry.raw as LegacyPendingChange;
      for (const item of getLegacyItems(change)) {
        const migrated: PendingChange = {
          id: buildChangeId(userId, change.table, item.recordId),
          userId,
          table: change.table,
          recordId: item.recordId,
          operation: change.operation,
          data: item.data,
          sequence: nextSequence(),
          timestamp: change.timestamp ?? new Date().toISOString(),
          retryCount: change.retryCount ?? 0,
        };
        store.put(migrated);
        migratedCount += 1;
      }
      quarantine.delete(entry.id);
    }
    await waitForTransaction(tx);
    notifyListeners();
    return migratedCount;
  },

  async clearUser(userId: string): Promise<void> {
    const changes = await offlineQueue.getAll(userId);
    if (!changes.length) return;
    const db = await openQueueDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    changes.forEach(change => store.delete(change.id));
    await waitForTransaction(tx);
    notifyListeners();
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  close(): void {
    cachedDb?.close();
    cachedDb = null;
    cachedDbPromise = null;
  },
};
