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

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
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
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

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

const fnv1aHash = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};

const hashRecord = (record: unknown): string => fnv1aHash(stableStringify(record));

const getAllEntriesByUser = async <T>(table: CacheTableKey, userId: string): Promise<CacheRecord<T>[]> => {
  if (!isIndexedDbAvailable()) return [];
  try {
    const db = await openDb();
    const storeName = getStoreName(table);
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const index = store.index('by_user');
    const request = index.getAll(userId);
    const result = await requestToPromise(request);
    await waitForTransaction(tx);
    return (result ?? []) as CacheRecord<T>[];
  } catch {
    return [];
  }
};

export const getCachedRecords = async <T>(table: CacheTableKey, userId: string): Promise<T[]> => {
  const entries = await getAllEntriesByUser<T>(table, userId);
  return entries.map(entry => entry.data);
};

export const syncCachedRecords = async <T extends { id: string }>(
  table: CacheTableKey,
  userId: string,
  records: T[],
): Promise<{ changed: boolean; next: T[] }> => {
  if (!isIndexedDbAvailable()) {
    return { changed: false, next: records };
  }
  try {
    const db = await openDb();
    const storeName = getStoreName(table);
    const existingEntries = await getAllEntriesByUser<T>(table, userId);
    const existingMap = new Map<string, string>();
    existingEntries.forEach(entry => {
      existingMap.set(entry.id, entry.hash);
    });

    let changed = false;
    const nextIds = new Set<string>();

    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);

    records.forEach(record => {
      if (!record || !record.id) return;
      const id = record.id;
      nextIds.add(id);
      const nextHash = hashRecord(record);
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
      }
    });

    existingEntries.forEach(entry => {
      if (!nextIds.has(entry.id)) {
        store.delete(entry.key);
        changed = true;
      }
    });

    await waitForTransaction(tx);
    return { changed, next: records };
  } catch {
    return { changed: false, next: records };
  }
};
