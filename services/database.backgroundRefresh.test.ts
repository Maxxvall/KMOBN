import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', async importOriginal => ({
  ...(await importOriginal<typeof import('./supabase')>()),
  isSupabaseConfigured: () => true,
  fetchEstimates: vi.fn(async () => ({ data: [], error: null })),
  fetchTemplates: vi.fn(async () => ({ data: [], error: null })),
  fetchMaterials: vi.fn(async () => ({ data: [], error: null })),
  fetchWorks: vi.fn(async () => ({ data: [], error: null })),
  fetchBundles: vi.fn(async () => ({ data: [], error: null })),
  fetchEstimateSections: vi.fn(async () => ({ data: [], error: null })),
}));

import { loadEstimates, refreshOfflineWorkspace } from './database';
import {
  closeIndexedDbCache,
  getCacheUserId,
  getCachedRecords,
  upsertCachedRecords,
} from './indexedDbCache';
import { offlineQueue } from './offlineQueue';
import { fetchEstimateSections, fetchEstimates, fetchMaterials } from './supabase';

const USER = 'refresh-user';
// A second identity: the refresh throttle is keyed per table+user and lives in
// module state, so the background test must not share it with the first test.
const USER_SECOND = 'refresh-user-2';
const CACHE_DB_NAME = 'kmobn_indexeddb_cache';
const QUEUE_DB_NAME = 'kmobn_offline_queue';

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

const deleteDatabase = (name: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`IndexedDB cleanup blocked for ${name}`));
  });

const installOnlineSession = (userId: string = USER): void => {
  const storage = new MemoryStorage();
  storage.setItem('sb-offline-test-auth-token', JSON.stringify({ user: { id: userId } }));
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('navigator', { onLine: true });
};

const resetDatabases = async (): Promise<void> => {
  offlineQueue.close();
  closeIndexedDbCache();
  await Promise.all([
    deleteDatabase(CACHE_DB_NAME),
    deleteDatabase(QUEUE_DB_NAME),
  ]);
};

const material = (id: string, price: number) => ({ id, name: id, price });

describe('background refresh with pending changes', () => {
  beforeEach(async () => {
    installOnlineSession();
    await resetDatabases();
    vi.mocked(fetchEstimates).mockResolvedValue({ data: [], error: null });
    vi.mocked(fetchMaterials).mockResolvedValue({ data: [], error: null });
    vi.mocked(fetchEstimateSections).mockResolvedValue({ data: [], error: null });
  });

  afterEach(async () => {
    await resetDatabases();
    vi.unstubAllGlobals();
  });

  it('refreshes a table around pending records without dropping them', async () => {
    const cacheUser = getCacheUserId(USER);
    const pendingLocal = material('mat-pending', 250);
    const untouched = material('mat-kept', 100);
    const remoteGone = material('mat-removed-remotely', 50);
    await upsertCachedRecords('materials', cacheUser, [pendingLocal, untouched, remoteGone]);
    await offlineQueue.enqueueUpserts(USER, 'materials', [pendingLocal]);
    vi.mocked(fetchMaterials).mockResolvedValue({
      data: [material('mat-pending', 100), untouched, material('mat-new', 70)],
      error: null,
    });

    const result = await refreshOfflineWorkspace(USER);

    expect(result.refreshedTables).toContain('materials');
    const cachedMaterials = await getCachedRecords<{ id: string; price: number }>('materials', cacheUser);
    const byId = new Map(cachedMaterials.map(record => [record.id, record]));
    // The unconfirmed local version survives the stale server form.
    expect(byId.get('mat-pending')).toMatchObject({ price: 250 });
    // The rest of the server snapshot applies around it.
    expect(byId.get('mat-new')).toMatchObject({ price: 70 });
    expect(byId.get('mat-kept')).toMatchObject({ price: 100 });
    // Remote deletion still propagates for records without pending changes.
    expect(byId.has('mat-removed-remotely')).toBe(false);
    // The pending change stays queued for the next push.
    expect(await offlineQueue.getForTable(USER, 'materials')).toHaveLength(1);
  });

  it('keeps skipping estimate_sections while it has pending changes', async () => {
    const cacheUser = getCacheUserId(USER);
    const document = {
      id: 'sections-1',
      schemaVersion: 1 as const,
      definitions: [],
      order: [],
      serverRevision: 2,
    };
    await upsertCachedRecords('estimate_sections', cacheUser, [document]);
    await offlineQueue.enqueueUpserts(USER, 'estimate_sections', [document]);

    const result = await refreshOfflineWorkspace(USER);

    expect(result.skippedTables).toContain('estimate_sections');
    expect(result.refreshedTables).not.toContain('estimate_sections');
    expect(await getCachedRecords('estimate_sections', cacheUser)).toEqual([document]);
  });

  it('background-refreshes estimates around pending records on load', async () => {
    installOnlineSession(USER_SECOND);
    const cacheUser = getCacheUserId(USER_SECOND);
    const pendingLocal = {
      id: 'estimate-pending',
      estimateNumber: 'KM-2026-001',
      client: 'Локальная правка',
      date: '2026-07-13',
      status: 'draft',
      version: 1,
      items: [],
      total: 250,
      buildingType: 'Frame house',
      area: 100,
    };
    await upsertCachedRecords('estimates', cacheUser, [pendingLocal]);
    await offlineQueue.enqueueUpserts(USER_SECOND, 'estimates', [pendingLocal]);
    vi.mocked(fetchEstimates).mockResolvedValue({
      data: [
        { ...pendingLocal, client: 'Старая серверная версия', total: 100 },
        {
          id: 'estimate-new',
          estimateNumber: 'KM-2026-002',
          client: 'С другого устройства',
          date: '2026-07-14',
          status: 'draft',
          version: 1,
          items: [],
          total: 70,
          buildingType: 'Frame house',
          area: 80,
        },
      ],
      error: null,
    });

    await loadEstimates();

    // The server record arrives despite the pending local change.
    await vi.waitFor(async () => {
      const cached = await getCachedRecords('estimates', cacheUser);
      expect(cached).toHaveLength(2);
    });
    const cached = await getCachedRecords<{ id: string; total: number }>('estimates', cacheUser);
    const byId = new Map(cached.map(record => [record.id, record]));
    // The unconfirmed local edit keeps winning over the stale server form.
    expect(byId.get('estimate-pending')).toMatchObject({ total: 250 });
    expect(byId.get('estimate-new')).toMatchObject({ total: 70 });
    expect(await offlineQueue.getForTable(USER_SECOND, 'estimates')).toHaveLength(1);
  });
});
