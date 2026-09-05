import { describe, expect, it } from 'vitest';
import {
    ESTIMATE_CATEGORIES,
    EstimateCategory,
    EstimateSubgroup,
    type EstimateItem,
} from '../types';
import {
    CATALOG_CATEGORIES,
    getEstimateCategories,
    getSectionLabel,
    getSectionSubgroups,
    normalizeEstimateCategory,
} from './estimateSections';

const item = (category: EstimateCategory, subgroup?: EstimateSubgroup): EstimateItem => ({
    id: `item-${category}-${subgroup ?? 'default'}`,
    name: 'Позиция',
    unit: 'шт',
    quantity: 1,
    price: 100,
    total: 100,
    category,
    subgroup,
});

describe('estimate section registry', () => {
    it('offers engineering sections in estimate order and keeps GENERAL catalog-only', () => {
        expect(ESTIMATE_CATEGORIES).toContain(EstimateCategory.WATER_SUPPLY);
        expect(ESTIMATE_CATEGORIES).toContain(EstimateCategory.SEWERAGE);
        expect(ESTIMATE_CATEGORIES).not.toContain(EstimateCategory.GENERAL);
        expect(CATALOG_CATEGORIES).toContain(EstimateCategory.GENERAL);
        expect(ESTIMATE_CATEGORIES.indexOf(EstimateCategory.WATER_SUPPLY))
            .toBeLessThan(ESTIMATE_CATEGORIES.indexOf(EstimateCategory.SEWERAGE));
    });

    it('normalizes water and sewer AI aliases through the shared registry', () => {
        expect(normalizeEstimateCategory('Монтаж ХВС и ГВС')).toBe(EstimateCategory.WATER_SUPPLY);
        expect(normalizeEstimateCategory('Наружная канализация и септик')).toBe(EstimateCategory.SEWERAGE);
        expect(normalizeEstimateCategory('Отведение сточных вод')).toBe(EstimateCategory.SEWERAGE);
        expect(normalizeEstimateCategory('Монтаж водосточной системы')).toBe(EstimateCategory.ROOF);
        expect(normalizeEstimateCategory(EstimateCategory.SEWERAGE)).toBe(EstimateCategory.SEWERAGE);
        expect(normalizeEstimateCategory('неизвестная категория')).toBeNull();
    });

    it('keeps empty selected, legacy GENERAL, and unknown persisted sections visible', () => {
        const futureSection = 'БУДУЩИЙ РАЗДЕЛ' as EstimateCategory;
        const categories = getEstimateCategories(
            [item(EstimateCategory.GENERAL), item(futureSection)],
            [EstimateCategory.SEWERAGE],
        );

        expect(categories).toEqual([
            EstimateCategory.SEWERAGE,
            EstimateCategory.GENERAL,
            futureSection,
        ]);
        expect(getSectionLabel(futureSection)).toBe(futureSection);
    });

    it('shows persisted subgroups in addition to registry defaults', () => {
        expect(getSectionSubgroups(EstimateCategory.LOGISTICS, [item(EstimateCategory.LOGISTICS, EstimateSubgroup.MATERIALS)]))
            .toEqual([EstimateSubgroup.WORKS, EstimateSubgroup.DELIVERY, EstimateSubgroup.MATERIALS]);
    });
});
