import { describe, expect, it } from 'vitest';
import { EstimateCategory, EstimateItem, EstimateSubgroup, Work } from '../types';
import { buildCrewToolPlan } from './toolPlanning';

const work = (id: string, name: string, quantity: number, quantityMode: 'crew' | 'person' = 'crew'): Work => ({
    id,
    name,
    price: 100,
    category: EstimateCategory.WALLS,
    toolRequirements: [{ name: 'Молоток', quantity, quantityMode }],
});

const item = (id: string, name: string, catalogWorkId?: string): EstimateItem => ({
    id,
    name,
    catalogWorkId,
    unit: 'м2',
    quantity: 1,
    price: 100,
    total: 100,
    category: EstimateCategory.WALLS,
    subgroup: EstimateSubgroup.WORKS,
});

describe('toolPlanning', () => {
    it('combines duplicate tools across works by normalized key', () => {
        const result = buildCrewToolPlan({
            estimateItems: [item('i1', 'Каркас', 'w1'), item('i2', 'Обшивка', 'w2')],
            works: [work('w1', 'Каркас', 1), { ...work('w2', 'Обшивка', 1), toolRequirements: [{ name: '  МОЛОТОК ', quantity: 1, quantityMode: 'crew' }] }],
            crewSize: 3,
        });

        expect(result.aggregated).toHaveLength(1);
        expect(result.aggregated[0]).toMatchObject({ toolKey: 'молоток', requirementCount: 2 });
    });

    it('uses maximum requirement between works instead of sum', () => {
        const result = buildCrewToolPlan({
            estimateItems: [item('i1', 'Каркас', 'w1'), item('i2', 'Обшивка', 'w2')],
            works: [work('w1', 'Каркас', 2), work('w2', 'Обшивка', 5)],
            crewSize: 3,
        });

        expect(result.aggregated[0].quantity).toBe(5);
    });

    it('scales per-person requirements by crew size', () => {
        const result = buildCrewToolPlan({
            estimateItems: [item('i1', 'Каркас', 'w1')],
            works: [work('w1', 'Каркас', 2, 'person')],
            crewSize: 4,
        });

        expect(result.aggregated[0].quantity).toBe(8);
    });

    it('applies a final quantity override', () => {
        const result = buildCrewToolPlan({
            estimateItems: [item('i1', 'Каркас', 'w1')],
            works: [work('w1', 'Каркас', 2)],
            crewSize: 4,
            quantityOverrides: { молоток: 7 },
        });

        expect(result.aggregated[0].quantity).toBe(7);
    });

    it('reports work items missing from the catalog', () => {
        const result = buildCrewToolPlan({
            estimateItems: [item('missing', 'Неизвестная работа')],
            works: [],
            crewSize: 2,
        });

        expect(result.coverage).toEqual({
            totalWorkItems: 1,
            mappedWorkItems: 0,
            coveredWorkItems: 0,
            missingWorkItemIds: ['missing'],
        });
    });

    it('matches legacy items by normalized name and category', () => {
        const result = buildCrewToolPlan({
            estimateItems: [item('legacy', '  МОНТАЖ   КАРКАСА ')],
            works: [work('w1', 'Монтаж каркаса', 2)],
            crewSize: 2,
        });

        expect(result.coverage).toMatchObject({ mappedWorkItems: 1, coveredWorkItems: 1 });
        expect(result.plan.requirements[0]).toMatchObject({ catalogWorkId: 'w1', estimateItemId: 'legacy' });
    });

    it('adds manual requirements without affecting work coverage', () => {
        const result = buildCrewToolPlan({
            estimateItems: [item('i1', 'Каркас', 'w1')],
            works: [work('w1', 'Каркас', 1)],
            crewSize: 2,
            manualRequirements: [{ name: 'Аптечка', quantity: 1, quantityMode: 'crew' }],
        });

        expect(result.coverage).toMatchObject({ totalWorkItems: 1, mappedWorkItems: 1, coveredWorkItems: 1 });
        expect(result.plan.requirements.find(requirement => requirement.source === 'manual')).toMatchObject({
            name: 'Аптечка',
            toolKey: 'аптечка',
        });
    });

    it('ignores material estimate items when calculating work coverage', () => {
        const material = { ...item('material', 'Каркас', 'w1'), subgroup: EstimateSubgroup.MATERIALS };

        const result = buildCrewToolPlan({
            estimateItems: [material],
            works: [work('w1', 'Каркас', 1)],
            crewSize: 2,
        });

        expect(result.coverage).toEqual({
            totalWorkItems: 0,
            mappedWorkItems: 0,
            coveredWorkItems: 0,
            missingWorkItemIds: [],
        });
        expect(result.aggregated).toEqual([]);
    });
});
