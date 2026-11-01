import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EstimateCategory } from '../types';

const cacheHook = vi.hoisted(() => ({
    failUpsert: false,
    realUpsert: null as null | ((...args: never[]) => Promise<void>),
}));

// Simulate an IndexedDB cache failure that happens AFTER the outbox write.
vi.mock('./indexedDbCache', async importOriginal => {
    const actual = await importOriginal<typeof import('./indexedDbCache')>();
    cacheHook.realUpsert = actual.upsertCachedRecords;
    return {
        ...actual,
        upsertCachedRecords: vi.fn(async (...args: unknown[]) => {
            if (cacheHook.failUpsert) throw new Error('QuotaExceededError');
            return cacheHook.realUpsert!(...(args as never[]));
        }),
    };
});

import { saveMaterials } from './database';
import { closeIndexedDbCache, getCacheUserId, getCachedRecords } from './indexedDbCache';
import { offlineQueue } from './offlineQueue';
import { rememberOfflineUser } from './offlineIdentity';

const USER_ID = 'persistence-user';
const CACHE_DB_NAME = 'kmobn_indexeddb_cache';
const QUEUE_DB_NAME = 'kmobn_offline_queue';

class MemoryStorage implements Storage {
    private values = new Map<string, string>();
    get length() { return this.values.size; }
    clear() { this.values.clear(); }
    getItem(key: string) { return this.values.get(key) ?? null; }
    key(index: number) { return [...this.values.keys()][index] ?? null; }
    removeItem(key: string) { this.values.delete(key); }
    setItem(key: string, value: string) { this.values.set(key, value); }
}

const deleteDatabase = (name: string): Promise<void> => new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
});

const resetDatabases = async (): Promise<void> => {
    offlineQueue.close();
    closeIndexedDbCache();
    await Promise.all([deleteDatabase(CACHE_DB_NAME), deleteDatabase(QUEUE_DB_NAME)]);
};

const material = { id: 'material-1', name: 'Доска', price: 100, lastUpdated: '2026-09-22T00:00:00.000Z', category: EstimateCategory.WALLS };

describe('outbox-first persistence', () => {
    beforeEach(() => {
        vi.stubGlobal('window', globalThis);
        vi.stubGlobal('localStorage', new MemoryStorage());
        rememberOfflineUser({
            id: USER_ID,
            aud: 'authenticated',
            role: 'authenticated',
            email: 'persistence@example.test',
            app_metadata: {},
            user_metadata: {},
            created_at: '2026-09-22T00:00:00.000Z',
        } as never);
    });

    afterEach(async () => {
        cacheHook.failUpsert = false;
        await resetDatabases();
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('keeps the queued change when the cache write fails, and heals on retry', async () => {
        cacheHook.failUpsert = true;
        await expect(saveMaterials([material])).rejects.toThrow('QuotaExceededError');

        // The outbox write already happened before the failing cache write:
        // the user data survives the storage failure.
        const pending = await offlineQueue.getAll(USER_ID);
        expect(pending).toHaveLength(1);
        expect(pending[0]).toMatchObject({ table: 'materials', recordId: 'material-1' });

        // Retry with a working cache coalesces into the same queue item and
        // restores the cached copy.
        cacheHook.failUpsert = false;
        await saveMaterials([material]);

        expect(await offlineQueue.getAll(USER_ID)).toHaveLength(1);
        expect(await getCachedRecords('materials', getCacheUserId(USER_ID))).toEqual([material]);
    });
});
