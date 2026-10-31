import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { CacheTableKey } from './indexedDbCache';
import { deleteCachedRecords, getCacheUserId, getCachedRecords, upsertCachedRecords } from './indexedDbCache';
import { offlineQueue, type PendingChange } from './offlineQueue';
import { processOfflineQueue } from './offlineSync';
import type { EstimateSectionsDocument } from '../types';

const TEST_USER = 'sync-user';

const resetQueue = async () => {
  await offlineQueue.clearUser(TEST_USER);
  await offlineQueue.close();
};

const enqueueMaterial = (id: string, price: number) =>
  offlineQueue.enqueueUpserts(TEST_USER, 'materials', [{ id, name: id, price }]);

type CacheUpdateDetail = { key: CacheTableKey; data: unknown[] };

const collectCacheUpdates = () => {
  const updates: CacheUpdateDetail[] = [];
  const handler = (event: Event) => {
    updates.push((event as CustomEvent<CacheUpdateDetail>).detail);
  };
  window.addEventListener('kmobn:cache-update', handler);
  return {
    updates,
    stop: () => window.removeEventListener('kmobn:cache-update', handler),
  };
};

const resetMaterialCache = async () => {
  const cacheUser = getCacheUserId(TEST_USER);
  const cached = await getCachedRecords<{ id: string }>('materials', cacheUser);
  if (cached.length) {
    await deleteCachedRecords('materials', cacheUser, cached.map(record => record.id));
  }
};

