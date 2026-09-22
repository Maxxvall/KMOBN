import { describe, expect, it } from 'vitest';
import { EstimateCategory, EstimateStatus, EstimateSubgroup, type Estimate, type SmartWizardParams } from '../types';
import { buildSmartEstimate } from './smartEstimateBuilder';

const params: SmartWizardParams = {
  buildingType: 'Каркасный дом',
  area: 100,
  floors: 1,
  foundation: 'Свайный',
  roof: 'Металлочерепица',
  insulation: 'Без',
  windowsDoors: 'Эконом',
  region: 'Москва',
  finishLevel: 'Черновая',
};

const unrelatedEstimate: Estimate = {
  id: 'garage-history',
  estimateNumber: 'SM-GARAGE',
  client: 'Test',
  date: '2026-01-01',
  status: EstimateStatus.APPROVED,
  version: 1,
  buildingType: 'Гараж',
  area: 20,
  total: 9999,
  items: [{
    id: 'garage-work',
    name: 'Монтаж кровли',
    unit: 'м2',
    quantity: 20,
    price: 9999,
    total: 199980,
    category: EstimateCategory.WALLS,
    subgroup: EstimateSubgroup.WORKS,
  }],
};

describe('buildSmartEstimate history selection', () => {
  it('does not borrow prices from approved estimates of another object type', () => {
    const result = buildSmartEstimate(params, [unrelatedEstimate], [], []);
    const frameWork = result.items.find(item => item.name === 'Монтаж кровли');

    expect(frameWork?.price).toBe(0);
    expect(result.warnings.some(warning => warning.type === 'low_confidence')).toBe(true);
  });
});
