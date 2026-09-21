import { HouseCalculationSnapshot } from '../types';
import type { HouseCalculatorInput, HouseCalculatorResult } from './houseCalculator';

export function createHouseCalculationSnapshot(
    input: HouseCalculatorInput,
    result: HouseCalculatorResult,
    createdAt: string,
    id: string,
    plannedItems = result.items,
): HouseCalculationSnapshot {
    return {
        schemaVersion: 1,
        id,
        createdAt,
        calculationRulesVersion: 1,
        scopeRulesVersion: 1,
        input: {
            area: input.area,
            floors: input.floors,
            glazingArea: input.glazingArea,
            doors: input.doors,
            roofShape: input.roofShape,
            package: input.package,
            additions: [...(input.additions || [])],
            geometry: input.geometry ? JSON.parse(JSON.stringify(input.geometry)) as Record<string, unknown> : undefined,
            rates: { ...input.rates },
        },
        result: {
            low: result.low,
            base: result.base,
            high: result.high,
            confidence: result.confidence,
            sourceEstimateId: result.sourceEstimate.id,
            sourceEstimateNumber: result.sourceEstimate.estimateNumber,
            items: plannedItems.map(item => {
                const { actual: _actual, isActualOnly: _isActualOnly, ...plannedItem } = item;
                return { ...plannedItem };
            }),
            warnings: [...result.warnings],
            scope: (result.scope || []).map(item => ({
                ...item,
                details: [...item.details],
            })),
        },
    };
}
