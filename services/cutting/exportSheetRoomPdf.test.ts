import { describe, expect, it } from 'vitest';
import { createSheetRoomPdfRows } from './exportSheetRoomPdf';

describe('createSheetRoomPdfRows', () => {
    it('keeps only rooms with complete dimensions and uses fixed material formats', () => {
        const rows = createSheetRoomPdfRows([
            { id: 'osb', name: 'Черновой пол', material: 'osb', length: 5000, width: 2500 },
            { id: 'plywood', name: 'Площадка', material: 'plywood', length: 0, width: 2000 },
        ]);

        expect(rows).toHaveLength(1);
        expect(rows[0]).toEqual(expect.objectContaining({
            room: expect.objectContaining({ name: 'Черновой пол' }),
            layout: expect.objectContaining({ sheetLength: 2500, sheetWidth: 1250, sheetCount: 4 }),
        }));
    });
});
