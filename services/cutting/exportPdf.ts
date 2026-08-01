import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { loadPremiumPdfResources, PDF_FONT_NAME, registerPdfFont } from '../pdfUtils';
import {
    createPremiumPdfBrand,
    PREMIUM_PDF_COLORS,
    PREMIUM_PDF_PAGE,
} from '../premiumPdfBrand';
import { compareCuttingStages, getCuttingStageLabel } from './stageOrder';
import { CUTTING_STAGE_ORDER, CuttingItem, CuttingPlan, CuttingSettings, CuttingStageId } from './types';

export interface CuttingPdfInput {
    fileName: string;
    items: CuttingItem[];
    plan: CuttingPlan;
    settings: CuttingSettings;
}

type PdfWithTable = jsPDF & { lastAutoTable?: { finalY: number } };

const safeFileName = (value: string): string => value.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '_') || 'Раскрой';
const pdfNumberFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

export const formatCuttingPdfMillimeters = (value: number): string => pdfNumberFormatter.format(value);

export const createCuttingPdfQueueRows = (items: CuttingItem[]): string[][] => [...items]
    .sort((left, right) => compareCuttingStages(left.stage, right.stage)
        || left.construction.localeCompare(right.construction, 'ru')
        || left.length - right.length)
    .map(item => [
        item.construction,
        item.section,
        item.isSheet && item.width ? `${item.length}×${item.width}` : String(item.length),
        String(item.quantity),
    ]);

export const createCuttingPdfStageGroups = (items: CuttingItem[]): Array<{
    stage: CuttingStageId;
    label: string;
    totalQuantity: number;
    rows: string[][];
}> => CUTTING_STAGE_ORDER.map(stage => {
    const stageItems = items.filter(item => item.stage === stage);
    return {
        stage,
        label: getCuttingStageLabel(stage),
        totalQuantity: stageItems.reduce((total, item) => total + item.quantity, 0),
        rows: createCuttingPdfQueueRows(stageItems),
    };
}).filter(group => group.rows.length > 0);

