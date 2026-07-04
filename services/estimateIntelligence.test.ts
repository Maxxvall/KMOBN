import { describe, expect, it } from 'vitest';
import { Estimate, EstimateCategory, EstimateStatus } from '../types';
import { findEstimateVersionDuplicates } from './estimateIntelligence';

const makeEstimate = (overrides: Partial<Estimate> & { id: string; estimateNumber: string; version: number }): Estimate => ({
  client: 'Test Client',
  date: '2026-01-01',
  status: EstimateStatus.DRAFT,
  items: [],
  total: 0,
  buildingType: 'Каркасный дом',
  area: 100,
  ...overrides,
});

describe('findEstimateVersionDuplicates', () => {
  it('returns empty when no duplicates exist', () => {
    const estimates = [
      makeEstimate({ id: 'a1', estimateNumber: 'SM-001', version: 1, items: [{ id: 'i1', name: 'Брус', unit: 'м3', quantity: 1, price: 100, total: 100, category: EstimateCategory.WALLS }] }),
      makeEstimate({ id: 'a2', estimateNumber: 'SM-002', version: 1 }),
    ];
    const result = findEstimateVersionDuplicates(estimates);
    expect(result).toHaveLength(0);
  });

  it('detects old versions identical to latest', () => {
    const items = [{ id: 'i1', name: 'Брус', unit: 'м3', quantity: 1, price: 100, total: 100, category: EstimateCategory.WALLS }];
    const estimates = [
      makeEstimate({ id: 'a1', estimateNumber: 'SM-001', version: 3, items, total: 100 }),
      makeEstimate({ id: 'a2', estimateNumber: 'SM-001', version: 2, items, total: 100 }),
      makeEstimate({ id: 'a3', estimateNumber: 'SM-001', version: 1, items, total: 100 }),
    ];
    const result = findEstimateVersionDuplicates(estimates);
    expect(result).toHaveLength(1);
    expect(result[0].estimateNumber).toBe('SM-001');
    expect(result[0].latestVersionId).toBe('a1');
    expect(result[0].identicalToLatest).toHaveLength(2);
    expect(result[0].identicalToLatest.map(e => e.id).sort()).toEqual(['a2', 'a3']);
    expect(result[0].identicalPairs).toHaveLength(0);
  });

  it('detects identical pairs among old versions', () => {
    const itemsA = [{ id: 'i1', name: 'Брус', unit: 'м3', quantity: 1, price: 100, total: 100, category: EstimateCategory.WALLS }];
    const itemsB = [{ id: 'i1', name: 'Доска', unit: 'м3', quantity: 2, price: 200, total: 400, category: EstimateCategory.WALLS }];
    const estimates = [
      makeEstimate({ id: 'a1', estimateNumber: 'SM-001', version: 4, items: itemsA, total: 100 }),
      makeEstimate({ id: 'a2', estimateNumber: 'SM-001', version: 3, items: itemsB, total: 400 }),
      makeEstimate({ id: 'a3', estimateNumber: 'SM-001', version: 2, items: itemsB, total: 400 }),
      makeEstimate({ id: 'a4', estimateNumber: 'SM-001', version: 1, items: itemsA, total: 100 }),
    ];
    const result = findEstimateVersionDuplicates(estimates);
    expect(result).toHaveLength(1);
    // a4 is identical to latest (a1), a2+a3 are identical pair
    expect(result[0].identicalToLatest).toHaveLength(1);
    expect(result[0].identicalToLatest[0].id).toBe('a4');
    expect(result[0].identicalPairs).toHaveLength(1);
    expect(result[0].identicalPairs[0]).toHaveLength(2);
  });

  it('never marks latest version for deletion', () => {
    const items = [{ id: 'i1', name: 'Брус', unit: 'м3', quantity: 1, price: 100, total: 100, category: EstimateCategory.WALLS }];
    const estimates = [
      makeEstimate({ id: 'a1', estimateNumber: 'SM-001', version: 2, items, total: 100 }),
      makeEstimate({ id: 'a2', estimateNumber: 'SM-001', version: 1, items, total: 100 }),
    ];
    const result = findEstimateVersionDuplicates(estimates);
    expect(result).toHaveLength(1);
    expect(result[0].latestVersionId).toBe('a1');
    // a1 should NOT be in identicalToLatest
    expect(result[0].identicalToLatest.every(e => e.id !== 'a1')).toBe(true);
  });

  it('skips groups with only one version', () => {
    const estimates = [
      makeEstimate({ id: 'a1', estimateNumber: 'SM-001', version: 1 }),
    ];
    const result = findEstimateVersionDuplicates(estimates);
    expect(result).toHaveLength(0);
  });

  it('handles empty input', () => {
    expect(findEstimateVersionDuplicates([])).toHaveLength(0);
    expect(findEstimateVersionDuplicates(null as any)).toHaveLength(0);
  });

  it('does not detect as duplicate when content differs', () => {
    const itemsA = [{ id: 'i1', name: 'Брус', unit: 'м3', quantity: 1, price: 100, total: 100, category: EstimateCategory.WALLS }];
    const itemsB = [{ id: 'i1', name: 'Доска', unit: 'шт', quantity: 5, price: 50, total: 250, category: EstimateCategory.WALLS }];
    const estimates = [
      makeEstimate({ id: 'a1', estimateNumber: 'SM-001', version: 3, items: itemsA, total: 100 }),
      makeEstimate({ id: 'a2', estimateNumber: 'SM-001', version: 2, items: itemsB, total: 250 }),
      makeEstimate({ id: 'a3', estimateNumber: 'SM-001', version: 1, items: itemsA, total: 100 }),
    ];
    const result = findEstimateVersionDuplicates(estimates);
    expect(result).toHaveLength(1);
    // a3 matches latest (a1) in content, a2 has different content
    expect(result[0].identicalToLatest).toHaveLength(1);
    expect(result[0].identicalToLatest[0].id).toBe('a3');
    expect(result[0].identicalPairs).toHaveLength(0);
  });
});
