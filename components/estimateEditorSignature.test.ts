import { describe, expect, it } from 'vitest';
import { EstimateCategory, EstimateStatus } from '../types';
import type { Estimate, EstimateItem } from '../types';
import { buildEstimateDirtySignature, buildEstimateItemsSignature } from './estimateEditorSignature';

const item = (overrides: Partial<EstimateItem> = {}): EstimateItem => ({
    id: 'item-1',
    name: 'Монтаж каркаса',
    unit: 'м²',
    quantity: 2,
    price: 500,
    total: 1000,
    category: EstimateCategory.WALLS,
    ...overrides,
});

const estimate = (items: EstimateItem[]): Estimate => ({
    id: 'estimate-1',
    estimateNumber: 'SM-2026-001',
    client: 'Клиент',
    date: '2026-07-13',
    status: EstimateStatus.DRAFT,
    version: 1,
    items,
    total: items.reduce((sum, current) => sum + current.total, 0),
    buildingType: 'Каркасный дом',
    area: 100,
});

describe('buildEstimateDirtySignature', () => {
    const base = estimate([item()]);

    it('is stable for the same content', () => {
        expect(buildEstimateDirtySignature(base)).toBe(buildEstimateDirtySignature(estimate([item()])));
    });

    it('detects section-only reorders, while equivalent legacy snapshots stay clean', () => {
        const original = { ...base, selectedSections: [EstimateCategory.ROOF, EstimateCategory.WALLS] };
        const captured = { ...original, sectionSnapshot: [
            { id: EstimateCategory.WALLS, label: 'Стены', order: 0 },
            { id: EstimateCategory.ROOF, label: 'Кровля/Потолок', order: 1 },
        ] };
        const moved = { ...captured, sectionSnapshot: captured.sectionSnapshot.map(section => ({ ...section, order: 1 - section.order })) };
        expect(buildEstimateDirtySignature(moved)).not.toBe(buildEstimateDirtySignature(captured));
        expect(buildEstimateDirtySignature(original)).toBe(buildEstimateDirtySignature(captured));
        expect(buildEstimateItemsSignature(moved.items)).toBe(buildEstimateItemsSignature(original.items));
    });

    it('changes when plan-fact fields are edited', () => {
        const editedActual = estimate([item({ actual: { unit: 'м²', quantity: 3, price: 500, note: '', source: 'manual' } })]);
        expect(buildEstimateDirtySignature(editedActual)).not.toBe(buildEstimateDirtySignature(base));

        const relinked = estimate([item({ catalogMaterialId: 'mat-9' })]);
        expect(buildEstimateDirtySignature(relinked)).not.toBe(buildEstimateDirtySignature(base));

        const actualOnly = estimate([item({ isActualOnly: true })]);
        expect(buildEstimateDirtySignature(actualOnly)).not.toBe(buildEstimateDirtySignature(base));
    });

    it('changes when the crew tool plan changes', () => {
        const withCrew = {
            ...base,
            crewToolPlan: {
                crewSize: 3,
                requirements: [{ toolKey: 'shurovyort', name: 'Шуруповёрт', quantity: 2, quantityMode: 'crew' as const, source: 'manual' as const }],
                quantityOverrides: {},
            },
        };
        expect(buildEstimateDirtySignature(withCrew)).not.toBe(buildEstimateDirtySignature(base));

        const withOverride = {
            ...withCrew,
            crewToolPlan: { ...withCrew.crewToolPlan, quantityOverrides: { shurovyort: 5 } },
        };
        expect(buildEstimateDirtySignature(withOverride)).not.toBe(buildEstimateDirtySignature(withCrew));
    });

    it('changes when an item total changes even if price stayed the same', () => {
        const retotalled = estimate([item({ total: 1100 })]);
        expect(buildEstimateDirtySignature(retotalled)).not.toBe(buildEstimateDirtySignature(base));
    });
});

describe('buildEstimateItemsSignature', () => {
    it('ignores plan-fact fields that the dirty signature covers', () => {
        const plain = [item()];
        const withActual = [item({ actual: { unit: 'м²', quantity: 3, price: 500, note: '', source: 'manual' } })];

        expect(buildEstimateItemsSignature(plain)).toBe(buildEstimateItemsSignature(withActual));
    });
});
