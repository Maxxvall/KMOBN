import { describe, expect, it } from 'vitest';
import { Estimate, EstimateCategory, EstimateStatus } from '../types';
import { toClientEstimate } from './clientEstimate';

describe('toClientEstimate', () => {
    it('removes internal crew and house-calculation data from client exports', () => {
        const estimate: Estimate = {
            id: 'estimate', estimateNumber: 'SM-1', client: 'Клиент', date: '2026-07-14', status: EstimateStatus.APPROVED,
            version: 1, items: [{ id: 'item', name: 'Работа', unit: 'шт', quantity: 1, price: 1, total: 1, category: EstimateCategory.GENERAL }],
            total: 1, buildingType: 'Дом', area: 10,
            crewToolPlan: { crewSize: 4, requirements: [{ name: 'Молоток', toolKey: 'молоток', quantity: 4, quantityMode: 'crew', source: 'manual' }] },
            houseProjectId: 'project-1',
            houseCalculationSnapshots: [],
            houseExecutionStatus: 'actual-verified',
            houseActualVerifiedAt: '2026-07-14T00:00:00.000Z',
            houseActualBasis: 'cost',
        };

        const client = toClientEstimate(estimate);
        expect(client).not.toHaveProperty('crewToolPlan');
        expect(client).not.toHaveProperty('houseProjectId');
        expect(client).not.toHaveProperty('houseCalculationSnapshots');
        expect(client).not.toHaveProperty('houseExecutionStatus');
        expect(client).not.toHaveProperty('houseActualVerifiedAt');
        expect(client).not.toHaveProperty('houseActualBasis');
    });
});
