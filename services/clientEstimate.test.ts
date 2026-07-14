import { describe, expect, it } from 'vitest';
import { Estimate, EstimateCategory, EstimateStatus } from '../types';
import { toClientEstimate } from './clientEstimate';

describe('toClientEstimate', () => {
    it('removes the internal crew tool plan from client exports', () => {
        const estimate: Estimate = {
            id: 'estimate', estimateNumber: 'SM-1', client: 'Клиент', date: '2026-07-14', status: EstimateStatus.APPROVED,
            version: 1, items: [{ id: 'item', name: 'Работа', unit: 'шт', quantity: 1, price: 1, total: 1, category: EstimateCategory.GENERAL }],
            total: 1, buildingType: 'Дом', area: 10,
            crewToolPlan: { crewSize: 4, requirements: [{ name: 'Молоток', toolKey: 'молоток', quantity: 4, quantityMode: 'crew', source: 'manual' }] },
        };

        expect(toClientEstimate(estimate)).not.toHaveProperty('crewToolPlan');
    });
});
