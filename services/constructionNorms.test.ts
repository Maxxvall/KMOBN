import { describe, expect, it } from 'vitest';
import { EstimateCategory, EstimateSubgroup } from '../types';
import { checkNormAnomalies } from './constructionNorms';

describe('construction norm unit conversion', () => {
  it('compares pack coverage with square-metre expectations', () => {
    const material = {
      id: 'm-1',
      name: 'Мембрана 25 м2',
      price: 100,
      lastUpdated: '2026-01-01',
      category: EstimateCategory.WALLS,
    };
    const work = {
      id: 'w-1',
      name: 'Монтаж ветровлагозащитной мембраны',
      price: 100,
      category: EstimateCategory.WALLS,
    };
    const result = checkNormAnomalies({
      area: 100,
      materials: [material],
      works: [work],
      items: [
        { id: 'w', name: work.name, unit: 'шт', quantity: 1, price: 100, total: 100, category: EstimateCategory.WALLS, subgroup: EstimateSubgroup.WORKS },
        { id: 'm', name: material.name, unit: 'шт', quantity: 8, price: 100, total: 800, category: EstimateCategory.WALLS, subgroup: EstimateSubgroup.MATERIALS },
      ],
    });

    expect(result.warnings).toEqual([]);
  });
});
