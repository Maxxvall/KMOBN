import { jsPDF } from 'jspdf';
import {
    Estimate,
    EstimateCategory,
    EstimateItem,
    EstimateSubgroup,
    Material,
} from '../types';
import { PDF_FONT_NAME, registerPdfFont } from './pdfUtils';
import { getEstimateCategories } from './estimateSections';
import {
    PREMIUM_PDF_COLORS as COLORS,
    PREMIUM_PDF_LINKS,
    PremiumPdfRgb as Rgb,
} from './premiumPdfBrand';

export interface PremiumPdfAssets {
    fontBase64: string | null;
    boldFontBase64?: string | null;
}

export interface PremiumPdfOptions {
    materials?: readonly Pick<Material, 'id' | 'link'>[];
}

export interface PremiumEstimateSubgroup {
    name: EstimateSubgroup;
    items: EstimateItem[];
}

export interface PremiumEstimateSection {
    category: EstimateCategory;
    subgroups: PremiumEstimateSubgroup[];
    total: number;
    worksTotal: number;
    materialsTotal: number;
    deliveryTotal: number;
}

export interface PremiumEstimateModel {
    sections: PremiumEstimateSection[];
    worksTotal: number;
    materialsTotal: number;
    deliveryTotal: number;
    calculatedTotal: number;
    total: number;
}

export { PREMIUM_PDF_LINKS } from './premiumPdfBrand';

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 14;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const CONTENT_BOTTOM = 276;
const FOOTER_LINE_Y = 281;
const FOOTER_TEXT_Y = 288;
const TABLE_HEADER_HEIGHT = 10;
const CATEGORY_HEIGHT = 9;
const SUBGROUP_HEIGHT = 7.5;
const ITEM_MIN_HEIGHT = 8.5;
const ITEM_LINE_HEIGHT = 3.8;
const ITEM_PADDING_Y = 2;
const FINAL_BLOCK_HEIGHT = 98;
const COLUMN_WIDTHS = [88, 14, 21, 28, 31] as const;

const setFill = (doc: jsPDF, color: Rgb) => doc.setFillColor(...color);
const setDraw = (doc: jsPDF, color: Rgb) => doc.setDrawColor(...color);
const setText = (doc: jsPDF, color: Rgb) => doc.setTextColor(...color);

export const safeItemTotal = (item: EstimateItem): number => {
    if (Number.isFinite(item.total)) return item.total;
    const quantity = Number.isFinite(item.quantity) ? item.quantity : 0;
    const price = Number.isFinite(item.price) ? item.price : 0;
    return quantity * price;
};

const subgroupOf = (item: EstimateItem): EstimateSubgroup => item.subgroup || EstimateSubgroup.WORKS;

const sumItems = (items: EstimateItem[]): number => items.reduce((sum, item) => sum + safeItemTotal(item), 0);

export const buildPremiumEstimateModel = (estimate: Estimate): PremiumEstimateModel => {
    const orderedCategories = getEstimateCategories(estimate.items);
    const subgroupOrder = [
        EstimateSubgroup.WORKS,
        EstimateSubgroup.MATERIALS,
        EstimateSubgroup.DELIVERY,
    ];

    const sections = orderedCategories.flatMap((category): PremiumEstimateSection[] => {
        const items = estimate.items.filter(item => item.category === category);
        if (items.length === 0) return [];

        const subgroups = subgroupOrder.flatMap((name): PremiumEstimateSubgroup[] => {
            const subgroupItems = items.filter(item => subgroupOf(item) === name);
            return subgroupItems.length > 0 ? [{ name, items: subgroupItems }] : [];
        });

        const worksItems = items.filter(item => subgroupOf(item) === EstimateSubgroup.WORKS);
        const materialItems = items.filter(item => subgroupOf(item) === EstimateSubgroup.MATERIALS);
        const deliveryItems = items.filter(item => subgroupOf(item) === EstimateSubgroup.DELIVERY);

        return [{
            category,
            subgroups,
            total: sumItems(items),
            worksTotal: sumItems(worksItems),
            materialsTotal: sumItems(materialItems),
            deliveryTotal: sumItems(deliveryItems),
        }];
    });

    const worksTotal = sections.reduce((sum, section) => sum + section.worksTotal, 0);
    const materialsTotal = sections.reduce((sum, section) => sum + section.materialsTotal, 0);
    const deliveryTotal = sections.reduce((sum, section) => sum + section.deliveryTotal, 0);
    const calculatedTotal = worksTotal + materialsTotal + deliveryTotal;
    const total = Number.isFinite(estimate.total) ? estimate.total : calculatedTotal;

    return { sections, worksTotal, materialsTotal, deliveryTotal, calculatedTotal, total };
};

