export type CacheTableKey =
  | 'estimates'
  | 'templates'
  | 'materials'
  | 'works'
  | 'bundles'
  | 'salary_calculations';

export interface CacheRecord<T> {
  key: string;
  userId: string;
  id: string;
  data: T;
  hash: string;
  updatedAt: string;
}

const DB_NAME = 'kmobn_indexeddb_cache';
const DB_VERSION = 1;

const STORE_NAMES: Record<CacheTableKey, string> = {
  estimates: 'estimates',
  templates: 'templates',
  materials: 'materials',
  works: 'works',
  bundles: 'bundles',
  salary_calculations: 'salary_calculations',
};

const isBrowser = (): boolean => typeof window !== 'undefined';
export const isIndexedDbAvailable = (): boolean => isBrowser() && typeof indexedDB !== 'undefined';

export const getCacheUserId = (userId: string | null | undefined): string => userId ?? 'anon';

const getStoreName = (key: CacheTableKey): string => STORE_NAMES[key];
const buildRecordKey = (userId: string, id: string): string => `${userId}:${id}`;

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

// Cached IndexedDB connection — reused across all calls
let cachedDb: IDBDatabase | null = null;
let cachedDbPromise: Promise<IDBDatabase> | null = null;

export const closeIndexedDbCache = (): void => {
  cachedDb?.close();
  cachedDb = null;
  cachedDbPromise = null;
};

const openDb = (): Promise<IDBDatabase> => {
  if (cachedDb) return Promise.resolve(cachedDb);
  if (cachedDbPromise) return cachedDbPromise;

  cachedDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      cachedDbPromise = null;
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      (Object.values(STORE_NAMES) as string[]).forEach(storeName => {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: 'key' });
          store.createIndex('by_user', 'userId', { unique: false });
          store.createIndex('by_user_id', ['userId', 'id'], { unique: true });
        }
      });
    };
    request.onsuccess = () => {
      cachedDb = request.result;
      // Clear cached reference if the database is closed unexpectedly
      cachedDb.onclose = () => { cachedDb = null; cachedDbPromise = null; };
      cachedDb.onversionchange = () => { cachedDb?.close(); cachedDb = null; cachedDbPromise = null; };
      resolve(cachedDb);
    };
    request.onerror = () => {
      cachedDbPromise = null;
      reject(request.error);
    };
  });

  return cachedDbPromise;
};

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
};

const hashRecord = (record: unknown): string => stableStringify(record);

// In-memory hash cache — avoids recomputing hashes for records that haven't changed
const hashMemoryCache = new Map<string, string>();

const getOrComputeHash = (table: CacheTableKey, id: string, record: unknown): string => {
  const cacheKey = `${table}:${id}`;
  const newHash = hashRecord(record);
  hashMemoryCache.set(cacheKey, newHash);
  return newHash;
};

const clearHashCache = (table: CacheTableKey, id: string): void => {
  hashMemoryCache.delete(`${table}:${id}`);
};

const getAllEntriesByUser = async <T>(table: CacheTableKey, userId: string): Promise<CacheRecord<T>[]> => {
  if (!isIndexedDbAvailable()) return [];
  const db = await openDb();
  const storeName = getStoreName(table);
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  const index = store.index('by_user');
  const request = index.getAll(userId);
  const result = await requestToPromise(request);
  await waitForTransaction(tx);
  return (result ?? []) as CacheRecord<T>[];
};

export const getCachedRecords = async <T>(table: CacheTableKey, userId: string): Promise<T[]> => {
  const entries = await getAllEntriesByUser<T>(table, userId);
  return entries.map(entry => entry.data);
};

export const upsertCachedRecords = async <T extends { id: string }>(
  table: CacheTableKey,
  userId: string,
  records: T[],
): Promise<void> => {
  if (!records.length) return;
  if (!isIndexedDbAvailable()) throw new Error('IndexedDB is not available');

  const db = await openDb();
  const storeName = getStoreName(table);
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  const updatedAt = new Date().toISOString();

  records.forEach(record => {
    if (!record?.id) throw new Error(`Cached ${table} record requires an id`);
    const hash = getOrComputeHash(table, record.id, record);
    const payload: CacheRecord<T> = {
      key: buildRecordKey(userId, record.id),
      id: record.id,
      userId,
      data: record,
      hash,
      updatedAt,
    };
    store.put(payload);
  });

  await waitForTransaction(tx);
};

export const deleteCachedRecords = async (
  table: CacheTableKey,
  userId: string,
  recordIds: string[],
): Promise<void> => {
  if (!recordIds.length) return;
  if (!isIndexedDbAvailable()) throw new Error('IndexedDB is not available');

  const db = await openDb();
  const tx = db.transaction(getStoreName(table), 'readwrite');
  const store = tx.objectStore(getStoreName(table));
  recordIds.forEach(recordId => {
    store.delete(buildRecordKey(userId, recordId));
    clearHashCache(table, recordId);
  });
  await waitForTransaction(tx);
};

export const syncCachedRecords = async <T extends { id: string }>(
  table: CacheTableKey,
  userId: string,
  records: T[],
): Promise<{ changed: boolean; next: T[]; changedIds: string[]; cacheAvailable: boolean }> => {
  if (!isIndexedDbAvailable()) {
    return { changed: false, next: records, changedIds: [], cacheAvailable: false };
  }
  const db = await openDb();
  const storeName = getStoreName(table);
  const existingEntries = await getAllEntriesByUser<T>(table, userId);
  const existingMap = new Map<string, string>();
  existingEntries.forEach(entry => {
    existingMap.set(entry.id, entry.hash);
  });

  let changed = false;
  const changedIds: string[] = [];
  const nextIds = new Set<string>();

  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);

  records.forEach(record => {
    if (!record || !record.id) return;
    const id = record.id;
    nextIds.add(id);
    const nextHash = getOrComputeHash(table, id, record);
    const prevHash = existingMap.get(id);
    if (prevHash !== nextHash) {
      const payload: CacheRecord<T> = {
        key: buildRecordKey(userId, id),
        id,
        userId,
        data: record,
        hash: nextHash,
        updatedAt: new Date().toISOString(),
      };
      store.put(payload);
      changed = true;
      changedIds.push(id);
    }
  });

  existingEntries.forEach(entry => {
    if (!nextIds.has(entry.id)) {
      store.delete(entry.key);
      clearHashCache(table, entry.id);
      changed = true;
    }
  });

  await waitForTransaction(tx);
  return { changed, next: records, changedIds, cacheAvailable: true };
};
