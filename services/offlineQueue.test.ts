import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CacheTableKey } from './indexedDbCache';
import { offlineQueue } from './offlineQueue';

const TEST_USERS = ['queue-user-a', 'queue-user-b'] as const;

const material = (id: string, price: number) => ({
  id,
  name: `Material ${id}`,
  price,
});

const resetQueue = async () => {
  for (const userId of TEST_USERS) {
    await offlineQueue.clearUser(userId);
  }
  await offlineQueue.close();
};

describe('offlineQueue', () => {
  beforeEach(async () => {
    vi.stubGlobal('window', globalThis);
    await resetQueue();
  });
  afterEach(async () => {
    await resetQueue();
    vi.unstubAllGlobals();
  });

  it('persists pending changes after the IndexedDB connection is reopened', async () => {
    await offlineQueue.enqueueUpserts(
      TEST_USERS[0],
      'materials',
      [material('material-1', 100)],
    );

    await offlineQueue.close();

    const changes = await offlineQueue.getAll(TEST_USERS[0]);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      userId: TEST_USERS[0],
      table: 'materials',
      recordId: 'material-1',
      operation: 'upsert',
      data: material('material-1', 100),
      retryCount: 0,
    });
  });

  it('isolates reads, counts, and cleanup by user', async () => {
    await offlineQueue.enqueueUpserts(
      TEST_USERS[0],
      'materials',
      [material('material-a', 100)],
    );
    await offlineQueue.enqueueUpserts(
      TEST_USERS[1],
      'materials',
      [material('material-b', 200)],
    );

    expect(await offlineQueue.count(TEST_USERS[0])).toBe(1);
    expect(await offlineQueue.count(TEST_USERS[1])).toBe(1);
    expect((await offlineQueue.getAll(TEST_USERS[0])).map(change => change.recordId)).toEqual(['material-a']);
    expect((await offlineQueue.getAll(TEST_USERS[1])).map(change => change.recordId)).toEqual(['material-b']);

    await offlineQueue.clearUser(TEST_USERS[0]);

    expect(await offlineQueue.getAll(TEST_USERS[0])).toEqual([]);
    expect((await offlineQueue.getAll(TEST_USERS[1])).map(change => change.recordId)).toEqual(['material-b']);
  });

  it('returns pending changes in FIFO sequence order across tables', async () => {
    await offlineQueue.enqueueUpserts(TEST_USERS[0], 'works', [{ id: 'work-1', name: 'Work 1', price: 10 }]);
    await offlineQueue.enqueueDeletes(TEST_USERS[0], 'materials', ['material-1']);
    await offlineQueue.enqueueUpserts(TEST_USERS[0], 'bundles', [{ id: 'bundle-1', name: 'Bundle 1', items: [] }]);

    const changes = await offlineQueue.getAll(TEST_USERS[0]);

    expect(changes.map(change => change.recordId)).toEqual(['work-1', 'material-1', 'bundle-1']);
    expect(changes.map(change => change.sequence)).toEqual(
      [...changes].map(change => change.sequence).sort((left, right) => left - right),
    );
    expect(await offlineQueue.getForTable(TEST_USERS[0], 'materials')).toEqual([changes[1]]);
  });

  it('coalesces an upsert followed by delete into one latest delete', async () => {
    await offlineQueue.enqueueUpserts(
      TEST_USERS[0],
      'materials',
      [material('material-1', 100)],
    );
    const original = (await offlineQueue.getAll(TEST_USERS[0]))[0];

    await offlineQueue.enqueueDeletes(TEST_USERS[0], 'materials', ['material-1']);

    const changes = await offlineQueue.getAll(TEST_USERS[0]);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      id: original.id,
      userId: TEST_USERS[0],
      table: 'materials',
      recordId: 'material-1',
      operation: 'delete',
    });
    expect(changes[0].sequence).toBeGreaterThan(original.sequence);
  });

  it('does not acknowledge a newer coalesced change with a stale sequence', async () => {
    await offlineQueue.enqueueUpserts(
      TEST_USERS[0],
      'materials',
      [material('material-1', 100)],
    );
    const original = (await offlineQueue.getAll(TEST_USERS[0]))[0];

    await offlineQueue.enqueueUpserts(
      TEST_USERS[0],
      'materials',
      [material('material-1', 250)],
    );
    const newer = (await offlineQueue.getAll(TEST_USERS[0]))[0];

    await offlineQueue.acknowledge(original.id, original.sequence);
    expect(await offlineQueue.getAll(TEST_USERS[0])).toEqual([newer]);

    await offlineQueue.acknowledge(newer.id, newer.sequence);
    expect(await offlineQueue.getAll(TEST_USERS[0])).toEqual([]);
  });

  it('retains a failed change and records its retry information', async () => {
    await offlineQueue.enqueueUpserts(
      TEST_USERS[0],
      'materials',
      [material('material-1', 100)],
    );
    const pending = (await offlineQueue.getAll(TEST_USERS[0]))[0];

    await offlineQueue.markFailed(pending.id, pending.sequence, new Error('network unavailable'));

    const changes = await offlineQueue.getAll(TEST_USERS[0]);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      id: pending.id,
      sequence: pending.sequence,
      retryCount: 1,
      lastError: 'network unavailable',
      failureKind: 'transient',
    });
    expect(Date.parse(changes[0].nextRetryAt ?? '')).toBeGreaterThan(Date.parse(changes[0].lastAttemptAt ?? ''));
  });

  it('records permanent failures without an automatic retry time', async () => {
    await offlineQueue.enqueueUpserts(TEST_USERS[0], 'materials', [material('material-1', 100)]);
    const pending = (await offlineQueue.getAll(TEST_USERS[0]))[0];

    await offlineQueue.markFailed(pending.id, pending.sequence, new Error('RLS denied'), false);

    const [failed] = await offlineQueue.getAll(TEST_USERS[0]);
    expect(failed.failureKind).toBe('permanent');
    expect(failed.nextRetryAt).toBeUndefined();
  });

  it('accepts every CacheTableKey', async () => {
    const tables: CacheTableKey[] = [
      'estimates',
      'templates',
      'materials',
      'works',
      'bundles',
      'salary_calculations',
    ];

    for (const table of tables) {
      await offlineQueue.enqueueUpserts(TEST_USERS[0], table, [{ id: `${table}-1` }]);
    }

    expect((await offlineQueue.getAll(TEST_USERS[0])).map(change => change.table)).toEqual(tables);
  });
});
