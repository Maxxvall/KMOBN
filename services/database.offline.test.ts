import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EstimateCategory,
  EstimateStatus,
  type Estimate,
  type Material,
  type ProjectTemplate,
  type SalaryCalculation,
  type Work,
  type WorkBundle,
  type EstimateSectionsDocument,
} from '../types';
import {
  addBundle,
  addMaterial,
  addTemplate,
  addWork,
  deleteBundle,
  deleteEstimatesByNumber,
  deleteMaterial,
  deleteWork,
  loadAllSalaryCalculations,
  loadBundles,
  loadEstimates,
  loadMaterials,
  loadTemplates,
  loadWorks,
  loadEstimateSections,
  saveEstimates,
  saveSalaryCalculation,
  updateBundle,
  updateMaterial,
  updateWork,
  saveEstimateSections,
} from './database';
import { addUserEstimateSection, createEstimateSectionsDocument } from './estimateSections';
import { closeIndexedDbCache, type CacheTableKey } from './indexedDbCache';
import { offlineQueue } from './offlineQueue';

const USER_A = 'user-a';
const USER_B = 'user-b';
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

const resetDatabases = async (): Promise<void> => {
  offlineQueue.close();
  closeIndexedDbCache();
  await Promise.all([
    deleteDatabase(CACHE_DB_NAME),
    deleteDatabase(QUEUE_DB_NAME),
  ]);
};

const installOfflineSession = (): void => {
  const storage = new MemoryStorage();
  storage.setItem(
    'sb-offline-test-auth-token',
    JSON.stringify({ user: { id: USER_A } }),
  );
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('navigator', { onLine: false });
};

const estimate = (
  id: string,
  estimateNumber = 'KM-2026-001',
  version = 1,
  parentId?: string,
): Estimate => ({
  id,
  parentId,
  estimateNumber,
  client: `Client ${id}`,
  date: '2026-07-13',
  status: EstimateStatus.DRAFT,
  version,
  items: [],
  total: 0,
  buildingType: 'Frame house',
  area: 100,
});

type CrudHarness<T extends { id: string }> = {
  table: CacheTableKey;
  initial: T;
  updated: T;
  create: (record: T) => Promise<void>;
  update: (record: T) => Promise<void>;
  remove: (id: string) => Promise<void>;
  load: () => Promise<T[]>;
};

const expectCreateUpdateDeleteCoalescing = async <T extends { id: string }>(
  harness: CrudHarness<T>,
): Promise<void> => {
  await harness.create(harness.initial);
  await harness.update(harness.updated);

  expect(await harness.load()).toEqual([harness.updated]);
  const afterUpdate = await offlineQueue.getForTable(USER_A, harness.table);
  expect(afterUpdate).toHaveLength(1);
  expect(afterUpdate[0]).toMatchObject({
    userId: USER_A,
    table: harness.table,
    recordId: harness.initial.id,
    operation: 'upsert',
    data: harness.updated,
  });

  await harness.remove(harness.initial.id);

  expect(await harness.load()).toEqual([]);
  const afterDelete = await offlineQueue.getForTable(USER_A, harness.table);
  expect(afterDelete).toHaveLength(1);
  expect(afterDelete[0]).toMatchObject({
    id: afterUpdate[0].id,
    userId: USER_A,
    table: harness.table,
    recordId: harness.initial.id,
    operation: 'delete',
    data: null,
  });
  expect(afterDelete[0].sequence).toBeGreaterThan(afterUpdate[0].sequence);
};

