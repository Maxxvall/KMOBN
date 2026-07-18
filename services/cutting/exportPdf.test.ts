import { describe, expect, it } from 'vitest';
import { createCuttingPdfQueueRows, createCuttingPdfStageGroups } from './exportPdf';
import { CuttingItem } from './types';

const item = (overrides: Partial<CuttingItem>): CuttingItem => ({
    id: 'item',
    sourceRow: 2,
    construction: 'Стойка стены',
    section: '45х95',
    length: 2200,
    quantity: 4,
    isSheet: false,
    stage: 'walls',
    ...overrides,
});

describe('createCuttingPdfQueueRows', () => {
    it('keeps stage ordering but omits stage and internal board references from columns', () => {
        const rows = createCuttingPdfQueueRows([
            item({ id: 'wall', construction: 'Стойка стены', stage: 'walls' }),
            item({ id: 'rostverk', construction: 'Ростверк', section: '45х145', length: 5100, quantity: 2, stage: 'rostverk' }),
        ]);

        expect(rows).toEqual([
            ['Ростверк', '45х145', '5100', '2'],
            ['Стойка стены', '45х95', '2200', '4'],
        ]);
        expect(rows.every(row => row.length === 4)).toBe(true);
    });

    it('groups rows by construction order and includes a total quantity in each block heading', () => {
        const groups = createCuttingPdfStageGroups([
            item({ id: 'walls', construction: 'Стойка стены', quantity: 4, stage: 'walls' }),
            item({ id: 'rostverk', construction: 'Ростверк', quantity: 2, stage: 'rostverk' }),
            item({ id: 'wall-bridge', construction: 'Бридж стены', quantity: 6, stage: 'walls' }),
        ]);

        expect(groups.map(group => [group.label, group.totalQuantity])).toEqual([
            ['Ростверк', 2],
            ['Стены', 10],
        ]);
        expect(groups.every(group => group.rows.every(row => row.length === 4))).toBe(true);
    });
});
