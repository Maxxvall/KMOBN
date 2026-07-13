import { describe, expect, it } from 'vitest';
import { Estimate, EstimateCategory, EstimateStatus } from '../types';
import {
  buildEstimateDuplicateDeletePlan,
  findEstimateVersionDuplicates,
  getEstimateContentFingerprint,
  type EstimateDuplicateDeleteRequest,
} from './estimateIntelligence';

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

  it.each([
    ['item note', { note: 'Важно сохранить' }, {}],
    ['actual quantity', { actual: { quantity: 11 } }, { actual: { quantity: 10 } }],
    ['actual price', { actual: { price: 120 } }, { actual: { price: 100 } }],
    ['actual note', { actual: { note: 'Оплачено' } }, { actual: { note: 'Не оплачено' } }],
    ['actual-only flag', { isActualOnly: true }, { isActualOnly: false }],
  ])('does not merge versions that differ by %s', (_label, olderItemPatch, latestItemPatch) => {
    const baseItem = { id: 'i1', name: 'Брус', unit: 'м3', quantity: 1, price: 100, total: 100, category: EstimateCategory.WALLS };
    const estimates = [
      makeEstimate({ id: 'latest', estimateNumber: 'SM-BUSINESS', version: 2, items: [{ ...baseItem, ...latestItemPatch }], total: 100 }),
      makeEstimate({ id: 'older', estimateNumber: 'SM-BUSINESS', version: 1, items: [{ ...baseItem, ...olderItemPatch }], total: 100 }),
    ];

    expect(findEstimateVersionDuplicates(estimates)).toHaveLength(0);
  });

  it('does not merge versions with different business statuses', () => {
    const estimates = [
      makeEstimate({ id: 'latest', estimateNumber: 'SM-STATUS', version: 2, status: EstimateStatus.APPROVED }),
      makeEstimate({ id: 'older', estimateNumber: 'SM-STATUS', version: 1, status: EstimateStatus.DRAFT }),
    ];

    expect(findEstimateVersionDuplicates(estimates)).toHaveLength(0);
  });

  it('does not merge archived and active versions', () => {
    const estimates = [
      makeEstimate({ id: 'latest', estimateNumber: 'SM-ARCHIVE', version: 2, isArchived: false }),
      makeEstimate({ id: 'older', estimateNumber: 'SM-ARCHIVE', version: 1, isArchived: true }),
    ];

    expect(findEstimateVersionDuplicates(estimates)).toHaveLength(0);
  });

  it('ignores technical timestamps and item order in the fingerprint', () => {
    const itemA = { id: 'a', name: 'Брус', unit: 'м3', quantity: 1, price: 100, total: 100, category: EstimateCategory.WALLS, actual: { quantity: 1, price: 100, updatedAt: '2026-01-01' } };
    const itemB = { id: 'b', name: 'Доска', unit: 'шт', quantity: 2, price: 50, total: 100, category: EstimateCategory.WALLS };
    const latest = makeEstimate({ id: 'latest', estimateNumber: 'SM-ORDER', version: 2, date: '2026-07-01', items: [itemA, itemB], total: 200 });
    const older = makeEstimate({ id: 'older', estimateNumber: 'SM-ORDER', version: 1, parentId: 'latest', date: '2025-01-01', items: [itemB, { ...itemA, id: 'other-id', actual: { ...itemA.actual, updatedAt: '2026-07-01' } }], total: 200 });

    expect(getEstimateContentFingerprint(latest)).toBe(getEstimateContentFingerprint(older));
    expect(findEstimateVersionDuplicates([latest, older])).toHaveLength(1);
  });
});

const makeDeleteRequest = (latest: Estimate, candidates: Estimate[]): EstimateDuplicateDeleteRequest => ({
  estimateNumber: latest.estimateNumber,
  expectedLatestVersionId: latest.id,
  candidates: candidates.map(candidate => ({
    id: candidate.id,
    expectedFingerprint: getEstimateContentFingerprint(candidate),
  })),
});

describe('buildEstimateDuplicateDeletePlan', () => {
  it('allows a current old duplicate while preserving the latest version', () => {
    const latest = makeEstimate({ id: 'latest', estimateNumber: 'SM-SAFE', version: 2 });
    const older = makeEstimate({ id: 'older', estimateNumber: 'SM-SAFE', version: 1 });

    const plan = buildEstimateDuplicateDeletePlan([latest, older], [makeDeleteRequest(latest, [older])]);

    expect(plan.deleteIds).toEqual(['older']);
  });

  it('rejects a stale dialog when the latest version changed', () => {
    const snapshotLatest = makeEstimate({ id: 'latest-v2', estimateNumber: 'SM-STALE', version: 2 });
    const candidate = makeEstimate({ id: 'older', estimateNumber: 'SM-STALE', version: 1 });
    const currentLatest = makeEstimate({ id: 'latest-v3', estimateNumber: 'SM-STALE', version: 3 });

    expect(() => buildEstimateDuplicateDeletePlan(
      [currentLatest, snapshotLatest, candidate],
      [makeDeleteRequest(snapshotLatest, [candidate])],
    )).toThrow('изменилась');
  });

  it('rejects a candidate whose business content changed after scanning', () => {
    const latest = makeEstimate({ id: 'latest', estimateNumber: 'SM-CHANGED', version: 2 });
    const snapshotCandidate = makeEstimate({ id: 'older', estimateNumber: 'SM-CHANGED', version: 1 });
    const changedCandidate = makeEstimate({ ...snapshotCandidate, items: [{ id: 'i1', name: 'Брус', unit: 'м3', quantity: 1, price: 100, total: 100, category: EstimateCategory.WALLS, note: 'Изменено' }] });

    expect(() => buildEstimateDuplicateDeletePlan(
      [latest, changedCandidate],
      [makeDeleteRequest(latest, [snapshotCandidate])],
    )).toThrow('была изменена');
  });

  it('rejects an id from another estimate chain', () => {
    const latest = makeEstimate({ id: 'latest', estimateNumber: 'SM-ONE', version: 2 });
    const validOlder = makeEstimate({ id: 'older', estimateNumber: 'SM-ONE', version: 1 });
    const foreign = makeEstimate({ id: 'foreign', estimateNumber: 'SM-TWO', version: 1 });
    const request = makeDeleteRequest(latest, [foreign]);

    expect(() => buildEstimateDuplicateDeletePlan([latest, validOlder, foreign], [request]))
      .toThrow('другой цепочке');
  });

  it('rejects deleting every version of an identical historical content group', () => {
    const latest = makeEstimate({ id: 'latest', estimateNumber: 'SM-HISTORY', version: 3, items: [{ id: 'latest-item', name: 'Брус', unit: 'м3', quantity: 1, price: 100, total: 100, category: EstimateCategory.WALLS }], total: 100 });
    const oldA = makeEstimate({ id: 'old-a', estimateNumber: 'SM-HISTORY', version: 2, items: [{ id: 'a', name: 'Доска', unit: 'шт', quantity: 1, price: 50, total: 50, category: EstimateCategory.WALLS }], total: 50 });
    const oldB = makeEstimate({ id: 'old-b', estimateNumber: 'SM-HISTORY', version: 1, items: [{ id: 'b', name: 'Доска', unit: 'шт', quantity: 1, price: 50, total: 50, category: EstimateCategory.WALLS }], total: 50 });

    expect(() => buildEstimateDuplicateDeletePlan(
      [latest, oldA, oldB],
      [makeDeleteRequest(latest, [oldA, oldB])],
    )).toThrow('нужно сохранить одну версию');
  });
});