describe('database offline behavior', () => {
  beforeEach(async () => {
    installOfflineSession();
    await resetDatabases();
  });

  afterEach(async () => {
    await resetDatabases();
    vi.unstubAllGlobals();
  });

  it('saves estimates to local cache and the current user outbox', async () => {
    const localEstimate = estimate('estimate-1');

    await saveEstimates([localEstimate]);

    expect(await loadEstimates()).toEqual([localEstimate]);
    expect(await offlineQueue.getAll(USER_B)).toEqual([]);
    expect(await offlineQueue.getForTable(USER_A, 'estimates')).toEqual([
      expect.objectContaining({
        userId: USER_A,
        table: 'estimates',
        recordId: localEstimate.id,
        operation: 'upsert',
        data: localEstimate,
      }),
    ]);
  });

  it('keeps custom estimate sections in IndexedDB and the offline outbox', async () => {
    const localDocument: EstimateSectionsDocument = addUserEstimateSection(
      createEstimateSectionsDocument(USER_A),
      'Ландшафтные работы',
      new Date('2026-09-06T10:00:00.000Z'),
      'custom:44444444-4444-4444-8444-444444444444',
    );

    await saveEstimateSections(localDocument);
    closeIndexedDbCache();

    expect(await loadEstimateSections()).toEqual([localDocument]);
    expect(await offlineQueue.getForTable(USER_A, 'estimate_sections')).toEqual([
      expect.objectContaining({
        userId: USER_A,
        table: 'estimate_sections',
        recordId: USER_A,
        operation: 'upsert',
        data: localDocument,
      }),
    ]);
  });

  it('preserves engineering, empty, legacy, and future sections offline', async () => {
    const futureSection = 'БУДУЩИЙ РАЗДЕЛ' as EstimateCategory;
    const localEstimate: Estimate = {
      ...estimate('estimate-sections'),
      selectedSections: [EstimateCategory.WATER_SUPPLY, EstimateCategory.SEWERAGE],
      items: [
        { id: 'water', name: 'Коллектор', unit: 'шт', quantity: 1, price: 100, total: 100, category: EstimateCategory.WATER_SUPPLY },
        { id: 'general', name: 'Общая работа', unit: 'шт', quantity: 1, price: 200, total: 200, category: EstimateCategory.GENERAL },
        { id: 'future', name: 'Будущая работа', unit: 'шт', quantity: 1, price: 300, total: 300, category: futureSection },
      ],
      total: 600,
    };

    await saveEstimates([localEstimate]);
    closeIndexedDbCache();

    expect(await loadEstimates()).toEqual([localEstimate]);
    expect(await offlineQueue.getForTable(USER_A, 'estimates')).toEqual([
      expect.objectContaining({
        recordId: localEstimate.id,
        operation: 'upsert',
        data: localEstimate,
      }),
    ]);
  });

  it('keeps an archived estimate after reopening the local cache', async () => {
    const initial = estimate('estimate-archive');
    const archived = { ...initial, isArchived: true };

    await saveEstimates([initial]);
    await saveEstimates([archived]);
    closeIndexedDbCache();

    expect(await loadEstimates()).toEqual([archived]);
    expect(await offlineQueue.getForTable(USER_A, 'estimates')).toEqual([
      expect.objectContaining({
        recordId: archived.id,
        operation: 'upsert',
        data: archived,
      }),
    ]);
  });

  it('adds a template local-first while offline', async () => {
    const template: ProjectTemplate = {
      id: 'template-1',
      name: 'Offline template',
      baseArea: 120,
      items: [],
    };

    await addTemplate(template);

    expect(await loadTemplates()).toEqual([template]);
    expect(await offlineQueue.getForTable(USER_A, 'templates')).toEqual([
      expect.objectContaining({
        userId: USER_A,
        recordId: template.id,
        operation: 'upsert',
        data: template,
      }),
    ]);
  });

  it('keeps two salary calculations saved one after another', async () => {
    const first: SalaryCalculation = {
      id: 'salary-1',
      estimateId: 'estimate-1',
      estimateNumber: 'KM-2026-001',
      workers: [],
      workAllocations: [],
      createdDate: '2026-07-13',
    };
    const second: SalaryCalculation = {
      id: 'salary-2',
      estimateId: 'estimate-2',
      estimateNumber: 'KM-2026-002',
      workers: [],
      workAllocations: [],
      createdDate: '2026-07-13',
    };

    await saveSalaryCalculation(first);
    await saveSalaryCalculation(second);

    expect(await loadAllSalaryCalculations()).toEqual([first, second]);
    expect(
      (await offlineQueue.getForTable(USER_A, 'salary_calculations')).map(change => change.recordId),
    ).toEqual([first.id, second.id]);
  });

  it('coalesces material create, update, and delete into one tombstone', async () => {
    const initial: Material = {
      id: 'material-1',
      name: 'Board',
      price: 100,
      lastUpdated: '2026-07-13T10:00:00.000Z',
      category: EstimateCategory.WALLS,
    };
    const updated: Material = {
      ...initial,
      price: 150,
      lastUpdated: '2026-07-13T11:00:00.000Z',
    };

    await expectCreateUpdateDeleteCoalescing({
      table: 'materials',
      initial,
      updated,
      create: addMaterial,
      update: updateMaterial,
      remove: deleteMaterial,
      load: loadMaterials,
    });
  });

  it('coalesces work create, update, and delete into one tombstone', async () => {
    const initial: Work = {
      id: 'work-1',
      name: 'Wall framing',
      price: 500,
      category: EstimateCategory.WALLS,
    };
    const updated: Work = { ...initial, price: 750 };

    await expectCreateUpdateDeleteCoalescing({
      table: 'works',
      initial,
      updated,
      create: addWork,
      update: updateWork,
      remove: deleteWork,
      load: loadWorks,
    });
  });

  it('coalesces bundle create, update, and delete into one tombstone', async () => {
    const initial: WorkBundle = {
      id: 'bundle-1',
      name: 'Wall bundle',
      category: EstimateCategory.WALLS,
      items: [],
    };
    const updated: WorkBundle = { ...initial, name: 'Updated wall bundle' };

    await expectCreateUpdateDeleteCoalescing({
      table: 'bundles',
      initial,
      updated,
      create: addBundle,
      update: updateBundle,
      remove: deleteBundle,
      load: loadBundles,
    });
  });

  it('creates tombstones for every local estimate version with the selected number', async () => {
    const firstVersion = estimate('estimate-v1', 'KM-2026-001', 1);
    const secondVersion = estimate('estimate-v2', 'KM-2026-001', 2, firstVersion.id);
    const anotherEstimate = estimate('estimate-other', 'KM-2026-002', 1);
    await saveEstimates([firstVersion, secondVersion, anotherEstimate]);

    await deleteEstimatesByNumber('KM-2026-001');

    expect(await loadEstimates()).toEqual([anotherEstimate]);
    const changes = await offlineQueue.getForTable(USER_A, 'estimates');
    expect(
      changes
        .filter(change => change.operation === 'delete')
        .map(change => change.recordId)
        .sort(),
    ).toEqual([firstVersion.id, secondVersion.id].sort());
    expect(changes.find(change => change.recordId === anotherEstimate.id)).toMatchObject({
      operation: 'upsert',
      data: anotherEstimate,
    });
  });
});
