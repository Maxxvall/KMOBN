import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    Estimate,
    EstimateCategory,
    EstimateStatus,
    EstimateSubgroup,
} from '../types';
import {
    buildPremiumEstimateModel,
    createPremiumEstimatePdf,
    PREMIUM_PDF_LINKS,
    premiumEstimateFileName,
    safeItemTotal,
    sanitizePremiumPdfFileName,
} from './premiumPdf';

const makeEstimate = (itemCount = 3): Estimate => {
    const categories = [
        EstimateCategory.FOUNDATION,
        EstimateCategory.WALLS,
        EstimateCategory.ROOF,
        EstimateCategory.LOGISTICS,
    ];
    const subgroups = [
        EstimateSubgroup.WORKS,
        EstimateSubgroup.MATERIALS,
        EstimateSubgroup.DELIVERY,
    ];
    const items = Array.from({ length: itemCount }, (_, index) => {
        const quantity = index % 4 === 0 ? 12.75 : index + 1;
        const price = 1_250 + index * 137;
        return {
            id: `item-${index}`,
            name: index % 5 === 0
                ? `Монтаж конструкций с очень длинным наименованием, подготовкой основания и проверкой геометрии, позиция ${index + 1}`
                : `Позиция сметы ${index + 1}`,
            unit: index % 2 === 0 ? 'м²' : 'шт.',
            quantity,
            price,
            total: quantity * price,
            category: categories[index % categories.length],
            subgroup: subgroups[index % subgroups.length],
        };
    });
    const total = items.reduce((sum, item) => sum + item.total, 0);

    return {
        id: 'premium-estimate',
        estimateNumber: 'КМ 2026/071',
        client: 'Александр Сергеевич с длинным наименованием организации заказчика',
        date: '2026-07-25',
        status: EstimateStatus.APPROVED,
        version: 1,
        items,
        total,
        buildingType: 'Каркасный жилой дом для круглогодичного проживания с террасой',
        area: 128.5,
    };
};

describe('premium PDF model', () => {
    it('preserves a legitimate zero item total', () => {
        const item = makeEstimate(1).items[0];
        item.total = 0;

        expect(safeItemTotal(item)).toBe(0);
    });

    it('includes categories outside the primary display order', () => {
        const estimate = makeEstimate(1);
        estimate.items[0].category = EstimateCategory.GENERAL;

        const model = buildPremiumEstimateModel(estimate);

        expect(model.sections.map(section => section.category)).toContain(EstimateCategory.GENERAL);
        expect(model.calculatedTotal).toBe(estimate.items[0].total);
    });

    it('includes water, sewer, and a future category in a stable section order', () => {
        const estimate = makeEstimate(3);
        const futureSection = 'БУДУЩИЙ РАЗДЕЛ' as EstimateCategory;
        estimate.items[0].category = EstimateCategory.SEWERAGE;
        estimate.items[1].category = futureSection;
        estimate.items[2].category = EstimateCategory.WATER_SUPPLY;

        const model = buildPremiumEstimateModel(estimate);

        expect(model.sections.map(section => section.category)).toEqual([
            EstimateCategory.WATER_SUPPLY,
            EstimateCategory.SEWERAGE,
            futureSection,
        ]);
        expect(model.calculatedTotal).toBeCloseTo(estimate.total);
    });

    it('calculates the client breakdown from all estimate items', () => {
        const estimate = makeEstimate(12);
        const model = buildPremiumEstimateModel(estimate);

        expect(model.worksTotal + model.materialsTotal + model.deliveryTotal).toBeCloseTo(estimate.total);
        expect(model.total).toBe(estimate.total);
    });

    it('sanitizes Windows file names without losing the client identity', () => {
        expect(sanitizePremiumPdfFileName('Иванов: дом / этап 1')).toBe('Иванов_ дом _ этап 1');
        expect(premiumEstimateFileName(makeEstimate(1))).toMatch(/^Смета_КМ_2026_071_Александр_Сергеевич/);
    });
});

