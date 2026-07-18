import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { loadPdfResources, PDF_FONT_NAME, registerPdfFont } from '../pdfUtils';
import { compareCuttingStages, getCuttingStageLabel } from './stageOrder';
import { CuttingItem, CuttingPlan, CuttingSettings } from './types';

export interface CuttingPdfInput {
    fileName: string;
    items: CuttingItem[];
    plan: CuttingPlan;
    settings: CuttingSettings;
}

type PdfWithTable = jsPDF & { lastAutoTable?: { finalY: number } };

const safeFileName = (value: string): string => value.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '_') || 'Раскрой';

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
    doc.text(`Режим: ${settings.separateStages ? 'не смешивать этапы' : 'максимальная экономия'}`, margin, 33);

    doc.setTextColor(17, 24, 39);
    let y = 39;
    if (plan.boardPurchase.length > 0) {
        autoTable(doc, {
            startY: y,
            head: [['Сечение', 'Длина заготовки', 'Количество', 'Объём, м³']],
            body: plan.boardPurchase.map(row => [
                row.section,
                `${row.stockLength} мм`,
                String(row.quantity),
                row.volumeM3.toFixed(3),
            ]),
            styles: { font, fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [46, 93, 65], font },
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
    doc.text('Очередность по этапам', margin, y);
    y += 3;

    const itemReferences = new Map<string, Set<string>>();
    plan.boards.forEach(board => board.cuts.forEach(cut => {
        const references = itemReferences.get(cut.itemId) ?? new Set<string>();
        references.add(board.id);
        itemReferences.set(cut.itemId, references);
    }));
    plan.sheets.forEach(sheet => sheet.parts.forEach(part => {
        const references = itemReferences.get(part.itemId) ?? new Set<string>();
        references.add(sheet.id);
        itemReferences.set(part.itemId, references);
    }));
    const queueRows = [...items]
        .sort((left, right) => compareCuttingStages(left.stage, right.stage)
            || left.construction.localeCompare(right.construction, 'ru')
            || left.length - right.length)
        .map(item => [
            getCuttingStageLabel(item.stage),
            item.construction,
            item.section,
            item.isSheet && item.width ? `${item.length}×${item.width}` : String(item.length),
            String(item.quantity),
            [...(itemReferences.get(item.id) ?? [])].join(', ') || '—',
        ]);
    autoTable(doc, {
        startY: y,
        head: [['Этап', 'Наименование', 'Сечение/материал', 'Размер, мм', 'Кол-во', 'Доски/листы']],
        body: queueRows,
        styles: { font, fontSize: 7.5, cellPadding: 1.8 },
        headStyles: { fillColor: [46, 93, 65], font },
        theme: 'striped',
    });

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
            `${pattern.wasteLength} мм`,
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
