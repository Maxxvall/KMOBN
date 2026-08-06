import { describe, expect, it } from 'vitest';
import {
    calculateHouseEstimate,
    calculateHouseVariants,
    chooseHouseReference,
    createAiHouseEstimateResult,
    HouseCalculatorInput,
    parseHouseDescription,
    selectEligibleHouseHistory,
    selectHouseHistoryForAi,
    selectLatestVersions,
} from './houseCalculator';
import {
    Estimate,
    EstimateCategory,
    EstimateItem,
    EstimateStatus,
    EstimateSubgroup,
} from '../types';

const NOW = new Date('2026-07-12T12:00:00.000Z');

const item = (overrides: Partial<EstimateItem> = {}): EstimateItem => ({
    id: 'item-1',
    name: 'Пиломатериал каркаса',
    unit: 'шт',
    quantity: 1,
    price: 100,
    total: 100,
    category: EstimateCategory.WALLS,
    subgroup: EstimateSubgroup.MATERIALS,
    ...overrides,
});

const estimate = (overrides: Partial<Estimate> = {}): Estimate => ({
    id: 'estimate-1',
    estimateNumber: 'КМ-1',
    client: 'Иванов',
    date: '2026-06-01',
    updated_at: '2026-06-01T12:00:00.000Z',
    status: EstimateStatus.APPROVED,
    version: 1,
    items: [item()],
    total: 100,
    buildingType: 'Каркасный жилой дом',
    area: 79,
    ...overrides,
});

const input = (overrides: Partial<HouseCalculatorInput> = {}): HouseCalculatorInput => ({
    estimates: [estimate()],
    area: 79,
    floors: 1,
    glazingArea: 0,
    doors: 4,
    roofShape: 'gable',
    package: 'warm-shell',
    rates: {
        overheadPercent: 0,
        marginPercent: 0,
        reservePercent: 0,
        taxPercent: 0,
        discountPercent: 0,
    },
    now: NOW,
    ...overrides,
});