describe('premium PDF document', () => {
    it('keeps a one-position estimate compact', () => {
        const doc = createPremiumEstimatePdf(makeEstimate(1), { fontBase64: null, boldFontBase64: null });

        expect(doc.getNumberOfPages()).toBe(1);
    });

    it('creates multiple pages and embeds clickable contact links', () => {
        const estimate = makeEstimate(84);
        const doc = createPremiumEstimatePdf(estimate, { fontBase64: null, boldFontBase64: null });
        const rawPdf = doc.output();

        expect(doc.getNumberOfPages()).toBeGreaterThan(2);
        Object.values(PREMIUM_PDF_LINKS).forEach(link => expect(rawPdf).toContain(link));
        expect(PREMIUM_PDF_LINKS.max).toBe('https://web.max.ru/399106591');
        expect(PREMIUM_PDF_LINKS).not.toHaveProperty('whatsapp');
        expect(rawPdf).not.toContain('wa.me');
    });

    it('makes a catalog material name clickable when the material has a link', () => {
        const estimate = makeEstimate(1);
        estimate.items[0].subgroup = EstimateSubgroup.MATERIALS;
        estimate.items[0].catalogMaterialId = 'catalog-material';

        const doc = createPremiumEstimatePdf(
            estimate,
            { fontBase64: null, boldFontBase64: null },
            { materials: [{ id: 'catalog-material', link: 'shop.example/material/42' }] },
        );

        expect(doc.output()).toContain('https://shop.example/material/42');
    });

    it('does not embed a catalog link for a non-material estimate row', () => {
        const estimate = makeEstimate(1);
        estimate.items[0].subgroup = EstimateSubgroup.WORKS;
        estimate.items[0].catalogMaterialId = 'catalog-material';

        const doc = createPremiumEstimatePdf(
            estimate,
            { fontBase64: null, boldFontBase64: null },
            { materials: [{ id: 'catalog-material', link: 'https://shop.example/material/42' }] },
        );

        expect(doc.output()).not.toContain('https://shop.example/material/42');
    });

    it('splits a pathological item name without hanging or clipping the remaining document', () => {
        const estimate = makeEstimate(1);
        estimate.items[0].name = Array.from({ length: 180 }, (_, index) => `длинный-фрагмент-${index + 1}`).join(' ');
        const doc = createPremiumEstimatePdf(estimate, { fontBase64: null, boldFontBase64: null });

        expect(doc.getNumberOfPages()).toBe(3);
    });

    it('keeps a long unit and a large quantity inside their table columns', () => {
        const estimate = makeEstimate(1);
        estimate.items[0].unit = 'комплект на рабочую смену';
        estimate.items[0].quantity = 1_234_567_890.75;
        estimate.items[0].total = estimate.items[0].quantity * estimate.items[0].price;
        estimate.total = estimate.items[0].total;
        const doc = createPremiumEstimatePdf(estimate, { fontBase64: null, boldFontBase64: null });

        expect(doc.getNumberOfPages()).toBe(1);
    });


    it('can write a long visual fixture when requested', () => {
        if (process.env.PREMIUM_PDF_FIXTURE !== '1') return;

        const regularFont = readFileSync(path.resolve('assets/LiberationSans-Regular.ttf')).toString('base64');
        const boldFont = readFileSync(path.resolve('assets/LiberationSans-Bold.ttf')).toString('base64');
        const linkedEstimate = makeEstimate(84);
        linkedEstimate.items[1].catalogMaterialId = 'fixture-material';
        const doc = createPremiumEstimatePdf(
            linkedEstimate,
            { fontBase64: regularFont, boldFontBase64: boldFont },
            { materials: [{ id: 'fixture-material', link: 'https://shop.example/material/42' }] },
        );
        const outputDir = path.resolve('tmp/pdfs');
        mkdirSync(outputDir, { recursive: true });
        writeFileSync(path.join(outputDir, 'premium-estimate-long.pdf'), Buffer.from(doc.output('arraybuffer')));

        const pathologicalEstimate = makeEstimate(1);
        pathologicalEstimate.items[0].name = Array.from(
            { length: 180 },
            (_, index) => `длинный-фрагмент-${index + 1}`,
        ).join(' ');
        const pathologicalDoc = createPremiumEstimatePdf(pathologicalEstimate, {
            fontBase64: regularFont,
            boldFontBase64: boldFont,
        });
        writeFileSync(
            path.join(outputDir, 'premium-estimate-pathological.pdf'),
            Buffer.from(pathologicalDoc.output('arraybuffer')),
        );

        const wideCellsEstimate = makeEstimate(1);
        wideCellsEstimate.items[0].unit = 'комплект на рабочую смену';
        wideCellsEstimate.items[0].quantity = 1_234_567_890.75;
        wideCellsEstimate.items[0].total = wideCellsEstimate.items[0].quantity * wideCellsEstimate.items[0].price;
        wideCellsEstimate.total = wideCellsEstimate.items[0].total;
        const wideCellsDoc = createPremiumEstimatePdf(wideCellsEstimate, {
            fontBase64: regularFont,
            boldFontBase64: boldFont,
        });
        writeFileSync(
            path.join(outputDir, 'premium-estimate-wide-cells.pdf'),
            Buffer.from(wideCellsDoc.output('arraybuffer')),
        );
    });
});