describe('processOfflineQueue', () => {
  beforeEach(async () => {
    // Node has no window; an EventTarget exposes addEventListener/dispatchEvent
    // for the kmobn:cache-update events under test.
    vi.stubGlobal('window', new EventTarget());
    await resetQueue();
    await resetMaterialCache();
  });
  afterEach(async () => {
    await resetQueue();
    vi.unstubAllGlobals();
  });

  it('acknowledges each change only after executeChange succeeds', async () => {
    await enqueueMaterial('material-1', 100);
    await enqueueMaterial('material-2', 200);
    const executed: string[] = [];

    await processOfflineQueue(TEST_USER, async change => {
      executed.push(change.recordId);
      expect(await offlineQueue.count(TEST_USER)).toBe(2 - executed.length + 1);
    });

    expect(executed).toEqual(['material-1', 'material-2']);
    expect(await offlineQueue.getAll(TEST_USER)).toEqual([]);
  });

  it('stops after a failure and retains the failed and unprocessed changes', async () => {
    await enqueueMaterial('material-1', 100);
    await enqueueMaterial('material-2', 200);
    await enqueueMaterial('material-3', 300);
    const executed: string[] = [];

    try {
      await processOfflineQueue(TEST_USER, async change => {
        executed.push(change.recordId);
        if (change.recordId === 'material-2') {
          throw new Error('remote rejected material-2');
        }
      });
    } catch {
      // The contract may report the failure by rejection or by a result object.
    }

    expect(executed).toEqual(['material-1', 'material-2']);
    const remaining = await offlineQueue.getAll(TEST_USER);
    expect(remaining.map(change => change.recordId)).toEqual(['material-2', 'material-3']);
    expect(remaining[0]).toMatchObject({
      retryCount: 1,
      lastError: 'remote rejected material-2',
    });
    expect(remaining[1]).toMatchObject({ retryCount: 0 });
  });

  it('classifies a 4xx database rejection as permanent', async () => {
    await enqueueMaterial('material-1', 100);
    const rejection = Object.assign(new Error('RLS denied'), { status: 403 });

    await expect(processOfflineQueue(TEST_USER, async () => {
      throw rejection;
    })).resolves.toMatchObject({ syncedCount: 0, pendingCount: 1 });

    const [failed] = await offlineQueue.getAll(TEST_USER);
    expect(failed).toMatchObject({ failureKind: 'permanent', retryCount: 1 });
    expect(failed.nextRetryAt).toBeUndefined();
  });

  it('continues with independent changes after a permanent rejection', async () => {
    await enqueueMaterial('material-invalid', 100);
    await enqueueMaterial('material-valid', 200);
    const executed: string[] = [];

    const result = await processOfflineQueue(TEST_USER, async change => {
      executed.push(change.recordId);
      if (change.recordId === 'material-invalid') {
        throw Object.assign(new Error('invalid payload'), { status: 422 });
      }
    });

    expect(executed).toEqual(['material-invalid', 'material-valid']);
    expect(result).toMatchObject({ syncedCount: 1, pendingCount: 1 });
    expect((await offlineQueue.getAll(TEST_USER))[0]).toMatchObject({
      recordId: 'material-invalid',
      failureKind: 'permanent',
    });

    await enqueueMaterial('material-later', 300);
    const followUp = vi.fn(async (_change: PendingChange) => undefined);
    await processOfflineQueue(TEST_USER, followUp);

    expect(followUp).toHaveBeenCalledTimes(1);
    expect(followUp.mock.calls[0][0].recordId).toBe('material-later');
  });

  it('does not delete a newer change enqueued while its older sequence is syncing', async () => {
    await enqueueMaterial('material-1', 100);
    const original = (await offlineQueue.getAll(TEST_USER))[0];
    const executedSequences: number[] = [];

    await processOfflineQueue(TEST_USER, async change => {
      executedSequences.push(change.sequence);
      if (change.sequence === original.sequence) {
        await enqueueMaterial('material-1', 250);
      }
    });

    expect(executedSequences).toEqual([original.sequence]);
    const remaining = await offlineQueue.getAll(TEST_USER);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({
      id: original.id,
      recordId: 'material-1',
      operation: 'upsert',
      data: { id: 'material-1', name: 'material-1', price: 250 },
    });
    expect(remaining[0].sequence).toBeGreaterThan(original.sequence);
  });

  it('keeps a superseding sequence eligible when the older in-flight sequence fails', async () => {
    await enqueueMaterial('material-1', 100);
    const original = (await offlineQueue.getAll(TEST_USER))[0];

    await expect(
      processOfflineQueue(TEST_USER, async change => {
        expect(change.sequence).toBe(original.sequence);
        await enqueueMaterial('material-1', 250);
        throw new Error('old payload was rejected');
      }),
    ).resolves.toMatchObject({ syncedCount: 0, pendingCount: 1 });

    const [superseding] = await offlineQueue.getAll(TEST_USER);
    expect(superseding).toMatchObject({
      id: original.id,
      recordId: 'material-1',
      data: { id: 'material-1', name: 'material-1', price: 250 },
      retryCount: 0,
    });
    expect(superseding.sequence).toBeGreaterThan(original.sequence);
    expect(superseding.lastError).toBeUndefined();

    const executeFollowUp = vi.fn(async (_change: PendingChange) => undefined);
    await processOfflineQueue(TEST_USER, executeFollowUp);

    expect(executeFollowUp).toHaveBeenCalledTimes(1);
    expect(executeFollowUp.mock.calls[0][0].sequence).toBe(superseding.sequence);
    expect(await offlineQueue.getAll(TEST_USER)).toEqual([]);
  });

  it('processes workspace tables in FIFO order and retains local salary calculations', async () => {
    const tables: CacheTableKey[] = [
      'estimates',
      'templates',
      'materials',
      'works',
      'bundles',
      'salary_calculations',
      'estimate_sections',
    ];
    for (const table of tables) {
      await offlineQueue.enqueueUpserts(TEST_USER, table, [{ id: `${table}-1` }]);
    }
    const executeChange = vi.fn(async (_change: PendingChange) => undefined);

    await processOfflineQueue(TEST_USER, executeChange);

    expect(executeChange.mock.calls.map(([change]) => change.table)).toEqual([
      'estimates', 'templates', 'materials', 'works', 'bundles', 'estimate_sections',
    ]);
    expect(await offlineQueue.getAll(TEST_USER)).toEqual([
      expect.objectContaining({ table: 'salary_calculations', retryCount: 0 }),
    ]);
  });

  it('dispatches a full table snapshot after confirming one pending record', async () => {
    const cacheUser = getCacheUserId(TEST_USER);
    await upsertCachedRecords('materials', cacheUser, [
      { id: 'material-1', name: 'material-1', price: 100 },
      { id: 'material-2', name: 'material-2', price: 200 },
    ]);
    await enqueueMaterial('material-1', 100);
    const listener = collectCacheUpdates();

    await processOfflineQueue(TEST_USER, async change => ({
      confirmedRecord: {
        table: change.table,
        data: { id: change.recordId, name: change.recordId, price: 150, serverRevision: 1 },
      },
    }));
    listener.stop();

    const materialUpdates = listener.updates.filter(update => update.key === 'materials');
    expect(materialUpdates).toHaveLength(1);
    const dispatched = materialUpdates[0].data as Array<{ id: string; price: number }>;
    expect(dispatched.map(record => record.id).sort()).toEqual(['material-1', 'material-2']);
    expect(dispatched.find(record => record.id === 'material-1')).toMatchObject({
      price: 150,
      serverRevision: 1,
    });
    expect(await getCachedRecords('materials', cacheUser)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'material-1', price: 150 })]),
    );
  });

  it('keeps a newer local edit in the dispatched snapshot when the server confirms an older one', async () => {
    const cacheUser = getCacheUserId(TEST_USER);
    await upsertCachedRecords('materials', cacheUser, [
      { id: 'material-1', name: 'material-1', price: 100 },
      { id: 'material-2', name: 'material-2', price: 200 },
    ]);
    await enqueueMaterial('material-1', 100);
    const listener = collectCacheUpdates();

    await processOfflineQueue(TEST_USER, async change => {
      // The user edits the same record while the older snapshot is in flight;
      // enqueue replaces the queued change, so acknowledge() returns false.
      await enqueueMaterial('material-1', 250);
      return {
        confirmedRecord: {
          table: change.table,
          data: { id: change.recordId, name: change.recordId, price: 100, serverRevision: 1 },
        },
      };
    });
    listener.stop();

    const materialUpdates = listener.updates.filter(update => update.key === 'materials');
    expect(materialUpdates).toHaveLength(1);
    const dispatched = materialUpdates[0].data as Array<{ id: string; price: number }>;
    expect(dispatched.map(record => record.id).sort()).toEqual(['material-1', 'material-2']);
    expect(dispatched.find(record => record.id === 'material-1')).toMatchObject({
      price: 250,
      serverRevision: 1,
    });
  });

  it('keeps the single-document event contract for estimate_sections confirmations', async () => {
    const document: EstimateSectionsDocument = {
      id: 'sections-1',
      schemaVersion: 1,
      definitions: [],
      order: [],
      serverRevision: 0,
    };
    await offlineQueue.enqueueUpserts(TEST_USER, 'estimate_sections', [document]);
    const listener = collectCacheUpdates();

    await processOfflineQueue(TEST_USER, async change => ({
      confirmedSections: change.data as EstimateSectionsDocument,
    }));
    listener.stop();

    const sectionUpdates = listener.updates.filter(update => update.key === 'estimate_sections');
    expect(sectionUpdates).toHaveLength(1);
    expect(sectionUpdates[0].data).toHaveLength(1);
    expect((sectionUpdates[0].data as Array<{ id: string }>)[0]).toMatchObject({ id: 'sections-1' });
  });

  it('restricts queue tables to CacheTableKey at compile time', () => {
    type EnqueueTable = Parameters<typeof offlineQueue.enqueueUpserts>[1];

    expectTypeOf<EnqueueTable>().toEqualTypeOf<CacheTableKey>();
  });
});
