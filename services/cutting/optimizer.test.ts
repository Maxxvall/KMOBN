import { describe, expect, it } from 'vitest';
import { optimizeCuttingPlan } from './optimizer';
import {
    CuttingItem,
    CuttingSettings,
    DEFAULT_CUTTING_SETTINGS,
} from './types';

const settings = (overrides: Partial<CuttingSettings> = {}): CuttingSettings => ({
    ...DEFAULT_CUTTING_SETTINGS,
    ...overrides,
});

const boardItem = (overrides: Partial<CuttingItem> = {}): CuttingItem => ({
    id: 'board-item',
    sourceRow: 2,
    construction: 'Лаги пола',
    section: '45х145',
    length: 1000,
    quantity: 1,
    isSheet: false,
    stage: 'joists',
    ...overrides,
});

const sheetItem = (overrides: Partial<CuttingItem> = {}): CuttingItem => ({
    id: 'sheet-item',
    sourceRow: 2,
    construction: 'Фанера 18мм',
    section: 'Фанера 18мм',
    length: 495,
    width: 495,
    thickness: 18,
    quantity: 1,
    isSheet: true,
    stage: 'subfloor',
    ...overrides,
});

describe('optimizeCuttingPlan board packing', () => {
    it('fills a 6050 mm board exactly when the kerf is included', () => {
        const plan = optimizeCuttingPlan([
            boardItem({ length: 3023, quantity: 2 }),
        ], settings({ boardStockLength: 6050, boardKerf: 4 }));

        expect(plan.boards).toHaveLength(1);
        expect(plan.boards[0].cuts.map(cut => cut.length)).toEqual([3023, 3023]);
        expect(plan.boards[0].usedLength).toBe(6050);
        expect(plan.boards[0].wasteLength).toBe(0);
        expect(plan.totalBoardWastePercentage).toBe(0);
    });

    it('opens another board when the cuts fit only without the kerf', () => {
        const plan = optimizeCuttingPlan([
            boardItem({ length: 3025, quantity: 2 }),
        ], settings({ boardStockLength: 6050, boardKerf: 4 }));

        expect(plan.boards).toHaveLength(2);
        expect(plan.boards.every(board => board.cuts.length === 1)).toBe(true);
    });

    it('mixes construction stages on one board when stage separation is disabled', () => {
        const items = [
            boardItem({ id: 'rostverk', construction: 'Ростверк', stage: 'rostverk', length: 3000 }),
            boardItem({ id: 'walls', construction: 'Стены', stage: 'walls', length: 3000 }),
        ];

        const plan = optimizeCuttingPlan(items, settings({ separateStages: false }));

        expect(plan.boards).toHaveLength(1);
        expect(plan.boards[0].cuts.map(cut => cut.stage)).toEqual(['rostverk', 'walls']);
    });

    it('uses separate boards for construction stages when stage separation is enabled', () => {
        const items = [
            boardItem({ id: 'rostverk', construction: 'Ростверк', stage: 'rostverk', length: 3000 }),
            boardItem({ id: 'walls', construction: 'Стены', stage: 'walls', length: 3000 }),
        ];

        const plan = optimizeCuttingPlan(items, settings({ separateStages: true }));

        expect(plan.boards).toHaveLength(2);
        expect(plan.boards.every(board => new Set(board.cuts.map(cut => cut.stage)).size === 1)).toBe(true);
    });
});

