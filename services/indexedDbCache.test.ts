import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fingerprintData } from './hashing';
import {
  closeIndexedDbCache,
  getCachedRecords,
  getOfflineCoverage,
  syncCachedRecords,
  upsertCachedRecords,
} from './indexedDbCache';

const CACHE_DB_NAME = 'kmobn_indexeddb_cache';
const USER_ID = 'cache-user';

type CachedMaterial = {
  id: string;
  name: string;
  price: number;
};

const deleteCacheDatabase = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(CACHE_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB cache cleanup was blocked'));
  });

const resetCache = async (): Promise<void> => {
  closeIndexedDbCache();
  await deleteCacheDatabase();
};

const records = (): CachedMaterial[] => [
  { id: 'material-1', name: 'Board', price: 100 },
  { id: 'material-2', name: 'Insulation', price: 200 },
  { id: 'material-3', name: 'Membrane', price: 300 },
];

type RawCacheEntry = { id: string; data: unknown; hash: string };

const readRawCacheRecords = async (storeName: string): Promise<RawCacheEntry[]> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB_NAME);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(storeName, 'readonly');
      const getAll = tx.objectStore(storeName).getAll();
      getAll.onsuccess = () => {
        db.close();
        resolve((getAll.result ?? []) as RawCacheEntry[]);
      };
      getAll.onerror = () => {
        db.close();
        reject(getAll.error);
      };
    };
    request.onerror = () => reject(request.error);
  });

describe('IndexedDB cache invalidation', () => {
  beforeEach(async () => {
    vi.stubGlobal('window', globalThis);
    await resetCache();
  });

  afterEach(async () => {
    await resetCache();
    vi.unstubAllGlobals();
  });

  it('merges a limited refresh without deleting records outside the fetched window', async () => {
    const initial = records();
    await syncCachedRecords('materials', USER_ID, initial);
    const limitedRefresh = [{ ...initial[0], price: 150 }];

    await upsertCachedRecords('materials', USER_ID, limitedRefresh);

    expect(await getCachedRecords<CachedMaterial>('materials', USER_ID)).toEqual(
      expect.arrayContaining([limitedRefresh[0], initial[1], initial[2]]),
    );
    expect(await getCachedRecords<CachedMaterial>('materials', USER_ID)).toHaveLength(3);
  });

  it('removes records missing from a complete refresh', async () => {
    const initial = records();
    await syncCachedRecords('materials', USER_ID, initial);
    const completeRefresh = [{ ...initial[0], price: 150 }];

    await syncCachedRecords('materials', USER_ID, completeRefresh);

    expect(await getCachedRecords<CachedMaterial>('materials', USER_ID)).toEqual(completeRefresh);
  });

  it('marks an empty complete snapshot as downloaded', async () => {
    await syncCachedRecords('materials', USER_ID, []);

    const coverage = await getOfflineCoverage(USER_ID);
    expect(coverage.tables.materials).toMatchObject({
      complete: true,
      recordCount: 0,
      userId: USER_ID,
    });
    expect(coverage.missingTables).not.toContain('materials');
  });

  it('keeps offline coverage isolated between users', async () => {
    await syncCachedRecords('materials', USER_ID, records());

    expect((await getOfflineCoverage(USER_ID)).missingTables).not.toContain('materials');
    expect((await getOfflineCoverage('another-user')).missingTables).toContain('materials');
  });

  it('reports ready only after all six table snapshots are complete', async () => {
    await Promise.all([
      syncCachedRecords('estimates', USER_ID, []),
      syncCachedRecords('templates', USER_ID, []),
      syncCachedRecords('materials', USER_ID, []),
      syncCachedRecords('works', USER_ID, []),
      syncCachedRecords('bundles', USER_ID, []),
      syncCachedRecords('estimate_sections', USER_ID, []),
    ]);

    const coverage = await getOfflineCoverage(USER_ID);
    expect(coverage.ready).toBe(true);
    expect(coverage.missingTables).toEqual([]);
    expect(coverage.lastPreparedAt).toBeTruthy();
  });

  it('stores a compact fingerprint hash instead of a full JSON copy of the record', async () => {
    const initial = records();
    await upsertCachedRecords('materials', USER_ID, initial);

    const raw = await readRawCacheRecords('materials');
    expect(raw).toHaveLength(3);
    const stored = raw.find(entry => entry.id === 'material-1');
    expect(stored).toBeDefined();
    // Expected value comes from the standalone fingerprint implementation,
    // not from the cache module under test.
    expect(stored!.hash).toBe(fingerprintData(initial[0]));
    // The old format stored the whole record as a JSON string; a fingerprint
    // never contains the payload itself.
    expect(stored!.hash).not.toContain('Board');
    expect(stored!.hash).not.toContain('{');
  });

  it('does not rewrite unchanged records when upsert and sync share one hash function', async () => {
    const initial = records();
    await upsertCachedRecords('materials', USER_ID, initial);

    const result = await syncCachedRecords('materials', USER_ID, initial);

    expect(result.changed).toBe(false);
    expect(result.changedIds).toEqual([]);
    const raw = await readRawCacheRecords('materials');
    expect(raw.map(entry => entry.hash)).toEqual([
      fingerprintData(initial[0]),
      fingerprintData(initial[1]),
      fingerprintData(initial[2]),
    ]);
  });
});
