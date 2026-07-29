import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { EstimateCategory, EstimateStatus } from '../types';
import { HouseTier, HouseVariantResult } from './houseCalculator';
import { buildHouseProposalDocx } from './houseProposalDocx';

const INTERNAL_EXPLANATION_SENTINEL = 'INTERNAL_EXPLANATION_MUST_NOT_LEAK';

const readZipEntry = (archive: Buffer, entryName: string): string => {
    const centralSignature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
    let centralOffset = archive.indexOf(centralSignature);

    while (centralOffset >= 0) {
        const compressionMethod = archive.readUInt16LE(centralOffset + 10);
        const compressedSize = archive.readUInt32LE(centralOffset + 20);
        const fileNameLength = archive.readUInt16LE(centralOffset + 28);
        const extraLength = archive.readUInt16LE(centralOffset + 30);
        const commentLength = archive.readUInt16LE(centralOffset + 32);
        const localHeaderOffset = archive.readUInt32LE(centralOffset + 42);
        const nameStart = centralOffset + 46;
        const name = archive.toString('utf8', nameStart, nameStart + fileNameLength);

        if (name === entryName) {
            const localNameLength = archive.readUInt16LE(localHeaderOffset + 26);
            const localExtraLength = archive.readUInt16LE(localHeaderOffset + 28);
            const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
            const compressed = archive.subarray(dataStart, dataStart + compressedSize);
            const content = compressionMethod === 0 ? compressed : inflateRawSync(compressed);
            return content.toString('utf8');
        }

        centralOffset = archive.indexOf(
            centralSignature,
            nameStart + fileNameLength + extraLength + commentLength,
        );
    }

    throw new Error(`ZIP entry not found: ${entryName}`);
};

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
        confidence: tier === 'premium' ? 'medium' : 'low',
        evidence: {
            eligibleEstimateCount: 4,
            approvedCount: 3,
            sentCount: 1,
            draftCount: 0,
            referenceMatched: false,
            sourceReason: 'Тестовая подтверждённая смета.',
        },
        sections: [
            { category: EstimateCategory.FOUNDATION, total: base * 0.2, items: [] },
            { category: EstimateCategory.WALLS, total: base * 0.45, items: [] },
            { category: EstimateCategory.ROOF, total: base * 0.2, items: [] },
            { category: EstimateCategory.ELECTRICAL, total: base * 0.15, items: [] },
        ],
        items: [],
        warnings: [
            'Расчёт требует проверки перед отправкой клиенту.',
            'Состав инженерии уточняется после согласования проекта.',
        ],
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

describe('house proposal DOCX', () => {
    it('builds a branded Word proposal and can emit a QA sample', async () => {
        const blob = await buildHouseProposalDocx({
            area: 128,
            floors: 2,
            windows: 12,
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

        expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        expect(blob.size).toBeGreaterThan(10_000);

        const documentXml = readZipEntry(Buffer.from(await blob.arrayBuffer()), 'word/document.xml');
        const documentText = documentXml.toLocaleLowerCase('ru-RU');
        expect(documentText).toContain('каркасный дом 128 м²');
        expect(documentText).toContain('сравнение вариантов');
        expect(documentText).toContain('выбранный вариант: премиум');
        expect(documentText).toContain('предварительная стоимость');
        expect(documentText).toContain('рабочий диапазон');
        expect(documentText).toContain('этапы и разделы строительства');
        expect(documentText).toContain('за что производится оплата');
        expect(documentText).toContain('пожелания клиента');
        expect(documentText).toContain('важные условия');
        expect(documentXml).toContain('EF4136');
        expect(documentXml).toContain('101318');
        expect(documentXml).not.toContain(INTERNAL_EXPLANATION_SENTINEL);
        expect(documentText).not.toContain('уровень уверенности');
        expect(documentText).not.toContain('связаться с каркас мастер');

        if (process.env.WRITE_HOUSE_PROPOSAL_SAMPLE === '1') {
            const outputDir = path.resolve('tmp/house-proposal');
            mkdirSync(outputDir, { recursive: true });
            writeFileSync(path.join(outputDir, 'house-proposal-sample.docx'), Buffer.from(await blob.arrayBuffer()));
        }
    });
});
