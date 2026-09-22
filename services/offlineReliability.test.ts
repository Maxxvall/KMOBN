import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { EstimateCategory, type EstimateSectionsDocument } from '../types';
import { closeIndexedDbCache, getCachedRecords, upsertCachedRecords } from './indexedDbCache';
import { rememberOfflineUser } from './offlineIdentity';
import { offlineQueue } from './offlineQueue';
import { processOfflineQueue } from './offlineSync';
import { saveMaterials } from './database';

const remote = vi.hoisted(() => ({
  saveSections: vi.fn(),
  saveRecord: vi.fn(),
  deleteRecord: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('./supabase', () => ({
  default: { auth: { getSession: remote.getSession } },
  isSupabaseConfigured: () => true,
  fetchEstimates: vi.fn(),
  fetchTemplates: vi.fn(),
  fetchMaterials: vi.fn(),
  fetchWorks: vi.fn(),
  fetchBundles: vi.fn(),
  fetchSalaryCalculations: vi.fn(),
  fetchEstimateSections: vi.fn(),
  saveEstimateSectionsRemote: remote.saveSections,
  saveOfflineRecord: remote.saveRecord,
  deleteOfflineRecord: remote.deleteRecord,
  upsertTable: vi.fn(),
  deleteTableRecords: vi.fn(),
}));

const USER_ID = 'offline-reliability-user';
const DATABASES = ['kmobn_indexeddb_cache', 'kmobn_offline_queue'];

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const user = (): User => ({
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'offline-reliability@example.test',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-09-22T00:00:00.000Z',
});

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const deleteDatabase = (name: string): Promise<void> => new Promise((resolve, reject) => {
  const request = indexedDB.deleteDatabase(name);
  request.onsuccess = () => resolve();
  request.onerror = () => reject(request.error);
});

describe('offline reliability regressions', () => {
  beforeEach(async () => {
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
    vi.stubGlobal('CustomEvent', class CustomEvent {
      constructor(public type: string, public init?: unknown) {}
    });
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('localStorage', new MemoryStorage());
    rememberOfflineUser(user());
    remote.getSession.mockResolvedValue({ data: { session: null }, error: null });
    offlineQueue.close();
    closeIndexedDbCache();
    await Promise.all(DATABASES.map(deleteDatabase));
  });

  afterEach(async () => {
    offlineQueue.close();
    closeIndexedDbCache();
    await Promise.all(DATABASES.map(deleteDatabase));
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps local writes owned by the remembered account when the online session is temporarily absent', async () => {
    await saveMaterials([{
      id: 'material-1',
      name: 'Доска',
      price: 100,
      lastUpdated: '2026-09-22T00:00:00.000Z',
      category: EstimateCategory.WALLS,
    }]);

    expect(await offlineQueue.count('anon')).toBe(0);
    expect(await offlineQueue.getAll(USER_ID)).toEqual([
      expect.objectContaining({ userId: USER_ID, table: 'materials', recordId: 'material-1' }),
    ]);
  });

  it('applies the acknowledged estimate-sections revision to the local cache', async () => {
    const local: EstimateSectionsDocument = {
      id: USER_ID,
      schemaVersion: 1,
      definitions: [],
      order: [],
      serverRevision: 1,
      operationId: '11111111-1111-4111-8111-111111111111',
    };
    const confirmed = { ...local, serverRevision: 2, operationId: undefined };
    await upsertCachedRecords('estimate_sections', USER_ID, [local]);
    await offlineQueue.enqueueUpserts(USER_ID, 'estimate_sections', [local]);
    remote.saveSections.mockResolvedValue({ data: [confirmed], error: null });

    await processOfflineQueue(USER_ID);

    expect(await getCachedRecords('estimate_sections', USER_ID)).toEqual([
      expect.objectContaining({ serverRevision: 2, operationId: undefined }),
    ]);
  });

  it('applies the server revision returned for a regular record', async () => {
    const local = { id: 'material-versioned', name: 'Доска', price: 100 };
    await upsertCachedRecords('materials', USER_ID, [local]);
    await offlineQueue.enqueueUpserts(USER_ID, 'materials', [local]);
    remote.saveRecord.mockResolvedValue({ data: { ...local, serverRevision: 1 }, error: null });

    await processOfflineQueue(USER_ID);

    expect(await offlineQueue.count(USER_ID)).toBe(0);
    expect(await getCachedRecords('materials', USER_ID)).toEqual([
      expect.objectContaining({ id: local.id, serverRevision: 1 }),
    ]);
  });

  it('keeps a conflicting regular record locally instead of overwriting the server', async () => {
    const local = { id: 'material-conflict', name: 'Локальная доска', price: 100, serverRevision: 1 };
    await upsertCachedRecords('materials', USER_ID, [local]);
    await offlineQueue.enqueueUpserts(USER_ID, 'materials', [local]);
    remote.saveRecord.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('OFFLINE_RECORD_CONFLICT'), { code: '40001' }),
    });

    const result = await processOfflineQueue(USER_ID);

    expect(result.pendingCount).toBe(1);
    expect((await offlineQueue.getAll(USER_ID))[0]).toMatchObject({
      recordId: local.id,
      failureKind: 'permanent',
    });
    expect(await getCachedRecords('materials', USER_ID)).toEqual([local]);
  });

  it('rebases a newer local edit on the confirmed predecessor revision', async () => {
    const first = { id: 'material-successor', name: 'Первая версия', price: 100 };
    await upsertCachedRecords('materials', USER_ID, [first]);
    await offlineQueue.enqueueUpserts(USER_ID, 'materials', [first]);
    remote.saveRecord.mockImplementationOnce(async () => {
      const successor = { ...first, name: 'Вторая версия', price: 250 };
      await offlineQueue.enqueueUpserts(USER_ID, 'materials', [successor]);
      await upsertCachedRecords('materials', USER_ID, [successor]);
      return { data: { ...first, serverRevision: 1 }, error: null };
    });

    await processOfflineQueue(USER_ID);

    const [pending] = await offlineQueue.getAll(USER_ID);
    expect(pending).toMatchObject({
      operation: 'upsert',
      data: { id: first.id, name: 'Вторая версия', price: 250, serverRevision: 1 },
    });
    expect((await getCachedRecords<{ id: string; serverRevision: number }>('materials', USER_ID))[0])
      .toMatchObject({ id: first.id, serverRevision: 1 });
  });

  it('does not acknowledge a different operation that reused the same timestamp sequence', async () => {
    await offlineQueue.enqueueUpserts(USER_ID, 'materials', [{ id: 'material-1', price: 100 }]);
    const [sent] = await offlineQueue.getAll(USER_ID);
    const database = await requestToPromise(indexedDB.open('kmobn_offline_queue'));
    const transaction = database.transaction('pending_changes', 'readwrite');
    transaction.objectStore('pending_changes').put({
      ...sent,
      data: { id: 'material-1', price: 250 },
      operationId: '22222222-2222-4222-8222-222222222222',
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();

    expect(await offlineQueue.acknowledge(sent.id, sent.sequence, sent.operationId)).toBe(false);
    expect((await offlineQueue.getAll(USER_ID))[0]).toMatchObject({
      data: { id: 'material-1', price: 250 },
    });
  });
});
