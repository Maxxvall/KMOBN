import { describe, expect, it } from 'vitest';
import { EstimateCategory, type Material, type Work } from '../types';
import {
  buildCatalogDuplicateDeletePlan,
  getCatalogDuplicateFingerprint,
  selectPreferredCatalogDuplicate,
  type CatalogDuplicateDecision,
} from './duplicateManagement';

const makeMaterial = (id: string, overrides: Partial<Material> = {}): Material => ({
  id,
  name: 'Доска 50×150',
  price: 1000,
  lastUpdated: '2026-01-01T00:00:00.000Z',
  category: EstimateCategory.WALLS,
  ...overrides,
});

const makeWork = (id: string, overrides: Partial<Work> = {}): Work => ({
  id,
  name: 'Монтаж каркаса',
  price: 1000,
  category: EstimateCategory.WALLS,
  ...overrides,
});

const decisionFor = (items: Array<Material | Work>, survivorId: string): CatalogDuplicateDecision => ({
  normalizedKey: items[0].name,
  survivorId,
  expectedItems: items.map(item => ({ id: item.id, fingerprint: getCatalogDuplicateFingerprint(item) })),
});

describe('selectPreferredCatalogDuplicate', () => {
  it('prefers a manual material price because it cannot be reconstructed safely', () => {
    const automatic = makeMaterial('automatic', {
      category: EstimateCategory.GENERAL,
      lastUpdated: '2026-07-01T00:00:00.000Z',
    });
    const manual = makeMaterial('manual', {
      isManualPrice: true,
      lastUpdated: '2026-01-01T00:00:00.000Z',
    });

    expect(selectPreferredCatalogDuplicate([automatic, manual])?.id).toBe('manual');
  });

  it('uses a stable best result regardless of input order', () => {
    const older = makeWork('older', { updated_at: '2026-01-01T00:00:00.000Z' });
    const newer = makeWork('newer', { updated_at: '2026-07-01T00:00:00.000Z' });

    expect(selectPreferredCatalogDuplicate([older, newer])?.id).toBe('newer');
    expect(selectPreferredCatalogDuplicate([newer, older])?.id).toBe('newer');
  });
});

describe('getCatalogDuplicateFingerprint', () => {
  it('changes when boardSpec changes', () => {
    const dry = makeMaterial('board', {
      boardSpec: {
        moisture: 'dry-planed',
        widthMm: 95,
        thicknessMm: 45,
        lengthMm: 6000,
      },
    });
    const naturalMoisture = makeMaterial('board', {
      boardSpec: {
        moisture: 'natural-moisture',
        widthMm: 100,
        thicknessMm: 50,
        lengthMm: 6000,
      },
    });

    expect(getCatalogDuplicateFingerprint(dry))
      .not.toBe(getCatalogDuplicateFingerprint(naturalMoisture));
  });
});

describe('buildCatalogDuplicateDeletePlan', () => {
  it('keeps one survivor and deletes the other 99 records', () => {
    const items = Array.from({ length: 100 }, (_, index) => makeMaterial(`material-${index}`));

    const plan = buildCatalogDuplicateDeletePlan(items, [decisionFor(items, 'material-42')]);

    expect(plan.survivorIds).toEqual(['material-42']);
    expect(plan.deleteIds).toHaveLength(99);
    expect(new Set(plan.deleteIds).size).toBe(99);
    expect(plan.deleteIds).not.toContain('material-42');
  });

  it('switches the survivor without requiring per-row selection', () => {
    const items = [makeMaterial('a'), makeMaterial('b'), makeMaterial('c')];

    const plan = buildCatalogDuplicateDeletePlan(items, [decisionFor(items, 'c')]);

    expect(plan.survivorIds).toEqual(['c']);
    expect(plan.deleteIds.sort()).toEqual(['a', 'b']);
  });

  it('rejects the whole stale decision when the current group changed', () => {
    const snapshot = [makeMaterial('a'), makeMaterial('b')];
    const current = [...snapshot, makeMaterial('c')];

    expect(() => buildCatalogDuplicateDeletePlan(current, [decisionFor(snapshot, 'a')]))
      .toThrow('Состав группы дублей изменился');
  });

  it('rejects the whole decision when a duplicate was edited after scanning', () => {
    const snapshot = [makeMaterial('a'), makeMaterial('b')];
    const current = [snapshot[0], { ...snapshot[1], price: 5000 }];

    expect(() => buildCatalogDuplicateDeletePlan(current, [decisionFor(snapshot, 'a')]))
      .toThrow('была изменена после поиска');
  });

  it('rejects a survivor outside the current duplicate group', () => {
    const group = [makeMaterial('a'), makeMaterial('b')];
    const unrelated = makeMaterial('other', { name: 'Утеплитель' });

    expect(() => buildCatalogDuplicateDeletePlan([...group, unrelated], [decisionFor(group, unrelated.id)]))
      .toThrow('сохраняемая запись больше не существует');
  });
});