describe('optimizeCuttingPlan sheet packing', () => {
    it('packs four 495 x 495 parts on one 1000 x 1000 sheet with 10 mm kerfs', () => {
        const plan = optimizeCuttingPlan([
            sheetItem({ quantity: 4 }),
        ], settings({ sheetWidth: 1000, sheetHeight: 1000, sheetKerf: 10 }));

        expect(plan.sheets).toHaveLength(1);
        expect(plan.sheets[0].parts).toHaveLength(4);
        expect(plan.sheets[0].usedArea).toBe(980100);
        expect(plan.sheets[0].wasteArea).toBe(19900);
        expect(plan.sheets[0].wastePercentage).toBeCloseTo(1.99);
        expect(plan.sheetPurchase).toEqual([
            expect.objectContaining({
                material: 'Фанера 18мм',
                thickness: 18,
                sheetWidth: 1000,
                sheetHeight: 1000,
                quantity: 1,
            }),
        ]);
    });

    it('rotates a sheet part when that is the only way it fits', () => {
        const plan = optimizeCuttingPlan([
            sheetItem({ length: 300, width: 800 }),
        ], settings({
            sheetWidth: 600,
            sheetHeight: 900,
            allowSheetRotation: true,
        }));

        expect(plan.sheets).toHaveLength(1);
        expect(plan.sheets[0].parts[0]).toEqual(expect.objectContaining({
            width: 300,
            height: 800,
            rotated: true,
        }));
    });

    it('uses independent stock profiles for OSB and plywood in one plan', () => {
        const profiledSettings: CuttingSettings = {
            ...settings({ sheetWidth: 900, sheetHeight: 900 }),
            sheetProfiles: {
                'OSB 12мм': {
                    width: 1250,
                    height: 2800,
                    kerf: 5,
                    allowRotation: false,
                },
                'Фанера 18мм': {
                    width: 1525,
                    height: 1525,
                    kerf: 5,
                    allowRotation: true,
                },
            },
        };
        const items: CuttingItem[] = [
            sheetItem({
                id: 'osb-part',
                construction: 'OSB стены',
                section: 'OSB 12мм',
                length: 2505,
                width: 1200,
                thickness: 12,
                stage: 'walls',
            }),
            sheetItem({
                id: 'plywood-part',
                construction: 'Фанера черновой пол',
                section: 'Фанера 18мм',
                length: 1400,
                width: 1400,
                thickness: 18,
                stage: 'subfloor',
            }),
        ];

        const plan = optimizeCuttingPlan(items, profiledSettings);

        expect(plan.sheets.map(sheet => [sheet.width, sheet.height])).toEqual(expect.arrayContaining([
            [1250, 2800],
            [1525, 1525],
        ]));
        expect(plan.sheets.flatMap(sheet => sheet.parts.map(part => part.itemId)).sort()).toEqual([
            'osb-part',
            'plywood-part',
        ]);
        expect(plan.sheetPurchase).toEqual(expect.arrayContaining([
            expect.objectContaining({ sheetWidth: 1250, sheetHeight: 2800, quantity: 1 }),
            expect.objectContaining({ sheetWidth: 1525, sheetHeight: 1525, quantity: 1 }),
        ]));
    });

    it('groups different construction uses by material section when stage separation is disabled', () => {
        const items = [
            sheetItem({
                id: 'osb-floor',
                construction: 'OSB черновой пол',
                section: 'OSB 12мм',
                stage: 'subfloor',
            }),
            sheetItem({
                id: 'osb-wall',
                construction: 'OSB стены',
                section: 'OSB 12мм',
                stage: 'walls',
            }),
        ];

        const plan = optimizeCuttingPlan(items, settings({
            sheetWidth: 1000,
            sheetHeight: 500,
            sheetKerf: 10,
            separateStages: false,
        }));

        expect(plan.sheets).toHaveLength(1);
        expect(plan.sheets[0].material).toBe('OSB 12мм');
        expect(plan.sheets[0].parts.map(part => part.itemId)).toEqual(['osb-floor', 'osb-wall']);
    });

    it('does not mix stages on one material sheet when stage separation is enabled', () => {
        const items = [
            sheetItem({
                id: 'osb-floor',
                construction: 'OSB черновой пол',
                section: 'OSB 12мм',
                stage: 'subfloor',
            }),
            sheetItem({
                id: 'osb-wall',
                construction: 'OSB стены',
                section: 'OSB 12мм',
                stage: 'walls',
            }),
        ];

        const plan = optimizeCuttingPlan(items, settings({
            sheetWidth: 1000,
            sheetHeight: 500,
            sheetKerf: 10,
            separateStages: true,
        }));

        expect(plan.sheets).toHaveLength(2);
        expect(plan.sheets.every(sheet => new Set(sheet.parts.map(part => part.stage)).size === 1)).toBe(true);
    });
});
