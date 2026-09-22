import { describe, expect, it } from 'vitest';
import { getLearningContextSignature, getQuantityCorrectionFactor } from './aiLearning';

describe('AI learning context', () => {
  it('separates accounts and scope descriptions', () => {
    const base = { area: 100, buildingType: 'Каркасный дом', region: 'Москва' };
    expect(getLearningContextSignature({ ...base, accountId: 'user-a', scopeDescription: 'Только работы' }))
      .not.toBe(getLearningContextSignature({ ...base, accountId: 'user-b', scopeDescription: 'Только работы' }));
    expect(getLearningContextSignature({ ...base, accountId: 'user-a', scopeDescription: 'Только работы' }))
      .not.toBe(getLearningContextSignature({ ...base, accountId: 'user-a', scopeDescription: 'Дом под ключ' }));
  });

  it('does not learn a quantity multiplier from a unit conversion', () => {
    expect(getQuantityCorrectionFactor({
      name: 'Мембрана 25 м2',
      fromQty: 100,
      toQty: 4,
      fromUnit: 'м2',
      toUnit: 'шт',
    })).toBeNull();
  });
});
