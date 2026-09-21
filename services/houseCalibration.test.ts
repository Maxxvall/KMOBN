import { describe, expect, it } from 'vitest';
import { Estimate, EstimateCategory, EstimateStatus, HouseCalculationSnapshot } from '../types';
import { buildHouseAccuracyReport } from './houseCalibration';

const snapshot = (id: string, plan: number): HouseCalculationSnapshot => ({
    schemaVersion: 1,
    id: `snapshot-${id}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    calculationRulesVersion: 1,
    scopeRulesVersion: 1,
    input: {
        area: 100, floors: 1, glazingArea: 0, doors: 0, roofShape: 'gable', package: 'box', additions: [],
        rates: { overheadPercent: 0, marginPercent: 0, reservePercent: 0, taxPercent: 0, discountPercent: 0 },
    },
    result: {
        low: plan * 0.9,
        base: plan,
        high: plan * 1.1,
        confidence: 'medium',
        sourceEstimateId: 'source',
        sourceEstimateNumber: 'SRC',
        warnings: [],
        scope: [],
        items: [{ id: `item-${id}`, name: 'Каркас', unit: 'комплект', quantity: 1, price: plan, total: plan, category: EstimateCategory.WALLS }],
    },
});

const completed = (index: number, ratio = 1.1): Estimate => {
    const plan = 100_000;
    return {
        id: `estimate-${index}`,
        estimateNumber: `HOUSE-${index}`,
        client: 'Клиент',
        date: '2026-09-01',
        status: EstimateStatus.APPROVED,
        version: 1,
        buildingType: 'Каркасный дом',
        area: 100,
        total: plan,
        houseProjectId: `project-${index}`,
        houseExecutionStatus: 'actual-verified',
        houseActualBasis: 'client-price',
        houseActualVerifiedAt: '2026-09-10T00:00:00.000Z',
        houseCalculationSnapshots: [snapshot(String(index), plan)],
        items: [{
            id: `item-${index}`,
            name: 'Каркас',
            unit: 'комплект',
            quantity: 1,
            price: plan,
            total: plan,
            category: EstimateCategory.WALLS,
            actual: { quantity: 1, price: plan * ratio, total: plan * ratio, source: 'verified' },
        }],
    };
};

describe('house accuracy report', () => {
    it('does not use unfinished, copied-plan, or incompatible cost actuals', () => {
        const unfinished = { ...completed(1), houseExecutionStatus: 'in-progress' as const };
        const cost = { ...completed(2), houseActualBasis: 'cost' as const };
        const copied = completed(3);
        copied.items[0].actual = { ...copied.items[0].actual, source: 'copied-plan' };

        const report = buildHouseAccuracyReport([unfinished, cost, copied]);

        expect(report.eligibleProjectCount).toBe(0);
        expect(report.excluded).toEqual({
            unfinishedOrUnverified: 1,
            incompatibleBasis: 1,
            incompleteActuals: 1,
            missingSnapshot: 0,
        });
    });

    it('offers a section recommendation only after ten independent verified projects', () => {
        const nine = Array.from({ length: 9 }, (_, index) => completed(index));
        expect(buildHouseAccuracyReport(nine).sections[0].recommendationPercent).toBeNull();

        const ten = [...nine, completed(9)];
        expect(buildHouseAccuracyReport(ten).sections[0]).toMatchObject({
            category: EstimateCategory.WALLS,
            sampleCount: 10,
            medianDifferencePercent: 10,
            recommendationPercent: 10,
        });
    });

    it('uses only the latest version of one house project as one independent sample', () => {
        const first = completed(1, 1.1);
        const latest = { ...completed(1, 1.2), id: 'latest', version: 2 };

        const report = buildHouseAccuracyReport([first, latest]);

        expect(report.eligibleProjectCount).toBe(1);
        expect(report.sections[0].sampleCount).toBe(1);
        expect(report.sections[0].medianDifferencePercent).toBe(20);
    });
});
