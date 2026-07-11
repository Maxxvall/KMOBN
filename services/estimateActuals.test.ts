import { describe, expect, it } from 'vitest';
import { Estimate, EstimateCategory, EstimateItem, EstimateStatus, EstimateSubgroup } from '../types';
import {
  buildActualItemComparison,
  calculateActualSummary,
  copyPlanToActual,
  shouldShowActualRow,
} from './estimateActuals';

const makeItem = (patch: Partial<EstimateItem> = {}): EstimateItem => ({
  id: 'i1',
  name: 'Утеплитель',
  unit: 'м2',
  quantity: 10,
  price: 100,
  total: 1000,
  category: EstimateCategory.WALLS,
  subgroup: EstimateSubgroup.MATERIALS,
  ...patch,
});

const makeEstimate = (items: EstimateItem[]): Estimate => ({
  id: 'e1',
  estimateNumber: 'SM-1',
  client: 'Client',
  date: '2026-07-11',
  status: EstimateStatus.DRAFT,
  version: 1,
  items,
  total: items.reduce((sum, item) => sum + item.total, 0),
  buildingType: 'Дом',
  area: 100,
});

describe('estimateActuals', () => {
  it('uses actual totals in forecast when actual is complete', () => {
    const row = buildActualItemComparison(makeItem({
      actual: { unit: 'м2', quantity: 12, price: 110 },
    }));

    expect(row.planTotal).toBe(1000);
    expect(row.actualTotal).toBe(1320);
    expect(row.forecastTotal).toBe(1320);
    expect(row.diff).toBe(320);
    expect(row.diffPct).toBe(32);
  });

  it('falls back to plan in forecast when actual is not complete', () => {
    const row = buildActualItemComparison(makeItem({
      actual: { unit: 'м2', quantity: 12 },
    }));

    expect(row.actualTotal).toBeNull();
    expect(row.forecastTotal).toBe(1000);
    expect(row.diff).toBe(0);
    expect(row.hasActual).toBe(true);
    expect(row.isActualComplete).toBe(false);
  });

  it('counts actual-only rows only in actual and forecast totals', () => {
    const estimate = makeEstimate([
      makeItem({ actual: { unit: 'м2', quantity: 8, price: 100 } }),
      makeItem({
        id: 'i2',
        name: 'Сетка от грызунов',
        unit: 'уп',
        quantity: 0,
        price: 0,
        total: 0,
        actual: { unit: 'уп', quantity: 3, price: 500 },
        isActualOnly: true,
      }),
    ]);

    expect(calculateActualSummary(estimate)).toMatchObject({
      planTotal: 1000,
      actualFilledTotal: 2300,
      forecastTotal: 2300,
      diff: 1300,
      actualOnlyItems: 1,
    });
  });

  it('copies plan values to actual fields', () => {
    const copied = copyPlanToActual(makeItem());

    expect(copied.actual?.unit).toBe('м2');
    expect(copied.actual?.quantity).toBe(10);
    expect(copied.actual?.price).toBe(100);
    expect(copied.actual?.total).toBe(1000);
    expect(copied.actual?.updatedAt).toBeTruthy();
  });

  it('filters missing and different rows', () => {
    const completeSame = copyPlanToActual(makeItem());
    const missing = makeItem({ id: 'i2', actual: { quantity: 1 } });
    const different = makeItem({ id: 'i3', actual: { unit: 'м2', quantity: 11, price: 100 } });

    expect(shouldShowActualRow(completeSame, 'different')).toBe(false);
    expect(shouldShowActualRow(missing, 'missing')).toBe(true);
    expect(shouldShowActualRow(different, 'different')).toBe(true);
  });
});
