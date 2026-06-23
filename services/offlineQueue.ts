import { isIndexedDbAvailable } from './indexedDbCache';

export interface PendingChange {
  id: string;
  table: string;
  operation: 'upsert' | 'delete';
  data: any;
  timestamp: string;
  retryCount: number;
}

const QUEUE_DB_NAME = 'kmobn_offline_queue';
const QUEUE_DB_VERSION = 1;
const STORE_NAME = 'pending_changes';

let cachedDb: IDBDatabase | null = null;
let cachedDbPromise: Promise<IDBDatabase> | null = null;

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
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('by_table', 'table', { unique: false });
        store.createIndex('by_timestamp', 'timestamp', { unique: false });
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

export const offlineQueue = {
  async add(change: Omit<PendingChange, 'id' | 'timestamp' | 'retryCount'>): Promise<void> {
    if (!isIndexedDbAvailable()) return;
    try {
      const db = await openQueueDb();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record: PendingChange = {
        ...change,
        id: `${change.table}:${change.operation}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        retryCount: 0,
      };
      store.put(record);
      await waitForTransaction(tx);
    } catch (error) {
      console.error('offlineQueue.add error:', error);
    }
  },

  async getAll(): Promise<PendingChange[]> {
    if (!isIndexedDbAvailable()) return [];
    try {
      const db = await openQueueDb();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      const result = await requestToPromise(request);
      await waitForTransaction(tx);
      return (result ?? []) as PendingChange[];
    } catch {
      return [];
    }
  },

  async remove(id: string): Promise<void> {
    if (!isIndexedDbAvailable()) return;
    try {
      const db = await openQueueDb();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
      await waitForTransaction(tx);
    } catch (error) {
      console.error('offlineQueue.remove error:', error);
    }
  },

  async clear(): Promise<void> {
    if (!isIndexedDbAvailable()) return;
    try {
      const db = await openQueueDb();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      await waitForTransaction(tx);
    } catch (error) {
      console.error('offlineQueue.clear error:', error);
    }
  },

  async count(): Promise<number> {
    if (!isIndexedDbAvailable()) return 0;
    try {
      const db = await openQueueDb();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.count();
      const result = await requestToPromise(request);
      await waitForTransaction(tx);
      return result as number;
    } catch {
      return 0;
    }
  },

  groupByTable(changes: PendingChange[]): Map<string, PendingChange[]> {
    const grouped = new Map<string, PendingChange[]>();
    for (const change of changes) {
      const existing = grouped.get(change.table) ?? [];
      existing.push(change);
      grouped.set(change.table, existing);
    }
    return grouped;
  },
};
