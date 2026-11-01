import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EstimateCategory, EstimateStatus, type Estimate, type Material } from '../types';
import { getCacheUserId, getCachedRecords } from './indexedDbCache';
import { offlineQueue } from './offlineQueue';
import { exportData, importData, validateImportData } from './dataTransfer';
import { rememberOfflineUser } from './offlineIdentity';

const USER_ID = 'import-user';
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

const estimate = (id: string, patch: Partial<Estimate> = {}): Estimate => ({
    id,
    estimateNumber: 'SM-2026-001',
    client: `Клиент ${id}`,
    date: '2026-07-13',
    status: EstimateStatus.DRAFT,
    version: 1,
    items: [],
    total: 100,
    buildingType: 'Каркасный дом',
    area: 100,
    ...patch,
});

const material = (name: string, price: number): Material => ({
    id: `mat-${name}`,
    name,
    price,
    lastUpdated: '2026-07-01T00:00:00.000Z',
    category: EstimateCategory.WALLS,
});

const backupPayload = (overrides: Record<string, unknown> = {}): string => JSON.stringify({
    schemaVersion: 3,
    estimates: [estimate('e-1')],
    templates: [],
    materials: [material('Доска', 100)],
    works: [],
    bundles: [],
    ...overrides,
});

describe('validateImportData', () => {
    it('accepts a well-formed backup', () => {
        expect(validateImportData(backupPayload())).toMatchObject({ ok: true });
    });

    it('rejects broken JSON and non-object roots', () => {
        expect(validateImportData('{broken')).toMatchObject({ ok: false });
        expect(validateImportData('[]')).toMatchObject({ ok: false });
        expect(validateImportData('')).toMatchObject({ ok: false });
    });

    it('rejects a newer schema version', () => {
        expect(validateImportData(backupPayload({ schemaVersion: 99 })))
            .toMatchObject({ ok: false, error: expect.stringContaining('более новой версии') });
    });

    it('rejects non-array collection fields', () => {
        expect(validateImportData(backupPayload({ materials: 'not-an-array' })))
            .toMatchObject({ ok: false, error: expect.stringContaining('массивом') });
    });
});

describe('importData', () => {
    beforeEach(() => {
        vi.stubGlobal('window', new EventTarget());
        vi.stubGlobal('localStorage', new MemoryStorage());
        vi.stubGlobal('navigator', { onLine: false });
        rememberOfflineUser({
            id: USER_ID,
            aud: 'authenticated',
            role: 'authenticated',
            email: 'import@example.test',
            app_metadata: {},
            user_metadata: {},
            created_at: '2026-09-22T00:00:00.000Z',
        } as never);
    });

    afterEach(async () => {
        offlineQueue.close();
        vi.unstubAllGlobals();
        await Promise.all([deleteDatabase(CACHE_DB_NAME), deleteDatabase(QUEUE_DB_NAME)]);
    });

    const cachedMaterials = async () => getCachedRecords<Material>('materials', getCacheUserId(USER_ID));

    it('adds new records and reports added counters', async () => {
        const result = await importData(backupPayload());

        expect(result.estimates.added).toBe(1);
        expect(result.materials.added).toBe(1);
        expect(result.materials.updated).toBe(0);
        expect((await cachedMaterials())[0]).toMatchObject({ name: 'Доска', price: 100 });
        expect(await getCachedRecords('estimates', getCacheUserId(USER_ID))).toHaveLength(1);
    });

    it('merges with existing data without overwriting identical records', async () => {
        await importData(backupPayload());

        // Same name, same price: unchanged. Different price: updated.
        const second = await importData(backupPayload({
            materials: [material('Доска', 100), material('Брус', 300)],
            estimates: [],
        }));

        expect(second.materials.added).toBe(1);
        expect(second.materials.updated).toBe(0);
        expect(second.materials.unchanged).toBe(1);
        expect((await cachedMaterials()).map(record => record.name).sort()).toEqual(['Брус', 'Доска']);
    });

    it('updates an existing material when price or category changes', async () => {
        await importData(backupPayload());
        const result = await importData(backupPayload({
            materials: [material('Доска', 150)],
            estimates: [],
        }));

        expect(result.materials.updated).toBe(1);
        expect((await cachedMaterials())[0]).toMatchObject({ price: 150 });
    });

    it('keeps both same-name records when their ids differ (duplicates are handled by the merge tool)', async () => {
        // Import deduplicates by id only. Same-name rows with distinct ids are
        // both imported; name-merging applies only against EXISTING data, and
        // catalog duplicates are resolved manually via the duplicate checker.
        const result = await importData(backupPayload({
            materials: [material('Доска', 100), { ...material('Доска', 100), id: 'mat-dup', price: 120 }],
            estimates: [],
        }));

        expect(result.materials.added).toBe(2);
        expect(result.materials.inFileDuplicates).toBe(0);
        expect((await cachedMaterials()).filter(record => record.name === 'Доска')).toHaveLength(2);
    });

    it('keeps local-only records that are absent from the import file', async () => {
        await importData(backupPayload({ materials: [material('Доска', 100), material('Брус', 200)] }));
        await importData(backupPayload({ materials: [material('Доска', 100)], estimates: [] }));

        // Локальная запись «Брус» не удаляется: импорт только добавляет/обновляет.
        expect((await cachedMaterials()).map(record => record.name).sort()).toEqual(['Брус', 'Доска']);
    });

    it('rejects a broken file without touching stored data', async () => {
        await importData(backupPayload());
        const before = await cachedMaterials();

        await expect(importData('{broken json')).rejects.toThrow();
        expect(await cachedMaterials()).toEqual(before);
    });

    it('accepts an empty backup and stores nothing', async () => {
        const result = await importData(JSON.stringify({
            schemaVersion: 3,
            estimates: [], templates: [], materials: [], works: [], bundles: [],
        }));

        expect(result.estimates.added).toBe(0);
        expect(result.materials.added).toBe(0);
        expect(await cachedMaterials()).toHaveLength(0);
        expect(await getCachedRecords('estimates', getCacheUserId(USER_ID))).toHaveLength(0);
    });

    it('exports the stored data with schema version and export date', async () => {
        await importData(backupPayload());
        const parsed = JSON.parse(await exportData()) as { schemaVersion: number; estimates: unknown[]; exportedAt: string };

        expect(parsed.schemaVersion).toBe(3);
        expect(parsed.estimates).toHaveLength(1);
        expect(typeof parsed.exportedAt).toBe('string');
    });
});
