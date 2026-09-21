import { describe, expect, it } from 'vitest';
import { EstimateCategory, EstimateItem, EstimateSubgroup } from '../types';
import { evaluateHouseScope } from './houseScope';

const item = (overrides: Partial<EstimateItem>): EstimateItem => ({
    id: overrides.id || 'item',
    name: overrides.name || 'Позиция',
    unit: 'комплект',
    quantity: 1,
    price: 100,
    total: 100,
    category: EstimateCategory.WALLS,
    subgroup: EstimateSubgroup.MATERIALS,
    ...overrides,
});

describe('house scope completeness', () => {
    it('keeps engineering systems separate instead of treating one electrical row as complete engineering', () => {
        const scope = evaluateHouseScope([
            item({ name: 'Кабель и автоматика', category: EstimateCategory.ELECTRICAL }),
        ], 'turnkey-engineering');

        expect(scope.find(value => value.id === 'electrical')?.status).toBe('included');
        expect(scope.find(value => value.id === 'heating')?.status).toBe('needs-clarification');
        expect(scope.find(value => value.id === 'water-supply')?.status).toBe('needs-clarification');
        expect(scope.find(value => value.id === 'sewerage')?.status).toBe('needs-clarification');
        expect(scope.find(value => value.id === 'ventilation')?.status).toBe('needs-clarification');
    });

    it('marks a construction scope partial when only materials or only works are present', () => {
        const scope = evaluateHouseScope([
            item({ name: 'Пиломатериал каркаса', category: EstimateCategory.WALLS, subgroup: EstimateSubgroup.MATERIALS }),
        ], 'box');

        expect(scope.find(value => value.id === 'structure')).toMatchObject({
            status: 'partial',
            details: ['Не найдены работы.'],
        });
    });

    it('does not accept a row without a positive priced amount as complete', () => {
        const scope = evaluateHouseScope([
            item({ name: 'Монтаж кровли', category: EstimateCategory.ROOF, subgroup: EstimateSubgroup.WORKS, price: 0, total: 0 }),
            item({ name: 'Кровельный материал', category: EstimateCategory.ROOF, subgroup: EstimateSubgroup.MATERIALS }),
        ], 'box');

        expect(scope.find(value => value.id === 'roof')?.status).toBe('partial');
    });
});
