import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { CacheTableKey } from './indexedDbCache';
import { offlineQueue, type PendingChange } from './offlineQueue';
import { processOfflineQueue } from './offlineSync';

const TEST_USER = 'sync-user';

const resetQueue = async () => {
  await offlineQueue.clearUser(TEST_USER);
  await offlineQueue.close();
};

const enqueueMaterial = (id: string, price: number) =>
  offlineQueue.enqueueUpserts(TEST_USER, 'materials', [{ id, name: id, price }]);

describe('processOfflineQueue', () => {
  beforeEach(async () => {
    vi.stubGlobal('window', globalThis);
    await resetQueue();
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
    })).rejects.toMatchObject({ retryable: false });

    const [failed] = await offlineQueue.getAll(TEST_USER);
    expect(failed).toMatchObject({ failureKind: 'permanent', retryCount: 1 });
    expect(failed.nextRetryAt).toBeUndefined();
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

  it('processes all seven supported cache tables in FIFO order', async () => {
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

    expect(executeChange.mock.calls.map(([change]) => change.table)).toEqual(tables);
    expect(await offlineQueue.count(TEST_USER)).toBe(0);
  });

  it('restricts queue tables to CacheTableKey at compile time', () => {
    type EnqueueTable = Parameters<typeof offlineQueue.enqueueUpserts>[1];

    expectTypeOf<EnqueueTable>().toEqualTypeOf<CacheTableKey>();
  });
});
