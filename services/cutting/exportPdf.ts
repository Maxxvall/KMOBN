import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { loadPdfResources, PDF_FONT_NAME, registerPdfFont } from '../pdfUtils';
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
    const doc = new jsPDF({ unit: 'mm', format: 'a4' }) as PdfWithTable;
    const { fontBase64 } = await loadPdfResources();
    if (!fontBase64) throw new Error('Не удалось загрузить кириллический шрифт для PDF.');
    registerPdfFont(doc, fontBase64);
    if (!doc.getFontList()[PDF_FONT_NAME]) throw new Error('Не удалось зарегистрировать кириллический шрифт для PDF.');
    const font = PDF_FONT_NAME;
    const margin = 12;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.setFont(font, 'bold');
    doc.setFontSize(18);
    doc.text('Карта оптимизированного раскроя', margin, 16);
    doc.setFont(font, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(75, 85, 99);
    doc.text(`Источник: ${fileName}`, margin, 23);
    doc.text(`Заготовка: ${settings.boardStockLength} мм · пропил: ${settings.boardKerf} мм · максимум детали: ${settings.maxBoardPartLength} мм`, margin, 28);

    doc.setTextColor(17, 24, 39);
    let y = 34;
    if (plan.boardPurchase.length > 0) {
        const totalQuantity = plan.boardPurchase.reduce((total, row) => total + row.quantity, 0);
        const totalVolume = plan.boardPurchase.reduce((total, row) => total + row.volumeM3, 0);
        const totalWaste = plan.boardPurchase.reduce((total, row) => total + row.wasteLength, 0);
        const totalLength = plan.boardPurchase.reduce((total, row) => total + row.stockLength * row.quantity, 0);
        autoTable(doc, {
            startY: y,
            head: [['Сечение', 'Длина заготовки', 'Количество', 'Объём, м³', 'Отход доски']],
            body: plan.boardPurchase.map(row => [
                row.section,
                `${row.stockLength} мм`,
                String(row.quantity),
                row.volumeM3.toFixed(3),
                `${(row.wasteLength / 1000).toFixed(2)} м · ${row.wastePercentage.toFixed(1)}%`,
            ]),
            foot: [['Итого', '-', `${totalQuantity} шт.`, `${totalVolume.toFixed(3)} м³`, `${(totalWaste / 1000).toFixed(2)} м · ${(totalLength ? totalWaste / totalLength * 100 : 0).toFixed(1)}%`]],
            styles: { font, fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [46, 93, 65], font },
            footStyles: { fillColor: [230, 235, 232], textColor: [17, 24, 39], fontStyle: 'bold', font },
            theme: 'grid',
        });
        y = (doc.lastAutoTable?.finalY ?? y) + 5;
    }
    if (plan.sheetPurchase.length > 0) {
        autoTable(doc, {
            startY: y,
            head: [['Листовой материал', 'Формат листа', 'Количество']],
            body: plan.sheetPurchase.map(row => [
                row.material,
                `${row.sheetWidth}×${row.sheetHeight} мм`,
                String(row.quantity),
            ]),
            styles: { font, fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [46, 93, 65], font },
            theme: 'grid',
        });
        y = (doc.lastAutoTable?.finalY ?? y) + 5;
    }

    y += 3;
    if (y > pageHeight - 25) {
        doc.addPage();
        y = 16;
    }
    doc.setFont(font, 'bold');
    doc.setFontSize(12);
    doc.text('Очередность по строительным блокам', margin, y);
    y += 5;

    for (const group of createCuttingPdfStageGroups(items)) {
        if (y > pageHeight - 28) {
            doc.addPage();
            y = 16;
        }
        doc.setFont(font, 'bold');
        doc.setFontSize(10);
        doc.text(`${group.label} · итого ${group.totalQuantity} шт.`, margin, y);
        autoTable(doc, {
            startY: y + 2,
            head: [['Наименование', 'Сечение', 'Размер, мм', 'Количество']],
            body: group.rows,
            styles: { font, fontSize: 7.5, cellPadding: 1.8 },
            headStyles: { fillColor: [46, 93, 65], font },
            theme: 'striped',
        });
        y = (doc.lastAutoTable?.finalY ?? y) + 5;
    }

    doc.addPage();
    doc.setFont(font, 'bold');
    doc.setFontSize(14);
    doc.text('Компактные карты досок', margin, 16);
    autoTable(doc, {
        startY: 21,
        head: [['Доски', 'Сечение', 'Резы', 'Остаток']],
        body: plan.patterns.map(pattern => [
            pattern.boardIds.join(', '),
            pattern.section,
            pattern.cuts.map(cut => `${cut.length} ${cut.construction}`).join(' + '),
            `${formatCuttingPdfMillimeters(pattern.wasteLength)} мм`,
        ]),
        styles: { font, fontSize: 7.5, cellPadding: 2, valign: 'middle' },
        headStyles: { fillColor: [46, 93, 65], font },
        columnStyles: { 0: { cellWidth: 27 }, 1: { cellWidth: 22 }, 3: { cellWidth: 21 } },
        theme: 'grid',
    });

    for (const sheet of plan.sheets) {
        doc.addPage();
        doc.setFont(font, 'bold');
        doc.setFontSize(13);
        doc.text(`${sheet.id} · ${sheet.material} · ${sheet.width}×${sheet.height} мм`, margin, 16);
        doc.setFont(font, 'normal');
        doc.setFontSize(9);
        doc.text(`Отход: ${sheet.wastePercentage.toFixed(1)}%`, pageWidth - margin, 16, { align: 'right' });

        const maxDrawWidth = 170;
        const maxDrawHeight = 245;
        const scale = Math.min(maxDrawWidth / sheet.width, maxDrawHeight / sheet.height);
        const drawWidth = sheet.width * scale;
        const drawHeight = sheet.height * scale;
        const originX = (pageWidth - drawWidth) / 2;
        const originY = 25;
        doc.setDrawColor(55, 65, 81);
        doc.setLineWidth(0.6);
        doc.rect(originX, originY, drawWidth, drawHeight);
        sheet.parts.forEach((part, index) => {
            doc.setFillColor(index % 2 === 0 ? 219 : 209, index % 2 === 0 ? 234 : 250, index % 2 === 0 ? 254 : 229);
            const x = originX + part.x * scale;
            const partY = originY + part.y * scale;
            const width = part.width * scale;
            const height = part.height * scale;
            doc.rect(x, partY, width, height, 'FD');
            doc.setFont(font, 'normal');
            doc.setFontSize(6.5);
            doc.text(`${part.width}×${part.height}`, x + 1, partY + 3, { maxWidth: Math.max(2, width - 2) });
        });
    }

    doc.save(`Раскрой_${safeFileName(fileName)}.pdf`);
};