export const sanitizePremiumPdfFileName = (value: string): string => {
    const normalized = value.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
    return normalized || 'Без_названия';
};

export const premiumEstimateFileName = (estimate: Estimate): string => {
    const number = sanitizePremiumPdfFileName(estimate.estimateNumber).replace(/\s+/g, '_');
    const client = sanitizePremiumPdfFileName(estimate.client).replace(/\s+/g, '_');
    return `Смета_${number}_${client}_премиум.pdf`;
};

const formatNumber = (value: number): string => value.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
});

const formatMoney = (value: number): string => `${formatNumber(value)}\u00a0руб.`;

const formatDate = (value: string): string => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ru-RU');
};

const safeText = (value: unknown): string => String(value ?? '').trim() || '—';

export const createPremiumEstimatePdf = (
    estimate: Estimate,
    assets: PremiumPdfAssets,
    options: PremiumPdfOptions = {},
): jsPDF => {
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
        putOnlyUsedFonts: true,
    });
    registerPdfFont(doc, assets.fontBase64, assets.boldFontBase64 ?? null);

    const fontName = assets.fontBase64 ? PDF_FONT_NAME : 'helvetica';
    const model = buildPremiumEstimateModel(estimate);
    const estimateDate = formatDate(estimate.date);
    let y = 0;
    let stripedRow = false;

    doc.setProperties({
        title: `Смета № ${estimate.estimateNumber} — Каркас Мастер`,
        subject: `Премиальная клиентская смета для ${estimate.client}`,
        author: 'Каркас Мастер',
        creator: 'Каркас Мастер',
        keywords: 'смета, строительство, Каркас Мастер, karkasmaster.ru',
    });

    const setPdfFont = (style: 'normal' | 'bold' = 'normal') => doc.setFont(fontName, style);

    const wrapText = (text: string, width: number, fontSize: number, style: 'normal' | 'bold' = 'normal'): string[] => {
        setPdfFont(style);
        doc.setFontSize(fontSize);
        const wrapped = doc.splitTextToSize(safeText(text), Math.max(1, width));
        return Array.isArray(wrapped) ? wrapped.map(String) : [String(wrapped)];
    };

    const fitFontSize = (
        text: string,
        maxWidth: number,
        preferredSize: number,
        minSize: number,
        style: 'normal' | 'bold' = 'normal',
    ): number => {
        setPdfFont(style);
        let size = preferredSize;
        doc.setFontSize(size);
        while (size > minSize && doc.getTextWidth(text) > maxWidth) {
            size = Math.max(minSize, size - 0.3);
            doc.setFontSize(size);
        }
        return size;
    };

    const linkArea = (x: number, top: number, width: number, height: number, url: string) => {
        doc.link(x, top, Math.max(width, 1), Math.max(height, 1), { url });
    };

    const materialLinks = new Map(
        (options.materials ?? []).flatMap(material => {
            const rawLink = material.link?.trim();
            if (!rawLink) return [];

            const candidate = /^[a-z][a-z\d+.-]*:/i.test(rawLink) ? rawLink : `https://${rawLink}`;
            try {
                const url = new URL(candidate);
                return url.protocol === 'http:' || url.protocol === 'https:'
                    ? [[material.id, url.toString()] as const]
                    : [];
            } catch {
                return [];
            }
        }),
    );

    const materialLinkFor = (item: EstimateItem): string | undefined => {
        if (subgroupOf(item) !== EstimateSubgroup.MATERIALS || !item.catalogMaterialId) return undefined;
        return materialLinks.get(item.catalogMaterialId);
    };

    const drawLinkedText = (
        text: string,
        x: number,
        baseline: number,
        url: string,
        options?: { align?: 'left' | 'center' | 'right'; underline?: boolean },
    ) => {
        const align = options?.align || 'left';
        doc.text(text, x, baseline, { align });
        const width = doc.getTextWidth(text);
        const left = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
        if (options?.underline) {
            setDraw(doc, COLORS.red);
            doc.setLineWidth(0.25);
            doc.line(left, baseline + 1, left + width, baseline + 1);
        }
        linkArea(left, baseline - 4, width, 6, url);
    };

    const drawPaper = () => {
        setFill(doc, COLORS.paper);
        doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, 'F');
    };

    const drawWordmark = (baseline: number, light: boolean) => {
        setPdfFont('bold');
        doc.setFontSize(10.5);
        setText(doc, light ? COLORS.white : COLORS.graphite);
        doc.text('КАРКАС', MARGIN, baseline);
        const firstWidth = doc.getTextWidth('КАРКАС');
        setText(doc, COLORS.red);
        doc.text('МАСТЕР', MARGIN + firstWidth + 1.2, baseline);
        const totalWidth = firstWidth + 1.2 + doc.getTextWidth('МАСТЕР');
        setDraw(doc, COLORS.red);
        doc.setLineWidth(0.35);
        doc.line(MARGIN, baseline + 1.7, MARGIN + totalWidth, baseline + 1.7);
        linkArea(MARGIN, baseline - 5, totalWidth, 8, PREMIUM_PDF_LINKS.website);
    };

    const drawFirstPageHeader = (): number => {
        drawPaper();
        setFill(doc, COLORS.red);
        doc.rect(0, 0, PAGE_WIDTH, 4, 'F');
        doc.rect(0, 4, 3.5, 44, 'F');
        setFill(doc, COLORS.graphite);
        doc.rect(3.5, 4, PAGE_WIDTH - 3.5, 44, 'F');

        drawWordmark(16, true);
        setPdfFont('normal');
        doc.setFontSize(8);
        setText(doc, COLORS.white);
        drawLinkedText('KARKASMASTER.RU', PAGE_WIDTH - MARGIN, 16, PREMIUM_PDF_LINKS.website, { align: 'right' });

        setPdfFont('bold');
        doc.setFontSize(7.2);
        setText(doc, COLORS.red);
        doc.text('КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ', MARGIN, 28);

        setPdfFont('bold');
        doc.setFontSize(21);
        setText(doc, COLORS.white);
        doc.text(`СМЕТА № ${safeText(estimate.estimateNumber)}`, MARGIN, 40);

        setPdfFont('normal');
        doc.setFontSize(9);
        setText(doc, COLORS.white);
        doc.text(`от ${estimateDate}`, PAGE_WIDTH - MARGIN, 40, { align: 'right' });
        return 54;
    };

    const drawContinuationHeader = (): number => {
        drawPaper();
        setFill(doc, COLORS.red);
        doc.rect(0, 0, PAGE_WIDTH, 3.5, 'F');
        drawWordmark(16, false);

        setPdfFont('normal');
        doc.setFontSize(8);
        setText(doc, COLORS.muted);
        doc.text(`Смета № ${safeText(estimate.estimateNumber)} · ${estimateDate}`, PAGE_WIDTH - MARGIN, 16, { align: 'right' });
        setDraw(doc, COLORS.line);
        doc.setLineWidth(0.35);
        doc.line(MARGIN, 23, PAGE_WIDTH - MARGIN, 23);
        return 29;
    };

    const drawClientSummary = (top: number): number => {
        const leftWidth = 108;
        const gap = 6;
        const rightX = MARGIN + leftWidth + gap;
        const rightWidth = CONTENT_WIDTH - leftWidth - gap;
        const valueWidth = leftWidth - 2;
        const clientLines = wrapText(safeText(estimate.client), valueWidth, 10, 'bold');
        const buildingLines = wrapText(safeText(estimate.buildingType), valueWidth, 9.2, 'normal');
        const clientHeight = 5 + clientLines.length * 4.4;
        const buildingHeight = 5 + buildingLines.length * 4.1;
        const leftHeight = clientHeight + buildingHeight + 15;
        const blockHeight = Math.max(40, leftHeight);

        const drawField = (label: string, lines: string[], baseline: number, bold: boolean, lineHeight: number): number => {
            setPdfFont('bold');
            doc.setFontSize(6.8);
            setText(doc, COLORS.red);
            doc.text(label.toUpperCase(), MARGIN, baseline);
            setPdfFont(bold ? 'bold' : 'normal');
            doc.setFontSize(bold ? 10 : 9.2);
            setText(doc, COLORS.text);
            let lineY = baseline + 5;
            lines.forEach(line => {
                doc.text(line, MARGIN, lineY);
                lineY += lineHeight;
            });
            return lineY;
        };

        let fieldY = drawField('Подготовлено для', clientLines, top + 3, true, 4.4);
        fieldY = drawField('Объект', buildingLines, fieldY + 2, false, 4.1);
        setPdfFont('bold');
        doc.setFontSize(6.8);
        setText(doc, COLORS.red);
        doc.text('ПЛОЩАДЬ', MARGIN, fieldY + 2);
        setPdfFont('bold');
        doc.setFontSize(10);
        setText(doc, COLORS.text);
        doc.text(`${formatNumber(estimate.area)} м²`, MARGIN, fieldY + 7);

        setFill(doc, COLORS.graphiteSoft);
        doc.roundedRect(rightX, top, rightWidth, blockHeight, 4, 4, 'F');
        setPdfFont('bold');
        doc.setFontSize(6.8);
        setText(doc, COLORS.red);
        doc.text('СТОИМОСТЬ ПРОЕКТА', rightX + 6, top + 8);
        const totalText = formatMoney(model.total);
        fitFontSize(totalText, rightWidth - 12, 17, 12, 'bold');
        setText(doc, COLORS.white);
        doc.text(totalText, rightX + 6, top + 18);

        setPdfFont('normal');
        doc.setFontSize(7.2);
        setText(doc, COLORS.white);
        const breakdown = [
            `Работы  ${formatMoney(model.worksTotal)}`,
            `Материалы  ${formatMoney(model.materialsTotal)}`,
            `Доставка  ${formatMoney(model.deliveryTotal)}`,
        ];
        const breakdownStart = Math.max(top + 27, top + blockHeight - 16);
        breakdown.forEach((line, index) => doc.text(line, rightX + 6, breakdownStart + index * 4.2));
        return top + blockHeight;
    };

    const columnX = COLUMN_WIDTHS.reduce<number[]>((positions, width, index) => {
        positions.push(index === 0 ? MARGIN : positions[index - 1] + COLUMN_WIDTHS[index - 1]);
        return positions;
    }, []);

    const drawTableHeader = (top: number): number => {
        setFill(doc, COLORS.graphite);
        doc.rect(MARGIN, top, CONTENT_WIDTH, TABLE_HEADER_HEIGHT, 'F');
        setFill(doc, COLORS.red);
        doc.rect(MARGIN, top, 2.4, TABLE_HEADER_HEIGHT, 'F');
        setPdfFont('bold');
        doc.setFontSize(7.6);
        setText(doc, COLORS.white);
        const labels = ['НАИМЕНОВАНИЕ', 'ЕД.', 'КОЛ-ВО', 'ЦЕНА', 'СУММА'];
        labels.forEach((label, index) => {
            const x = columnX[index];
            const width = COLUMN_WIDTHS[index];
            const align = index === 0 ? 'left' : index === 1 || index === 2 ? 'center' : 'right';
            const textX = align === 'left' ? x + 4 : align === 'center' ? x + width / 2 : x + width - 2;
            doc.text(label, textX, top + 6.4, { align });
        });
        return top + TABLE_HEADER_HEIGHT;
    };

    const newTablePage = () => {
        doc.addPage();
        y = drawTableHeader(drawContinuationHeader());
        stripedRow = false;
    };

    const newSummaryPage = () => {
        doc.addPage();
        y = drawContinuationHeader();
    };

    const drawCategoryRow = (category: EstimateCategory, continuation = false) => {
        setFill(doc, COLORS.graphiteSoft);
        doc.rect(MARGIN, y, CONTENT_WIDTH, CATEGORY_HEIGHT, 'F');
        setFill(doc, COLORS.red);
        doc.rect(MARGIN, y, 2.4, CATEGORY_HEIGHT, 'F');
        setPdfFont('bold');
        doc.setFontSize(9.4);
        setText(doc, COLORS.white);
        const label = continuation ? `${category} · ПРОДОЛЖЕНИЕ` : category;
        doc.text(label, MARGIN + 5, y + 6);
        y += CATEGORY_HEIGHT;
        stripedRow = false;
    };

    const drawSubgroupRow = (subgroup: EstimateSubgroup, continuation = false) => {
        setFill(doc, COLORS.paleRed);
        doc.rect(MARGIN, y, CONTENT_WIDTH, SUBGROUP_HEIGHT, 'F');
        setPdfFont('bold');
        doc.setFontSize(8.1);
        setText(doc, COLORS.red);
        doc.text(continuation ? `${subgroup} · продолжение` : subgroup, MARGIN + 4, y + 5);
        setDraw(doc, COLORS.line);
        doc.setLineWidth(0.25);
        doc.line(MARGIN, y + SUBGROUP_HEIGHT, PAGE_WIDTH - MARGIN, y + SUBGROUP_HEIGHT);
        y += SUBGROUP_HEIGHT;
    };

    const itemNameLines = (item: EstimateItem): string[] => wrapText(item.name, COLUMN_WIDTHS[0] - 6, 8.5, 'normal');
    const itemUnitLines = (item: EstimateItem): string[] => wrapText(safeText(item.unit), COLUMN_WIDTHS[1] - 4, 7.2, 'normal');
    const itemHeightForLines = (lineCount: number): number => Math.max(ITEM_MIN_HEIGHT, lineCount * ITEM_LINE_HEIGHT + ITEM_PADDING_Y * 2);
    const itemHeight = (item: EstimateItem): number => itemHeightForLines(Math.max(
        itemNameLines(item).length,
        itemUnitLines(item).length,
    ));
    const itemKeepHeight = (item: EstimateItem): number => Math.min(itemHeight(item), itemHeightForLines(2));

    const drawItemChunk = (item: EstimateItem, lines: string[], showNumbers: boolean) => {
        const unitLines = showNumbers ? itemUnitLines(item) : [];
        const rowHeight = itemHeightForLines(Math.max(lines.length, unitLines.length));
        const materialLink = materialLinkFor(item);
        if (stripedRow) {
            setFill(doc, COLORS.row);
            doc.rect(MARGIN, y, CONTENT_WIDTH, rowHeight, 'F');
        }
        setDraw(doc, COLORS.line);
        doc.setLineWidth(0.2);
        doc.line(MARGIN, y + rowHeight, PAGE_WIDTH - MARGIN, y + rowHeight);

        setPdfFont('normal');
        doc.setFontSize(8.5);
        setText(doc, COLORS.text);
        lines.forEach((line, index) => {
            const textX = columnX[0] + 2;
            const baseline = y + ITEM_PADDING_Y + 3 + index * ITEM_LINE_HEIGHT;
            doc.text(line, textX, baseline);
            if (materialLink) {
                linkArea(textX, baseline - 3.2, doc.getTextWidth(line), ITEM_LINE_HEIGHT, materialLink);
            }
        });

        const centerY = rowHeight > 20 ? y + 6 : y + rowHeight / 2 + 1.4;
        const drawCenteredLines = (cellLines: string[], centerX: number) => {
            const firstBaseline = rowHeight > 20
                ? y + 5
                : y + (rowHeight - cellLines.length * ITEM_LINE_HEIGHT) / 2 + 3;
            cellLines.forEach((line, index) => doc.text(line, centerX, firstBaseline + index * ITEM_LINE_HEIGHT, { align: 'center' }));
        };
        if (showNumbers) {
            setPdfFont('normal');
            doc.setFontSize(7.2);
            drawCenteredLines(unitLines, columnX[1] + COLUMN_WIDTHS[1] / 2);
            const quantityText = formatNumber(item.quantity);
            fitFontSize(quantityText, COLUMN_WIDTHS[2] - 4, 7.2, 6.2, 'normal');
            doc.text(quantityText, columnX[2] + COLUMN_WIDTHS[2] / 2, centerY, { align: 'center' });
            const priceText = formatMoney(item.price);
            fitFontSize(priceText, COLUMN_WIDTHS[3] - 4, 8.1, 6.6, 'normal');
            doc.text(priceText, columnX[3] + COLUMN_WIDTHS[3] - 2, centerY, { align: 'right' });
            const totalText = formatMoney(safeItemTotal(item));
            fitFontSize(totalText, COLUMN_WIDTHS[4] - 4, 8.1, 6.6, 'bold');
            doc.text(totalText, columnX[4] + COLUMN_WIDTHS[4] - 2, centerY, { align: 'right' });
        } else {
            setPdfFont('normal');
            doc.setFontSize(7);
            setText(doc, COLORS.muted);
            doc.text('продолжение', columnX[4] + COLUMN_WIDTHS[4] - 2, centerY, { align: 'right' });
        }

        y += rowHeight;
        stripedRow = !stripedRow;
    };

    const beginContextContinuation = (category: EstimateCategory, subgroup: EstimateSubgroup) => {
        newTablePage();
        drawCategoryRow(category, true);
        drawSubgroupRow(subgroup, true);
    };

    const drawItem = (
        item: EstimateItem,
        category: EstimateCategory,
        subgroup: EstimateSubgroup,
        reserveAfter = 0,
    ) => {
        const lines = itemNameLines(item);
        const fullHeight = itemHeight(item);
        const freshPageAvailable = CONTENT_BOTTOM - (29 + TABLE_HEADER_HEIGHT + CATEGORY_HEIGHT + SUBGROUP_HEIGHT);

        if (fullHeight + reserveAfter <= freshPageAvailable && y + fullHeight + reserveAfter > CONTENT_BOTTOM) {
            beginContextContinuation(category, subgroup);
        }

        if (y + fullHeight <= CONTENT_BOTTOM) {
            drawItemChunk(item, lines, true);
            return;
        }

        let offset = 0;
        let firstChunk = true;
        while (offset < lines.length) {
            const available = CONTENT_BOTTOM - y;
            const maxLines = Math.floor((available - ITEM_PADDING_Y * 2) / ITEM_LINE_HEIGHT);
            if (maxLines < 1) {
                beginContextContinuation(category, subgroup);
                continue;
            }

            const chunk = lines.slice(offset, offset + maxLines);
            drawItemChunk(item, chunk, firstChunk);
            offset += chunk.length;
            firstChunk = false;
            if (offset < lines.length) beginContextContinuation(category, subgroup);
        }
    };

    const sectionBreakdownText = (section: PremiumEstimateSection): string => [
        `Работы: ${formatMoney(section.worksTotal)}`,
        `Материалы: ${formatMoney(section.materialsTotal)}`,
        `Доставка: ${formatMoney(section.deliveryTotal)}`,
    ].join('   ·   ');

    const sectionSummaryHeight = (section: PremiumEstimateSection): number => {
        const lines = wrapText(sectionBreakdownText(section), CONTENT_WIDTH - 8, 7.4, 'normal');
        return 9 + lines.length * 3.4 + 2;
    };

    const drawSectionSummary = (section: PremiumEstimateSection) => {
        const breakdownLines = wrapText(sectionBreakdownText(section), CONTENT_WIDTH - 8, 7.4, 'normal');
        const height = 9 + breakdownLines.length * 3.4 + 2;
        setFill(doc, COLORS.row);
        doc.rect(MARGIN, y, CONTENT_WIDTH, height, 'F');
        setFill(doc, COLORS.red);
        doc.rect(MARGIN, y, CONTENT_WIDTH, 0.8, 'F');

        setPdfFont('bold');
        doc.setFontSize(8.6);
        setText(doc, COLORS.text);
        doc.text('ИТОГО ПО РАЗДЕЛУ', MARGIN + 3, y + 6.2);
        doc.setFontSize(9.3);
        doc.text(formatMoney(section.total), PAGE_WIDTH - MARGIN - 3, y + 6.2, { align: 'right' });

        setPdfFont('normal');
        doc.setFontSize(7.4);
        setText(doc, COLORS.muted);
        breakdownLines.forEach((line, index) => doc.text(line, MARGIN + 3, y + 10.2 + index * 3.4));
        y += height;
    };

    const drawLinkBlock = (label: string, value: string, url: string, x: number, top: number, width: number) => {
        setPdfFont('bold');
        doc.setFontSize(6.5);
        setText(doc, COLORS.muted);
        doc.text(label.toUpperCase(), x, top + 3);
        setPdfFont('bold');
        doc.setFontSize(8.1);
        setText(doc, COLORS.text);
        doc.text(value, x, top + 8);
        setDraw(doc, COLORS.red);
        doc.setLineWidth(0.25);
        doc.line(x, top + 9.3, x + Math.min(doc.getTextWidth(value), width), top + 9.3);
        linkArea(x, top, width, 10.5, url);
    };

    const drawFinalBlock = (top: number) => {
        const totalCardWidth = 72;
        const breakdownWidth = CONTENT_WIDTH - totalCardWidth - 5;
        const cardHeight = 34;

        setFill(doc, COLORS.white);
        doc.roundedRect(MARGIN, top, breakdownWidth, cardHeight, 4, 4, 'F');
        setFill(doc, COLORS.red);
        doc.rect(MARGIN, top, breakdownWidth, 1.2, 'F');
        setPdfFont('bold');
        doc.setFontSize(7);
        setText(doc, COLORS.red);
        doc.text('СТРУКТУРА СТОИМОСТИ', MARGIN + 6, top + 8);
        setPdfFont('normal');
        doc.setFontSize(9);
        setText(doc, COLORS.text);
        const breakdown = [
            ['Работы', model.worksTotal],
            ['Материалы', model.materialsTotal],
            ['Доставка', model.deliveryTotal],
        ] as const;
        breakdown.forEach(([label, value], index) => {
            const baseline = top + 16 + index * 5.2;
            doc.text(label, MARGIN + 6, baseline);
            setPdfFont('bold');
            doc.text(formatMoney(value), MARGIN + breakdownWidth - 6, baseline, { align: 'right' });
            setPdfFont('normal');
        });

        const totalX = MARGIN + breakdownWidth + 5;
        setFill(doc, COLORS.graphite);
        doc.roundedRect(totalX, top, totalCardWidth, cardHeight, 4, 4, 'F');
        setPdfFont('bold');
        doc.setFontSize(7);
        setText(doc, COLORS.red);
        doc.text('ОБЩИЙ ИТОГ', totalX + 6, top + 9);
        const finalTotalText = formatMoney(model.total);
        fitFontSize(finalTotalText, totalCardWidth - 12, 18, 12, 'bold');
        setText(doc, COLORS.white);
        doc.text(finalTotalText, totalX + 6, top + 21);
        setPdfFont('normal');
        doc.setFontSize(6.8);
        setText(doc, COLORS.white);
        doc.text('по состоянию на дату сметы', totalX + 6, top + 28);

        setPdfFont('bold');
        doc.setFontSize(9.5);
        setText(doc, COLORS.text);
        doc.text('СВЯЗАТЬСЯ С КАРКАС МАСТЕР', MARGIN, top + 43);

        const colWidth = CONTENT_WIDTH / 3;
        const rowOne = top + 47;
        const rowTwo = top + 59;
        drawLinkBlock('Сайт', 'karkasmaster.ru', PREMIUM_PDF_LINKS.website, MARGIN, rowOne, colWidth - 4);
        drawLinkBlock('Телефон', '+7 (953) 333-71-71', PREMIUM_PDF_LINKS.phone, MARGIN + colWidth, rowOne, colWidth - 4);
        drawLinkBlock('Email', 'karkasmasterobn@gmail.com', PREMIUM_PDF_LINKS.email, MARGIN + colWidth * 2, rowOne, colWidth - 4);
        drawLinkBlock('MAX', 'Обсудить смету', PREMIUM_PDF_LINKS.max, MARGIN, rowTwo, colWidth - 4);
        drawLinkBlock('Telegram', '@karkasmaster40', PREMIUM_PDF_LINKS.telegram, MARGIN + colWidth, rowTwo, colWidth - 4);
        drawLinkBlock('ВКонтакте', 'vk.com/kmobn', PREMIUM_PDF_LINKS.vk, MARGIN + colWidth * 2, rowTwo, colWidth - 4);

        const ctaY = top + 73;
        setFill(doc, COLORS.red);
        doc.roundedRect(MARGIN, ctaY, CONTENT_WIDTH, 11, 3, 3, 'F');
        setPdfFont('bold');
        doc.setFontSize(9.5);
        setText(doc, COLORS.white);
        doc.text('ОБСУДИТЬ СМЕТУ В MAX', PAGE_WIDTH / 2, ctaY + 7, { align: 'center' });
        linkArea(MARGIN, ctaY, CONTENT_WIDTH, 11, PREMIUM_PDF_LINKS.max);

        setPdfFont('normal');
        doc.setFontSize(7.2);
        setText(doc, COLORS.muted);
        const note = 'Окончательная стоимость зависит от выбранной комплектации, условий участка и актуальных цен на материалы.';
        const noteLines = wrapText(note, CONTENT_WIDTH, 7.2, 'normal');
        noteLines.slice(0, 2).forEach((line, index) => doc.text(line, MARGIN, top + 91 + index * 3.5));
    };

    y = drawFirstPageHeader();
    y = drawClientSummary(y);
    if (y + 8 + TABLE_HEADER_HEIGHT + CATEGORY_HEIGHT + SUBGROUP_HEIGHT + ITEM_MIN_HEIGHT > CONTENT_BOTTOM) {
        newTablePage();
    } else {
        y = drawTableHeader(y + 8);
    }

    model.sections.forEach(section => {
        const firstSubgroup = section.subgroups[0];
        const firstItems = firstSubgroup?.items.slice(0, 2) || [];
        const categoryKeepHeight = CATEGORY_HEIGHT
            + (firstSubgroup ? SUBGROUP_HEIGHT : 0)
            + firstItems.reduce((sum, item) => sum + itemKeepHeight(item), 0);
        if (y + categoryKeepHeight > CONTENT_BOTTOM) newTablePage();
        drawCategoryRow(section.category);

        section.subgroups.forEach((subgroup, subgroupIndex) => {
            const firstTwoHeight = subgroup.items.slice(0, 2).reduce((sum, item) => sum + itemKeepHeight(item), 0);
            const subgroupKeepHeight = SUBGROUP_HEIGHT + firstTwoHeight;
            if (y + subgroupKeepHeight > CONTENT_BOTTOM) {
                newTablePage();
                drawCategoryRow(section.category, true);
            }
            drawSubgroupRow(subgroup.name);

            subgroup.items.forEach((item, itemIndex) => {
                const isLastItem = subgroupIndex === section.subgroups.length - 1
                    && itemIndex === subgroup.items.length - 1;
                drawItem(
                    item,
                    section.category,
                    subgroup.name,
                    isLastItem ? sectionSummaryHeight(section) : 0,
                );
            });
        });

        const summaryHeight = sectionSummaryHeight(section);
        if (y + summaryHeight > CONTENT_BOTTOM) {
            newTablePage();
            drawCategoryRow(section.category, true);
        }
        drawSectionSummary(section);
    });

    const finalTop = y + 10;
    if (finalTop + FINAL_BLOCK_HEIGHT > CONTENT_BOTTOM) {
        newSummaryPage();
        y += 4;
    } else {
        y = finalTop;
    }
    drawFinalBlock(y);

    const pageCount = doc.getNumberOfPages();
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        doc.setPage(pageNumber);
        setDraw(doc, COLORS.line);
        doc.setLineWidth(0.3);
        doc.line(MARGIN, FOOTER_LINE_Y, PAGE_WIDTH - MARGIN, FOOTER_LINE_Y);
        setPdfFont('normal');
        doc.setFontSize(7.2);
        setText(doc, COLORS.muted);
        drawLinkedText('KARKASMASTER.RU', MARGIN, FOOTER_TEXT_Y, PREMIUM_PDF_LINKS.website);
        doc.text(`СМЕТА № ${safeText(estimate.estimateNumber)}`, PAGE_WIDTH / 2, FOOTER_TEXT_Y, { align: 'center' });
        doc.text(`${String(pageNumber).padStart(2, '0')} / ${String(pageCount).padStart(2, '0')}`, PAGE_WIDTH - MARGIN, FOOTER_TEXT_Y, { align: 'right' });
    }

    return doc;
};