export const generateCuttingPdf = async ({ fileName, items, plan, settings }: CuttingPdfInput): Promise<void> => {
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
        putOnlyUsedFonts: true,
    }) as PdfWithTable;
    const { fontBase64, boldFontBase64 } = await loadPremiumPdfResources();
    if (!fontBase64) throw new Error('Не удалось загрузить кириллический шрифт для PDF.');
    registerPdfFont(doc, fontBase64, boldFontBase64);
    if (!doc.getFontList()[PDF_FONT_NAME]) throw new Error('Не удалось зарегистрировать кириллический шрифт для PDF.');
    const font = PDF_FONT_NAME;
    const brand = createPremiumPdfBrand(doc, font);
    const colors = PREMIUM_PDF_COLORS;
    const page = PREMIUM_PDF_PAGE;
    const sourceLabel = fileName.length > 34 ? `${fileName.slice(0, 31)}...` : fileName;
    const continuationMeta = `Карта раскроя · ${sourceLabel}`;
    const totalQuantity = plan.boardPurchase.reduce((total, row) => total + row.quantity, 0);
    const totalVolume = plan.boardPurchase.reduce((total, row) => total + row.volumeM3, 0);
    const totalWaste = plan.boardPurchase.reduce((total, row) => total + row.wasteLength, 0);
    const totalLength = plan.boardPurchase.reduce((total, row) => total + row.stockLength * row.quantity, 0);
    const totalWastePercentage = totalLength ? totalWaste / totalLength * 100 : 0;

    doc.setProperties({
        title: `Карта раскроя - ${fileName}`,
        subject: 'Оптимизированный раскрой пиломатериала',
        author: 'Каркас Мастер',
        creator: 'Каркас Мастер',
        keywords: 'раскрой, пиломатериал, производство, Каркас Мастер',
    });

    const tableBase = (continuationTop = 39) => ({
        styles: {
            font,
            fontSize: 7.7,
            cellPadding: 2.1,
            textColor: colors.text,
            lineColor: colors.line,
            lineWidth: 0.2,
            valign: 'middle' as const,
            overflow: 'linebreak' as const,
        },
        headStyles: { fillColor: colors.graphite, textColor: colors.white, font, fontStyle: 'bold' as const },
        alternateRowStyles: { fillColor: colors.row },
        margin: { left: page.margin, right: page.margin, top: continuationTop, bottom: 21 },
        theme: 'grid' as const,
        willDrawPage: (data: { pageNumber: number }) => {
            if (data.pageNumber > 1) brand.drawContinuationHeader(continuationMeta);
        },
    });

    let y = brand.drawFirstPageHeader({
        eyebrow: 'Производственный документ',
        title: 'Карта раскроя',
        rightTop: 'ОПТИМИЗИРОВАНО',
        rightBottom: sourceLabel,
    });

    const summaryHeight = 38;
    const leftWidth = 108;
    const gap = 6;
    const rightX = page.margin + leftWidth + gap;
    const rightWidth = page.contentWidth - leftWidth - gap;
    doc.setFont(font, 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(...colors.red);
    doc.text('ИСХОДНЫЕ ДАННЫЕ', page.margin, y + 4);
    doc.setFontSize(10);
    doc.setTextColor(...colors.text);
    doc.text(sourceLabel, page.margin, y + 10, { maxWidth: leftWidth - 2 });
    doc.setFont(font, 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(...colors.muted);
    doc.text(`Заготовка ${formatCuttingPdfMillimeters(settings.boardStockLength)} мм · пропил ${formatCuttingPdfMillimeters(settings.boardKerf)} мм`, page.margin, y + 17);
    doc.text(`Максимум детали ${formatCuttingPdfMillimeters(settings.maxBoardPartLength)} мм · полезный остаток от ${formatCuttingPdfMillimeters(settings.usefulOffcutLength)} мм`, page.margin, y + 22);
    doc.text(settings.separateStages ? 'Режим: отдельные доски по строительным блокам' : 'Режим: максимальная экономия материала', page.margin, y + 27);

    doc.setFillColor(...colors.graphiteSoft);
    doc.roundedRect(rightX, y, rightWidth, summaryHeight, 4, 4, 'F');
    doc.setFont(font, 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(...colors.red);
    doc.text('ВЕДОМОСТЬ ЗАКУПКИ', rightX + 6, y + 8);
    doc.setFontSize(19);
    doc.setTextColor(...colors.white);
    doc.text(`${totalQuantity} шт.`, rightX + 6, y + 20);
    doc.setFont(font, 'normal');
    doc.setFontSize(7.4);
    doc.text(`Объём ${totalVolume.toFixed(3)} м³`, rightX + 6, y + 27);
    doc.text(`Отход ${formatCuttingPdfMillimeters(totalWaste / 1000)} м · ${formatCuttingPdfMillimeters(totalWastePercentage)}%`, rightX + 6, y + 32);
    y += summaryHeight + 8;

    y = brand.drawSectionBanner('Ведомость закупки', y, 'Количество целых досок, объём закупки и отход по каждому сечению.');
    autoTable(doc, {
        startY: y,
        head: [['Сечение', 'Заготовка', 'Количество', 'Объём, м³', 'Отход']],
        body: plan.boardPurchase.map(row => [
            row.section,
            `${formatCuttingPdfMillimeters(row.stockLength)} мм`,
            `${row.quantity} шт.`,
            row.volumeM3.toFixed(3),
            `${formatCuttingPdfMillimeters(row.wasteLength / 1000)} м · ${formatCuttingPdfMillimeters(row.wastePercentage)}%`,
        ]),
        foot: [['ИТОГО', '-', `${totalQuantity} шт.`, totalVolume.toFixed(3), `${formatCuttingPdfMillimeters(totalWaste / 1000)} м · ${formatCuttingPdfMillimeters(totalWastePercentage)}%`]],
        footStyles: { fillColor: colors.paleRed, textColor: colors.text, font, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 32 }, 2: { cellWidth: 29 }, 3: { cellWidth: 33 }, 4: { cellWidth: 54 } },
        ...tableBase(),
    });

    doc.addPage();
    y = brand.drawContinuationHeader(continuationMeta);
    y = brand.drawSectionBanner('Компактные карты досок', y, 'Одинаковые схемы объединены. Сначала выполняется карта резов, затем сверяется назначение деталей.');
    autoTable(doc, {
        startY: y,
        head: [['Доски', 'Сечение', 'Карта резов', 'Остаток']],
        body: plan.patterns.map(pattern => [
            pattern.boardIds.join(', '),
            pattern.section,
            pattern.cuts.map(cut => `${formatCuttingPdfMillimeters(cut.length)} ${cut.construction}`).join(' + '),
            `${formatCuttingPdfMillimeters(pattern.wasteLength)} мм`,
        ]),
        columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 24 }, 2: { cellWidth: 108 }, 3: { cellWidth: 22 } },
        ...tableBase(39),
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 8;

    if (y > page.contentBottom - 26) {
        doc.addPage();
        y = brand.drawContinuationHeader(continuationMeta);
    }
    y = brand.drawSectionBanner('Очередность по строительным блокам', y, 'Позиции отсортированы снизу вверх по этапам строительства.');
    const manuallyStartedContinuationPages = new Set<number>();

    for (const group of createCuttingPdfStageGroups(items)) {
        if (y > page.contentBottom - 26) {
            doc.addPage();
            manuallyStartedContinuationPages.add(doc.getNumberOfPages());
            y = brand.drawContinuationHeader(continuationMeta);
            y = brand.drawSectionBanner('Очередность по строительным блокам', y, 'Продолжение производственной ведомости.');
        }
        doc.setFillColor(...colors.paleRed);
        doc.rect(page.margin, y, page.contentWidth, 8, 'F');
        doc.setFillColor(...colors.red);
        doc.rect(page.margin, y, 2.4, 8, 'F');
        doc.setFont(font, 'bold');
        doc.setFontSize(8.3);
        doc.setTextColor(...colors.red);
        doc.text(group.label, page.margin + 5, y + 5.3);
        doc.setTextColor(...colors.text);
        doc.text(`ИТОГО ${group.totalQuantity} ШТ.`, page.width - page.margin - 4, y + 5.3, { align: 'right' });
        const groupTop = y + 8;
        autoTable(doc, {
            startY: groupTop,
            head: [['Наименование', 'Сечение', 'Размер, мм', 'Количество']],
            body: group.rows,
            columnStyles: { 0: { cellWidth: 92 }, 1: { cellWidth: 31 }, 2: { cellWidth: 31 }, 3: { cellWidth: 28 } },
            ...tableBase(47),
            willDrawPage: (data: { pageNumber: number }) => {
                if (data.pageNumber <= 1) return;
                let continuationY = brand.drawContinuationHeader(continuationMeta);
                continuationY = brand.drawSectionBanner('Очередность по строительным блокам', continuationY, 'Продолжение производственной ведомости.');
                doc.setFillColor(...colors.paleRed);
                doc.rect(page.margin, continuationY, page.contentWidth, 8, 'F');
                doc.setFillColor(...colors.red);
                doc.rect(page.margin, continuationY, 2.4, 8, 'F');
                doc.setFont(font, 'bold');
                doc.setFontSize(8.3);
                doc.setTextColor(...colors.red);
                doc.text(`${group.label} · ПРОДОЛЖЕНИЕ`, page.margin + 5, continuationY + 5.3);
            },
        });
        y = (doc.lastAutoTable?.finalY ?? groupTop) + 5;
    }

    const finalPage = doc.getCurrentPageInfo().pageNumber;
    manuallyStartedContinuationPages.forEach(pageNumber => {
        doc.setPage(pageNumber);
        brand.overlayContinuationHeader(continuationMeta);
    });
    doc.setPage(finalPage);
    brand.addFooters('Карта раскроя');

    doc.save(`Раскрой_${safeFileName(fileName)}.pdf`);
};
