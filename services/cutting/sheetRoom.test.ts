import { describe, expect, it } from 'vitest';
import { calculateRoomSheetLayout, SHEET_STOCK_PROFILES } from './sheetRoom';

describe('calculateRoomSheetLayout', () => {
    it('uses fixed 2500 x 1250 OSB sheets and chooses the better orientation', () => {
        const layout = calculateRoomSheetLayout(5000, 2500, SHEET_STOCK_PROFILES.osb);

        expect(layout).toEqual(expect.objectContaining({
            sheetLength: 2500,
            sheetWidth: 1250,
            columns: 2,
            rows: 2,
            sheetCount: 4,
            roomAreaM2: 12.5,
            wasteAreaM2: 0,
        }));
    });

    it('uses fixed 1525 x 1525 plywood sheets', () => {
        const layout = calculateRoomSheetLayout(3000, 3000, SHEET_STOCK_PROFILES.plywood);

        expect(layout).toEqual(expect.objectContaining({
            sheetLength: 1525,
            sheetWidth: 1525,
            columns: 2,
            rows: 2,
            sheetCount: 4,
            roomAreaM2: 9,
        }));
    });

    it('returns no layout until both room dimensions are valid', () => {
        expect(calculateRoomSheetLayout(0, 3000, SHEET_STOCK_PROFILES.osb)).toBeNull();
        expect(calculateRoomSheetLayout(3000, Number.NaN, SHEET_STOCK_PROFILES.osb)).toBeNull();
    });
});
