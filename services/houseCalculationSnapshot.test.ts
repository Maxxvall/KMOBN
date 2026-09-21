import { describe, expect, it } from 'vitest';
import { EstimateCategory, EstimateStatus, EstimateSubgroup } from '../types';
import { calculateHouseEstimate, HouseCalculatorInput } from './houseCalculator';
import { createHouseCalculationSnapshot } from './houseCalculationSnapshot';

const input = (): HouseCalculatorInput => ({
    estimates: [{
        id: 'source',
        estimateNumber: 'SRC-1',
        client: 'Клиент',
        date: '2026-09-01',
        status: EstimateStatus.APPROVED,
        version: 1,
        buildingType: 'Каркасный дом',
        area: 80,
        total: 100_000,
        items: [{
            id: 'frame', name: 'Каркас стен', unit: 'комплект', quantity: 1, price: 100_000, total: 100_000,
            category: EstimateCategory.WALLS, subgroup: EstimateSubgroup.MATERIALS,
            actual: { quantity: 2, price: 90_000 },
        }],
    }],
    area: 80,
    floors: 1,
    glazingArea: 0,
    doors: 0,
    roofShape: 'gable',
    package: 'box',
    additions: [],
    rates: { overheadPercent: 0, marginPercent: 0, reservePercent: 0, taxPercent: 0, discountPercent: 0 },
    now: new Date('2026-09-21T00:00:00.000Z'),
});

describe('house calculation snapshot', () => {
    it('stores an independent original result without historical actual data', () => {
        const calculationInput = input();
        const result = calculateHouseEstimate(calculationInput);
        const snapshot = createHouseCalculationSnapshot(
            calculationInput,
            result,
            '2026-09-21T10:00:00.000Z',
            'calculation-1',
        );

        expect(snapshot).toMatchObject({
            schemaVersion: 1,
            calculationRulesVersion: 1,
            scopeRulesVersion: 1,
            input: { area: 80, package: 'box' },
            result: { sourceEstimateId: 'source', sourceEstimateNumber: 'SRC-1', base: result.base },
        });
        expect(snapshot.result.items[0]).not.toHaveProperty('actual');

        result.items[0].name = 'Изменено после снимка';
        expect(snapshot.result.items[0].name).toBe('Каркас стен');
    });
});
