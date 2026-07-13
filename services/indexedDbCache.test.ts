import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeIndexedDbCache,
  getCachedRecords,
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
});