describe('houseCalculator history selection', () => {
    it('keeps only the latest estimate version', () => {
        const v1 = estimate({ id: 'v1', version: 1, updated_at: '2026-05-01T00:00:00Z' });
        const v2 = estimate({ id: 'v2', version: 2, updated_at: '2026-06-01T00:00:00Z' });

        expect(selectLatestVersions([v2, v1])).toEqual([v2]);
    });

    it('includes all approved estimates regardless of year', () => {
        const current = estimate({ id: 'current', estimateNumber: 'КМ-2026', date: '2026-01-01', updated_at: null });
        const previous = estimate({ id: 'previous', estimateNumber: 'КМ-2025', date: '2025-12-31', updated_at: null });

        expect(selectEligibleHouseHistory([previous, current], NOW).map(value => value.id)).toEqual(['previous', 'current']);
    });

    it('keeps every approved estimate even when they share one estimate number', () => {
        const approvedV1 = estimate({ id: 'approved-v1', estimateNumber: 'KM-shared', version: 1 });
        const approvedV2 = estimate({ id: 'approved-v2', estimateNumber: 'KM-shared', version: 2 });

        expect(selectEligibleHouseHistory([approvedV1, approvedV2], NOW)).toHaveLength(2);
    });

    it('includes drafts from the last 90 days and excludes older drafts', () => {
        const recent = estimate({ id: 'recent', estimateNumber: 'Ч-1', status: EstimateStatus.DRAFT, date: '2026-04-14', updated_at: null });
        const old = estimate({ id: 'old', estimateNumber: 'Ч-2', status: EstimateStatus.DRAFT, date: '2026-04-13', updated_at: null });

        expect(selectEligibleHouseHistory([old, recent], NOW).map(value => value.id)).toEqual(['recent']);
    });

    it('excludes archived estimates', () => {
        const byFlag = estimate({ id: 'flag', estimateNumber: 'А-1', isArchived: true });

        expect(selectEligibleHouseHistory([byFlag], NOW)).toEqual([]);
    });

    it('excludes archived estimates from AI history as well', () => {
        const current = estimate({ id: 'current', estimateNumber: 'А-1' });
        const archived = estimate({ id: 'archived', estimateNumber: 'А-2', isArchived: true });

        expect(selectHouseHistoryForAi([archived, current]).map(value => value.id)).toEqual(['current']);
    });

    it('counts generic frame house estimates and fresh frame drafts separately', () => {
        const approvedGeneric = estimate({
            id: 'approved-generic',
            estimateNumber: 'KM-generic',
            buildingType: 'Дом',
            items: [item({ name: 'Монтаж силового каркаса стен' })],
        });
        const approvedReference = estimate({ id: 'approved-reference', estimateNumber: 'KM-reference' });
        const freshDraft = estimate({
            id: 'fresh-draft',
            estimateNumber: 'KM-draft',
            status: EstimateStatus.DRAFT,
            items: [item({ name: 'Монтаж ростверка из пакета досок' }), item({ name: 'Монтаж лаг пола' })],
        });

        const selected = selectEligibleHouseHistory([approvedGeneric, approvedReference, freshDraft], NOW);

        expect(selected.filter(value => value.status === EstimateStatus.APPROVED)).toHaveLength(2);
        expect(selected.filter(value => value.status === EstimateStatus.DRAFT)).toHaveLength(1);
    });

    it('accepts a generic house without frame keywords because the company builds only frame houses', () => {
        const genericHouse = estimate({
            id: 'generic-house',
            estimateNumber: 'KM-house',
            buildingType: 'Дом',
            items: [item({ name: 'Комплект материалов стен' })],
        });

        expect(selectEligibleHouseHistory([genericHouse], NOW)).toHaveLength(1);
    });

    it('extracts area and turnkey package from client wishes', () => {
        expect(parseHouseDescription('Нужен дом под ключ 100 кв.м')).toEqual({ area: 100, package: 'turnkey' });
        expect(parseHouseDescription('Дом 120 м² под ключ со всей инженерией')).toEqual({ area: 120, package: 'turnkey-engineering' });
        expect(parseHouseDescription('Премиум 140 м²')).toEqual({ area: 140, package: 'turnkey-engineering' });
        expect(parseHouseDescription('Оптимальный дом')).toEqual({ package: 'rough-finish' });
        expect(parseHouseDescription('Тёплый контур')).toEqual({ package: 'warm-shell' });
    });

    it('calculates economy, optimal, and premium variants in one pass', () => {
        const variants = calculateHouseVariants(input());

        expect(variants.map(variant => variant.tier)).toEqual(['economy', 'optimal', 'premium']);
        expect(variants.map(variant => variant.result.base).every(value => value > 0)).toBe(true);
    });

    it('adds confirmed finishing and engineering positions from other house estimates to the relevant variants', () => {
        const base = estimate({
            id: 'base',
            estimateNumber: 'КМ-БАЗА',
            client: 'Наталья_Дубровка',
            buildingType: 'Одноэтажный дачный дом',
            items: [item({ id: 'frame', total: 1_000 })],
        });
        const fullScope = estimate({
            id: 'full-scope',
            estimateNumber: 'КМ-ПОД-КЛЮЧ',
            area: 79,
            items: [
                item({ id: 'rough', name: 'Монтаж ГКЛ', total: 200 }),
                item({ id: 'finish', name: 'Укладка ламината', total: 300 }),
                item({ id: 'engineering', name: 'Электрика под ключ', total: 400, category: EstimateCategory.ELECTRICAL }),
            ],
        });

        const variants = calculateHouseVariants(input({ estimates: [base, fullScope] }));

        expect(variants.map(variant => variant.result.base)).toEqual([1_000, 1_200, 1_900]);
        expect(variants[2].result.warnings.join(' ')).toContain('КМ-ПОД-КЛЮЧ');
    });
});

