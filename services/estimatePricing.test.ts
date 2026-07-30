import { describe, expect, it } from 'vitest';
import {
  EstimateCategory,
  EstimateStatus,
  EstimateSubgroup,
  type Estimate,
  type EstimateItem,
  type Material,
} from '../types';
import { applyCatalogMaterialPrice, checkMaterialPrice, recalculateEstimateWorkPrices } from './estimatePricing';

const makeMaterial = (id: string, patch: Partial<Material> = {}): Material => ({
  id,
  name: 'OSB 9 mm',
  price: 800,
  lastUpdated: '2026-07-30T00:00:00.000Z',
  category: EstimateCategory.WALLS,
  ...patch,
});

const makeItem = (patch: Partial<EstimateItem> = {}): EstimateItem => ({
  id: 'item-1',
  name: 'OSB 9 mm',
  unit: 'sheet',
  quantity: 2,
  price: 700,
  total: 1400,
  category: EstimateCategory.WALLS,
  subgroup: EstimateSubgroup.MATERIALS,
  ...patch,
});

const makeEstimate = (items: EstimateItem[]): Estimate => ({
  id: 'estimate-1',
  estimateNumber: 'SM-1',
  client: 'Client',
  date: '2026-07-30',
  status: EstimateStatus.DRAFT,
  version: 1,
  items,
  total: items.reduce((sum, item) => sum + item.total, 0),
  buildingType: 'House',
  area: 100,
});

describe('checkMaterialPrice', () => {
  it('resolves by catalogMaterialId even when the item name changed', () => {
    const linked = makeMaterial('material-1', { name: 'Catalog name' });
    const result = checkMaterialPrice(
      makeItem({ name: 'Edited estimate name', catalogMaterialId: linked.id }),
      [makeMaterial('other'), linked],
    );

    expect(result).toMatchObject({
      status: 'outdated',
      material: linked,
      catalogPrice: 800,
      matchedBy: 'id',
    });
  });

  it('falls back to one normalized name match', () => {
    const material = makeMaterial('material-1', { name: '  OSB   9 MM  ' });

    expect(checkMaterialPrice(makeItem({ name: 'osb 9 mm' }), [material])).toMatchObject({
      status: 'outdated',
      material,
      matchedBy: 'name',
    });
  });

  it('returns missing when no material matches', () => {
    expect(checkMaterialPrice(makeItem({ name: 'Plywood' }), [makeMaterial('material-1')]))
      .toEqual({ status: 'missing' });
  });

  it('returns ambiguous for duplicate normalized names', () => {
    const duplicates = [
      makeMaterial('material-1', { name: 'OSB 9 mm' }),
      makeMaterial('material-2', { name: '  osb   9 MM ' }),
    ];

    expect(checkMaterialPrice(makeItem(), duplicates)).toEqual({ status: 'ambiguous' });
  });

  it.each([
    { itemPrice: 800, catalogPrice: 800, expected: 'current' },
    { itemPrice: 700, catalogPrice: 800, expected: 'outdated' },
    { itemPrice: 0, catalogPrice: 0, expected: 'current' },
    { itemPrice: 700, catalogPrice: 0, expected: 'outdated' },
  ] as const)('reports $expected for item price $itemPrice and catalog price $catalogPrice', ({
    itemPrice,
    catalogPrice,
    expected,
  }) => {
    const result = checkMaterialPrice(
      makeItem({ price: itemPrice }),
      [makeMaterial('material-1', { price: catalogPrice })],
    );

    expect(result.status).toBe(expected);
  });
});

describe('applyCatalogMaterialPrice', () => {
  it('updates only the target price, total and catalog link, then recalculates estimate total', () => {
    const actual = { unit: 'sheet', quantity: 3, price: 650, total: 1950, note: 'Paid' };
    const target = makeItem({ actual });
    const neighbor = makeItem({
      id: 'item-2',
      name: 'Installation',
      quantity: 1,
      price: 500,
      total: 500,
      subgroup: EstimateSubgroup.WORKS,
      actual: { unit: 'job', quantity: 1, price: 450, total: 450 },
    });
    const estimate = makeEstimate([target, neighbor]);
    const material = makeMaterial('material-1', { price: 900 });

    const result = applyCatalogMaterialPrice(estimate, target.id, [material]);
    const updatedTarget = result.estimate.items[0];

    expect(result.changed).toBe(true);
    expect(updatedTarget).toEqual({
      ...target,
      price: 900,
      total: 1800,
      catalogMaterialId: material.id,
    });
    expect(updatedTarget.actual).toBe(actual);
    expect(result.estimate.items[1]).toBe(neighbor);
    expect(result.estimate.total).toBe(2300);
  });

  it.each([
    {
      label: 'missing',
      materials: [makeMaterial('material-1', { name: 'Plywood' })],
      expectedStatus: 'missing',
    },
    {
      label: 'ambiguous',
      materials: [makeMaterial('material-1'), makeMaterial('material-2')],
      expectedStatus: 'ambiguous',
    },
  ] as const)('keeps the original estimate reference when the material is $label', ({
    materials,
    expectedStatus,
  }) => {
    const estimate = makeEstimate([makeItem()]);

    const result = applyCatalogMaterialPrice(estimate, 'item-1', [...materials]);

    expect(result.changed).toBe(false);
    expect(result.check.status).toBe(expectedStatus);
    expect(result.estimate).toBe(estimate);
  });
});

describe('recalculateEstimateWorkPrices', () => {
  it('keeps material snapshots and refreshes only linked work prices', () => {
    const material = makeItem({ catalogMaterialId: 'material-1' });
    const work = makeItem({
      id: 'work-item',
      name: 'Installation',
      quantity: 3,
      price: 500,
      total: 1500,
      subgroup: EstimateSubgroup.WORKS,
      catalogWorkId: 'work-1',
    });
    const estimate = { ...makeEstimate([material, work]), needsPriceUpdate: true };

    const result = recalculateEstimateWorkPrices(estimate, [{
      id: 'work-1',
      name: 'Installation',
      price: 650,
      category: EstimateCategory.WALLS,
    }]);

    expect(result.items[0]).toBe(material);
    expect(result.items[1]).toEqual({ ...work, price: 650, total: 1950 });
    expect(result.total).toBe(3350);
    expect(result.needsPriceUpdate).toBe(false);
  });
});
