import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { clearOfflineUser, rememberOfflineUser } from './offlineIdentity';
import { offlineQueue } from './offlineQueue';

const QUEUE_DB_NAME = 'kmobn_offline_queue';
const STORE_NAME = 'pending_changes';
const USER_ID = 'migration-user';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, String(value));
  }
}

const migrationUser = (): User => ({
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'migration-user@example.test',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-07-13T10:00:00.000Z',
});

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const waitForTransaction = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

const deleteQueueDatabase = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(QUEUE_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Legacy queue cleanup was blocked'));
  });

const createLegacyV1Queue = async (): Promise<void> => {
  const request = indexedDB.open(QUEUE_DB_NAME, 1);
  request.onupgradeneeded = () => {
    const store = request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    store.createIndex('by_table', 'table', { unique: false });
    store.createIndex('by_timestamp', 'timestamp', { unique: false });
  };
  const database = await requestToPromise(request);
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  store.put({
    id: 'materials:upsert:legacy-1',
    table: 'materials',
    operation: 'upsert',
    data: [
      { id: 'material-1', name: 'Board', price: 100 },
      { id: 'material-2', name: 'Insulation', price: 200 },
    ],
    timestamp: '2026-07-12T10:00:00.000Z',
    retryCount: 1,
  });
  store.put({
    id: 'works:delete:legacy-2',
    table: 'works',
    operation: 'delete',
    data: ['work-1'],
    timestamp: '2026-07-12T11:00:00.000Z',
    retryCount: 0,
  });
  await waitForTransaction(transaction);
  database.close();
};

const createMixedV2Queue = async (): Promise<void> => {
  const request = indexedDB.open(QUEUE_DB_NAME, 2);
  request.onupgradeneeded = () => {
    const store = request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    store.createIndex('by_table', 'table', { unique: false });
    store.createIndex('by_timestamp', 'timestamp', { unique: false });
    store.createIndex('by_user', 'userId', { unique: false });
    store.createIndex('by_user_sequence', ['userId', 'sequence'], { unique: false });
  };
  const database = await requestToPromise(request);
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  store.put({
    id: JSON.stringify([USER_ID, 'materials', 'material-valid']),
    userId: USER_ID,
    table: 'materials',
    recordId: 'material-valid',
    operation: 'upsert',
    data: { id: 'material-valid', name: 'Valid material', price: 300 },
    sequence: 100,
    timestamp: '2026-07-12T09:00:00.000Z',
    retryCount: 0,
  });
  store.put({
    id: 'materials:upsert:corrupt-legacy',
    table: 'materials',
    operation: 'upsert',
    data: [{ name: 'Missing record id' }],
    timestamp: '2026-07-12T10:00:00.000Z',
    retryCount: 0,
  });
  await waitForTransaction(transaction);
  database.close();
};

const resetQueue = async (): Promise<void> => {
  offlineQueue.close();
  await deleteQueueDatabase();
};

describe('offlineQueue v1 migration', () => {
  beforeEach(async () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('localStorage', new MemoryStorage());
    await resetQueue();
  });

  afterEach(async () => {
    offlineQueue.close();
    await deleteQueueDatabase();
    vi.unstubAllGlobals();
  });

  it('moves v1 records to quarantine and claims every legacy item explicitly', async () => {
    rememberOfflineUser(migrationUser());
    await createLegacyV1Queue();

    expect(await offlineQueue.getAll(USER_ID)).toEqual([]);
    expect(await offlineQueue.getQuarantinedCount()).toBe(2);

    await offlineQueue.claimQuarantined(USER_ID);
    const migrated = await offlineQueue.getAll(USER_ID);

    expect(migrated).toHaveLength(3);
    expect(migrated).toEqual(expect.arrayContaining([
      expect.objectContaining({
        userId: USER_ID,
        table: 'materials',
        recordId: 'material-1',
        operation: 'upsert',
        data: { id: 'material-1', name: 'Board', price: 100 },
      }),
      expect.objectContaining({
        userId: USER_ID,
        table: 'materials',
        recordId: 'material-2',
        operation: 'upsert',
        data: { id: 'material-2', name: 'Insulation', price: 200 },
      }),
      expect.objectContaining({
        userId: USER_ID,
        table: 'works',
        recordId: 'work-1',
        operation: 'delete',
        data: null,
      }),
    ]));
    expect(migrated.every(change => Number.isFinite(change.sequence))).toBe(true);
    expect(await offlineQueue.getQuarantinedCount()).toBe(0);
  });

  it('does not auto-claim quarantined changes for a different account', async () => {
    rememberOfflineUser(migrationUser());
    await createLegacyV1Queue();

    expect(await offlineQueue.getAll('another-user')).toEqual([]);
    expect(await offlineQueue.getQuarantinedCount()).toBe(2);
    expect(await offlineQueue.getAll(USER_ID)).toEqual([]);
    expect(await offlineQueue.getQuarantinedCount()).toBe(2);
  });

  it('returns valid scoped changes when a corrupt legacy record is quarantined beside them', async () => {
    clearOfflineUser();
    await createMixedV2Queue();

    expect(await offlineQueue.getAll(USER_ID)).toEqual([
      expect.objectContaining({
        userId: USER_ID,
        recordId: 'material-valid',
        operation: 'upsert',
        data: { id: 'material-valid', name: 'Valid material', price: 300 },
      }),
    ]);
    expect(await offlineQueue.getQuarantinedCount()).toBe(1);
  });
});
