import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EstimateCategory, EstimateStatus } from '../types';
import type { HouseTier, HouseVariantResult } from './houseCalculator';
import {
    buildHouseProposalPdfModel,
    createHouseProposalPdf,
    HOUSE_PROPOSAL_PRELIMINARY_TEXT,
    houseProposalPdfFileName,
    type HouseProposalPdfInput,
} from './houseProposalPdf';

const INTERNAL_EXPLANATION_SENTINEL = 'INTERNAL_EXPLANATION_MUST_NOT_LEAK';
const WARNING_SENTINEL = 'WARNING_MUST_NOT_LEAK';

const variant = (tier: HouseTier, label: string, base: number): HouseVariantResult => ({
    tier,
    label,
    description: tier === 'economy'
        ? 'Тёплый контур без отделки и инженерии'
        : tier === 'optimal'
            ? 'Дом с подготовкой под чистовую отделку'
            : 'Под ключ с инженерными системами',
    package: tier === 'economy' ? 'warm-shell' : tier === 'optimal' ? 'rough-finish' : 'turnkey-engineering',
    result: {
        low: base * 0.85,
        base,
        high: base * 1.15,
        confidence: 'medium',
        evidence: {
            eligibleEstimateCount: 4,
            approvedCount: 3,
            sentCount: 1,
            draftCount: 0,
            referenceMatched: true,
            sourceReason: 'Тестовая подтверждённая смета.',
        },
        sections: [
            { category: EstimateCategory.FOUNDATION, total: base * 0.2, items: [] },
            { category: EstimateCategory.WALLS, total: base * 0.45, items: [] },
            { category: EstimateCategory.ROOF, total: base * 0.2, items: [] },
            { category: EstimateCategory.ELECTRICAL, total: base * 0.15, items: [] },
        ],
        items: [],
        warnings: [WARNING_SENTINEL],
        sourceEstimate: {
            id: `source-${tier}`,
            estimateNumber: `КМ-${tier}`,
            client: 'Тестовый клиент',
            date: '2026-07-29',
            status: EstimateStatus.APPROVED,
            version: 1,
            items: [],
            total: base,
            buildingType: 'Каркасный дом',
            area: 128,
            explanation: INTERNAL_EXPLANATION_SENTINEL,
        },
        rates: {
            overheadPercent: 10,
            marginPercent: 12,
            reservePercent: 5,
            taxPercent: 0,
            discountPercent: 2,
        },
        financials: {
            materials: base * 0.52,
            works: base * 0.28,
            logistics: base * 0.05,
            equipment: base * 0.03,
            overhead: base * 0.05,
            margin: base * 0.05,
            reserve: base * 0.03,
            tax: 0,
            discount: base * 0.01,
            final: base,
        },
    },
});

const input = (): HouseProposalPdfInput => ({
    area: 128,
    floors: 2,
    doors: 8,
    roof: 'Двускатная',
    clientDescription: 'Нужен дом под ключ для круглогодичного проживания с террасой и большими окнами.',
    selectedTier: 'premium',
    variants: [
        variant('economy', 'Эконом', 4_900_000),
        variant('optimal', 'Оптимальный', 6_200_000),
        variant('premium', 'Премиум', 8_750_000),
    ],
});

describe('house proposal PDF', () => {
    it('keeps only client-facing content in the PDF model', () => {
        const model = buildHouseProposalPdfModel(input());
        const content = JSON.stringify(model);

        expect(model.selectedLabel).toBe('Премиум');
        expect(model.preliminaryText).toBe(HOUSE_PROPOSAL_PRELIMINARY_TEXT);
        expect(model.financialRows.some(row => row.label === 'Налог')).toBe(false);
        expect(model.financialRows.find(row => row.label === 'Скидка')?.value).toBeLessThan(0);
        expect(content).not.toContain(INTERNAL_EXPLANATION_SENTINEL);
        expect(content).not.toContain(WARNING_SENTINEL);
        expect(content.toLocaleLowerCase('ru-RU')).not.toContain('важные условия');
    });

    it('creates a branded multipage proposal and a safe PDF file name', () => {
        const proposalInput = input();
        const doc = createHouseProposalPdf(proposalInput, { fontBase64: null, boldFontBase64: null });
        const bytes = Buffer.from(doc.output('arraybuffer'));

        expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
        expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
        expect(bytes.length).toBeGreaterThan(5_000);
        expect(houseProposalPdfFileName(128)).toBe('Коммерческое предложение - каркасный дом 128 м².pdf');
    });

    it('can write a visual fixture when requested', () => {
        if (process.env.HOUSE_PROPOSAL_PDF_FIXTURE !== '1') return;

        const regularFont = readFileSync(path.resolve('assets/LiberationSans-Regular.ttf')).toString('base64');
        const boldFont = readFileSync(path.resolve('assets/LiberationSans-Bold.ttf')).toString('base64');
        const doc = createHouseProposalPdf(input(), {
            fontBase64: regularFont,
            boldFontBase64: boldFont,
        });
        const outputDir = path.resolve('tmp/pdfs');
        mkdirSync(outputDir, { recursive: true });
        writeFileSync(
            path.join(outputDir, 'house-proposal-sample.pdf'),
            Buffer.from(doc.output('arraybuffer')),
        );
    });
});