describe('houseCalculator reference and packages', () => {
    it('prefers the explicit approved Наталья_Дубровка 79 м² reference', () => {
        const closer = estimate({ id: 'closer', estimateNumber: 'КМ-2', area: 80 });
        const natalia = estimate({
            id: 'natalia',
            estimateNumber: 'КМ-3',
            client: 'Наталья_Дубровка',
            buildingType: 'Одноэтажный дачный дом',
            area: 79,
        });

        expect(chooseHouseReference([closer, natalia], 80)?.id).toBe('natalia');
        expect(calculateHouseEstimate(input({ estimates: [closer, natalia] })).evidence.referenceMatched).toBe(true);
    });

    it('prioritizes matching explanation keywords before area within the same status', () => {
        const closer = estimate({ id: 'closer', estimateNumber: 'КМ-БЛИЖЕ', area: 80 });
        const matching = estimate({
            id: 'matching',
            estimateNumber: 'КМ-ПРЕМИУМ',
            area: 120,
            explanation: 'Дом под ключ, премиум',
        });

        expect(chooseHouseReference([closer, matching], 80, 'turnkey-engineering')?.id).toBe('matching');
    });

    it('does not let a matching draft outrank an approved estimate', () => {
        const approved = estimate({ id: 'approved', estimateNumber: 'КМ-СОГЛАСОВАНА', area: 120 });
        const draft = estimate({
            id: 'draft',
            estimateNumber: 'КМ-ЧЕРНОВИК',
            status: EstimateStatus.DRAFT,
            area: 80,
            explanation: 'Тёплый контур',
        });

        expect(chooseHouseReference([draft, approved], 80, 'warm-shell')?.id).toBe('approved');
    });

    it('preserves source totals when target and source areas are equal', () => {
        const source = estimate({
            items: [item({ id: 'a', total: 100 }), item({ id: 'b', quantity: 2, price: 75, total: 150 })],
            total: 250,
        });

        const result = calculateHouseEstimate(input({ estimates: [source], area: 79 }));

        expect(result.items.reduce((total, value) => total + value.total, 0)).toBe(250);
    });

    it('excludes glazing and doors from box, but includes doors in warm shell', () => {
        const source = estimate({
            items: [
                item({ id: 'wall' }),
                item({ id: 'window', name: 'Окна ПВХ', category: EstimateCategory.WINDOWS }),
                item({ id: 'door', name: 'Входная дверь', category: EstimateCategory.WINDOWS }),
            ],
        });

        const box = calculateHouseEstimate(input({ estimates: [source], package: 'box' }));
        const warm = calculateHouseEstimate(input({ estimates: [source], package: 'warm-shell' }));

        expect(box.items.map(value => value.name)).toEqual(['Пиломатериал каркаса']);
        expect(warm.items.map(value => value.name)).toEqual(['Пиломатериал каркаса', 'Входная дверь']);
    });

    it('prices glazing by area at market material and installation rates', () => {
        const result = calculateHouseEstimate(input({
            estimates: [estimate({ items: [item({ total: 100 })] })],
            glazingArea: 12.5,
        }));

        expect(result.items.filter(value => value.category === EstimateCategory.WINDOWS)).toMatchObject([
            { name: 'Остекление', unit: 'м²', quantity: 12.5, price: 14_000, total: 175_000 },
            { name: 'Монтаж остекления', unit: 'м²', quantity: 12.5, price: 2_000, total: 25_000 },
        ]);
        expect(result.base).toBe(200_100);
    });

    it('scales exterior and interior doors by their own source quantities', () => {
        const source = estimate({
            items: [
                item({ id: 'frame', total: 100 }),
                item({ id: 'interior', name: 'Межкомнатная дверь с монтажом', quantity: 4, price: 35_000, total: 140_000, category: EstimateCategory.WINDOWS }),
                item({ id: 'exterior', name: 'Входная дверь с монтажом', quantity: 1, price: 45_000, total: 45_000, category: EstimateCategory.WINDOWS }),
            ],
        });

        const result = calculateHouseEstimate(input({
            estimates: [source],
            interiorDoors: 5,
            exteriorDoors: 1,
            doors: 6,
        }));

        expect(result.items.find(value => value.id.includes('interior'))?.total).toBe(175_000);
        expect(result.items.find(value => value.id.includes('exterior'))?.total).toBe(45_000);
    });
});

