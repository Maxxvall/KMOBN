// Deterministic benchmarks for the confirmed editor/calculator/history hot
// spots. These measure pure computations, not real UI rendering; the report
// labels them accordingly.
import { bench, describe } from 'vitest';
import { EstimateCategory, EstimateStatus, EstimateSubgroup, type Estimate, type EstimateItem, type Material, type Work } from '../types';
import { checkMaterialPrice } from './estimatePricing';
import { buildEstimateDirtySignature } from '../components/estimateEditorSignature';
import { preserveEstimateSectionSnapshot } from './estimateSections';
import { calculateHouseVariants, type HouseCalculatorInput } from './houseCalculator';

const normalizeKey = (value: string): string => value.trim().toLowerCase();

const CATALOG_SIZE = 1000;
const ESTIMATE_ITEMS = 300;
const HISTORY_ESTIMATES = 300;
const HISTORY_GROUPS = 50;

const materialName = (index: number): string => `Материал №${index} обрезная сосна`;
const itemName = (index: number): string => index % 2 === 0 ? `Материал №${index} Обрезная Сосна` : `Материал №${index} отсутствует в каталоге`;

const materials: Material[] = Array.from({ length: CATALOG_SIZE }, (_, index) => ({
    id: `mat-${index}`,
    name: materialName(index),
    price: 100 + (index % 50),
    lastUpdated: '2026-07-01T00:00:00.000Z',
    category: EstimateCategory.WALLS,
}));

const works: Work[] = Array.from({ length: CATALOG_SIZE }, (_, index) => ({
    id: `work-${index}`,
    name: `Работа №${index} монтаж каркаса`,
    unit: 'м²',
    price: 200 + (index % 50),
    category: EstimateCategory.WALLS,
}));

const estimateItems: EstimateItem[] = Array.from({ length: ESTIMATE_ITEMS }, (_, index) => ({
    id: `item-${index}`,
    name: itemName(index),
    unit: 'м²',
    quantity: 2,
    price: 150,
    total: 300,
    category: EstimateCategory.WALLS,
    subgroup: index % 2 === 0 ? EstimateSubgroup.MATERIALS : EstimateSubgroup.WORKS,
}));

const historyEstimates: Estimate[] = Array.from({ length: HISTORY_ESTIMATES }, (_, index) => {
    const group = index % HISTORY_GROUPS;
    return {
        id: `est-${index}`,
        estimateNumber: `SM-2026-${String(group).padStart(3, '0')}`,
        client: `Клиент ${group}`,
        date: `2026-07-${String((index % 28) + 1).padStart(2, '0')}`,
        status: EstimateStatus.DRAFT,
        version: Math.floor(index / HISTORY_GROUPS) + 1,
        items: [],
        total: 1000 + index,
        buildingType: 'Каркасный дом',
        area: 100,
    };
});

// ─── Editor catalog scanning ────────────────────────────────────────────────

describe('editor catalog scanning (300 items x 1000 catalog entries)', () => {
    bench('current: per-item .some scans + checkMaterialPrice filter', () => {
        for (const item of estimateItems) {
            const workExists = works.some(work => normalizeKey(work.name) === normalizeKey(item.name));
            const useTypeahead = !workExists;
            const priceCheck = item.subgroup === EstimateSubgroup.MATERIALS ? checkMaterialPrice(item, materials) : null;
            const materialExists = materials.some(material => normalizeKey(material.name) === normalizeKey(item.name));
            if (useTypeahead && materialExists && priceCheck) void item;
        }
    });

    bench('indexed: Map lookups over prebuilt indices', () => {
        // Indices are built once per catalog change (useMemo), not per item.
        const materialKeyIndex = new Map<string, Material[]>();
        for (const material of materials) {
            const key = normalizeKey(material.name);
            const bucket = materialKeyIndex.get(key);
            if (bucket) bucket.push(material); else materialKeyIndex.set(key, [material]);
        }
        const workKeySet = new Set<string>();
        for (const work of works) workKeySet.add(normalizeKey(work.name));

        for (const item of estimateItems) {
            const key = normalizeKey(item.name);
            const workExists = workKeySet.has(key);
            const useTypeahead = !workExists;
            const matches = materialKeyIndex.get(key) ?? [];
            const priceCheck = item.subgroup === EstimateSubgroup.MATERIALS ? checkMaterialPrice(item, matches) : null;
            if (useTypeahead && matches.length > 0 && priceCheck) void item;
        }
    });
});

// ─── Dirty signature and draft mirroring ────────────────────────────────────

const draftEstimate: Estimate = {
    id: 'draft',
    estimateNumber: 'SM-2026-999',
    client: 'Клиент',
    date: '2026-07-13',
    status: EstimateStatus.DRAFT,
    version: 1,
    items: estimateItems,
    total: 90000,
    buildingType: 'Каркасный дом',
    area: 120,
    selectedSections: [EstimateCategory.WALLS, EstimateCategory.FOUNDATION],
};

describe('dirty signature (300 items)', () => {
    bench('buildEstimateDirtySignature', () => {
        buildEstimateDirtySignature(draftEstimate);
    });

    bench('preserveEstimateSectionSnapshot', () => {
        preserveEstimateSectionSnapshot(draftEstimate, null);
    });
});

// ─── House calculator ───────────────────────────────────────────────────────

const historyForCalculator = Array.from({ length: 6 }, (_, index) => ({
    ...historyEstimates[index],
    items: estimateItems.slice(0, 50),
    status: EstimateStatus.APPROVED,
}));

const calculatorInput: HouseCalculatorInput = {
    estimates: historyForCalculator,
    area: 120,
    floors: 1,
    glazingArea: 8,
    doors: 4,
    roofShape: 'gable' as const,
    package: 'warm-shell' as const,
    additions: [],
    rates: { overheadPercent: 10, marginPercent: 15, reservePercent: 5, discountPercent: 0, taxPercent: 0 },
};

describe('house calculator (6 sources x 50 items)', () => {
    bench('calculateHouseVariants', () => {
        calculateHouseVariants(calculatorInput);
    });
});

// ─── Estimate history grouping ──────────────────────────────────────────────

describe('estimate history (300 estimates, 50 groups)', () => {
    bench('current: per-row filter over the full list', () => {
        for (const estimate of historyEstimates) {
            const groupKey = estimate.estimateNumber;
            void allEstimatesList_filter(historyEstimates, groupKey).sort((a, b) => b.version - a.version);
        }
    });

    bench('indexed: one pass groupBy', () => {
        const groups = new Map<string, Estimate[]>();
        for (const estimate of historyEstimates) {
            const bucket = groups.get(estimate.estimateNumber);
            if (bucket) bucket.push(estimate); else groups.set(estimate.estimateNumber, [estimate]);
        }
        for (const estimate of historyEstimates) {
            void (groups.get(estimate.estimateNumber) ?? []).sort((a, b) => b.version - a.version);
        }
    });
});

const allEstimatesList_filter = (list: Estimate[], groupKey: string): Estimate[] =>
    list.filter(e => e.estimateNumber === groupKey);
