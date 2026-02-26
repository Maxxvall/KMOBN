import { describe, expect, it } from 'vitest';
import type { Estimate } from '../types';
import { EstimateStatus } from '../types';
import { pickChangedRecordsByIds } from './database';

const createEstimate = (id: string): Estimate => ({
  id,
  estimateNumber: `SM-2026-001-${id}`,
  client: 'Client',
  date: '2026-02-26',
  status: EstimateStatus.DRAFT,
  version: 1,
  items: [],
  total: 0,
  buildingType: 'Каркасный дом',
  area: 100,
});

describe('pickChangedRecordsByIds', () => {
  it('returns only records with changed ids', () => {
    const records = [createEstimate('a'), createEstimate('b'), createEstimate('c')];

    const result = pickChangedRecordsByIds(records, ['b']);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b');
  });

  it('returns empty when changed list is empty', () => {
    const records = [createEstimate('a')];

    const result = pickChangedRecordsByIds(records, []);

    expect(result).toEqual([]);
  });
});
