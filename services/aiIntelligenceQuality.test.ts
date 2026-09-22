import { describe, expect, it } from 'vitest';
import { EstimateCategory, EstimateStatus } from '../types';
import { analyzeHistoricalPatterns, scoreEstimateQuality } from './estimateIntelligence';

describe('AI historical quality guards', () => {
  it('scores an empty estimate as unusable', () => {
    expect(scoreEstimateQuality([], {
      graph: { workToMaterials: new Map(), workPrerequisites: new Map() },
    }).score).toBe(0);
  });

  it('does not reject otherwise similar history when its region is unknown', () => {
    const patterns = analyzeHistoricalPatterns([{
      id: 'history-1',
      estimateNumber: 'SM-1',
      client: 'Test',
      date: '2026-01-01',
      status: EstimateStatus.APPROVED,
      version: 1,
      items: [{
        id: 'item-1',
        name: 'Доска',
        unit: 'м3',
        quantity: 1,
        price: 100,
        total: 100,
        category: EstimateCategory.WALLS,
      }],
      total: 100,
      buildingType: 'Каркасный дом',
      area: 100,
    }], { area: 100, buildingType: 'Каркасный дом', region: 'Московская область' });

    expect(patterns.similarCount).toBe(1);
  });
});
