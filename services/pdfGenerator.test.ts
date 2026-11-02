import { beforeEach, describe, expect, it, vi } from 'vitest';
import autoTable from 'jspdf-autotable';
import { EstimateCategory, EstimateStatus, EstimateSubgroup, type Estimate } from '../types';
import { generatePdf } from './pdfGenerator';
import { generatePdfContract } from './pdfContractGenerator';
import { preserveEstimateSectionSnapshot, setEstimateSectionOrder } from './estimateSections';

vi.mock('jspdf-autotable', () => ({ default: vi.fn() }));
vi.mock('./pdfUtils', () => ({
    PDF_FONT_NAME: 'helvetica',
    loadPdfResources: async () => ({ fontBase64: null, logoBase64: null }),
    registerPdfFont: vi.fn(),
}));
vi.mock('jspdf', async () => {
    const actual = await vi.importActual<typeof import('jspdf')>('jspdf');
    return { ...actual, jsPDF: vi.fn(function () {
        const doc = new actual.jsPDF();
        doc.save = vi.fn();
        return doc;
    }) };
});

const fixture = (): Estimate => ({
    id: 'pdf-order', estimateNumber: 'ORDER', client: '', date: '2026-11-02',
    status: EstimateStatus.DRAFT, version: 1, buildingType: '', area: 10, total: 90,
    selectedSections: [EstimateCategory.LOGISTICS],
    items: [
        { id: 'walls', name: 'Wall row', category: EstimateCategory.WALLS, subgroup: EstimateSubgroup.WORKS, unit: 'шт', quantity: 2, price: 15, total: 30 },
        { id: 'roof', name: 'Roof row', category: EstimateCategory.ROOF, subgroup: EstimateSubgroup.MATERIALS, unit: 'шт', quantity: 3, price: 20, total: 60 },
    ],
});

beforeEach(() => vi.clearAllMocks());

describe('estimate PDF table order', () => {
    for (const [name, generate] of [
        ['plain', (estimate: Estimate) => generatePdf(estimate)],
        ['contract', (estimate: Estimate) => generatePdfContract(estimate, 'Проверка')],
    ] as const) {
        it(`${name} follows the saved snapshot and keeps totals, rows and empty-section policy`, async () => {
            const original = fixture();
            const moved = setEstimateSectionOrder(original, [EstimateCategory.ROOF, EstimateCategory.LOGISTICS, EstimateCategory.WALLS]);
            const reopened = JSON.parse(JSON.stringify({ ...moved, sectionSnapshot: preserveEstimateSectionSnapshot(moved) })) as Estimate;
            await generate(reopened);
            const body = vi.mocked(autoTable).mock.calls[0][1]!.body! as unknown[][];
            const text = JSON.stringify(body);
            expect(text.indexOf('Roof row')).toBeLessThan(text.indexOf('Wall row'));
            expect(text).not.toContain('Логистика');
            const itemRows = body.filter(row => typeof row[0] === 'string' && ['Roof row', 'Wall row'].includes(row[0]));
            expect(itemRows.map(row => row[2])).toEqual(['3', '2']);
            expect(itemRows.map(row => String(row[4]).replace(/\s/g, ''))).toEqual(['60₽', '30₽']);
            expect(reopened.total).toBe(90);
            expect(original.items.map(row => row.id)).toEqual(['walls', 'roof']);
        });
    }
});
