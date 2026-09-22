import { describe, expect, it } from 'vitest';
import { EstimateCategory, EstimateSubgroup } from '../types';
import { deriveAIProjectScope, filterItemsToAIProjectScope } from './aiProjectSpec';

const items = [
  { id: 'w', name: 'Монтаж кровли', unit: 'шт', quantity: 1, price: 1, total: 1, category: EstimateCategory.ROOF, subgroup: EstimateSubgroup.WORKS },
  { id: 'm', name: 'Металлочерепица', unit: 'м2', quantity: 100, price: 1, total: 100, category: EstimateCategory.ROOF, subgroup: EstimateSubgroup.MATERIALS },
  { id: 'e', name: 'Монтаж кабеля', unit: 'шт', quantity: 1, price: 1, total: 1, category: EstimateCategory.ELECTRICAL, subgroup: EstimateSubgroup.WORKS },
];

describe('AI project scope', () => {
  it('enforces customer materials and explicit section exclusions', () => {
    const scope = deriveAIProjectScope('Ремонт кровли, материалы заказчика, без электрики');
    const filtered = filterItemsToAIProjectScope(items, scope);
    expect(filtered.items.map(item => item.id)).toEqual(['w']);
  });

  it('requires clarification when a selected section is excluded by the description', () => {
    const scope = deriveAIProjectScope('Дом без электрики', [EstimateCategory.ELECTRICAL]);

    expect(scope.needsClarification).toHaveLength(1);
    expect(scope.needsClarification[0]).toContain(EstimateCategory.ELECTRICAL);
  });

  it('treats selected sections as authoritative', () => {
    const scope = deriveAIProjectScope('', [EstimateCategory.ROOF]);
    expect(filterItemsToAIProjectScope(items, scope).items.map(item => item.id)).toEqual(['w', 'm']);
  });
});