describe('houseCalculator financials and failures', () => {
    it('builds an AI fallback result only from priced catalog items and approved sources', () => {
        const source = estimate({ id: 'approved-source', estimateNumber: 'AI-source' });
        const result = createAiHouseEstimateResult(
            input({ estimates: [source] }),
            [item({ total: 250, price: 250 })],
            [source],
        );

        expect(result.base).toBe(250);
        expect(result.evidence.approvedCount).toBe(1);
        expect(result.evidence.sourceReason).toContain('AI');
    });

    it('separates direct costs and applies overhead, margin, reserve, discount, and tax', () => {
        const source = estimate({
            items: [
                item({ id: 'material', total: 100 }),
                item({ id: 'work', name: 'Монтаж каркаса', quantity: 1, price: 50, total: 50, subgroup: EstimateSubgroup.WORKS }),
                item({ id: 'delivery', name: 'Доставка', quantity: 1, price: 20, total: 20, category: EstimateCategory.LOGISTICS, subgroup: EstimateSubgroup.DELIVERY }),
                item({ id: 'equipment', name: 'Аренда крана', quantity: 1, price: 30, total: 30 }),
            ],
        });

        const result = calculateHouseEstimate(input({
            estimates: [source],
            rates: { overheadPercent: 10, marginPercent: 10, reservePercent: 5, discountPercent: 10, taxPercent: 20 },
        }));

        expect(result.financials).toEqual({
            materials: 100,
            works: 50,
            logistics: 20,
            equipment: 30,
            overhead: 20,
            margin: 22,
            reserve: 11,
            discount: 25.3,
            tax: 45.54,
            final: 273.24,
        });
        expect(result.base).toBe(273.24);
    });

    it.each([
        { area: 0 },
        { floors: 0 },
        { glazingArea: -1 },
        { doors: -1 },
    ])('rejects invalid dimensions: %o', invalid => {
        expect(() => calculateHouseEstimate(input(invalid))).toThrow();
    });

    it('throws when no eligible source estimate exists', () => {
        expect(() => calculateHouseEstimate(input({ estimates: [] }))).toThrow(/нет согласованных смет с позициями/);
    });

    it('warns when requested finish and engineering are absent from the source', () => {
        const result = calculateHouseEstimate(input({ package: 'turnkey-engineering' }));

        expect(result.warnings.some(value => value.includes('черновой отделки'))).toBe(true);
        expect(result.warnings.some(value => value.includes('инженерных систем'))).toBe(true);
    });

    it('preserves a manually adjusted approved line total at the reference dimensions', () => {
        const source = estimate({
            total: 250,
            items: [item({ quantity: 2, price: 100, total: 250 })],
        });

        const result = calculateHouseEstimate(input({ estimates: [source], area: 79 }));

        expect(result.items[0].total).toBe(250);
        expect(result.items[0].price).toBe(125);
    });

    it('accepts a generic house when the estimate itself confirms a frame construction', () => {
        const genericHouse = estimate({
            buildingType: 'Дом',
            items: [
                item({ name: 'Монтаж ростверка из пакета досок' }),
                item({ name: 'Монтаж силового каркаса стен' }),
            ],
        });

        expect(selectEligibleHouseHistory([genericHouse], NOW)).toHaveLength(1);
    });
});
