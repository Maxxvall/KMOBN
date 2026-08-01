import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { loadPremiumPdfResources, PDF_FONT_NAME, registerPdfFont } from '../pdfUtils';
import {
    createPremiumPdfBrand,
    PREMIUM_PDF_COLORS,
    PREMIUM_PDF_PAGE,
} from '../premiumPdfBrand';
import {
    calculateRoomSheetLayout,
    RoomSheetLayout,
    SHEET_STOCK_PROFILES,
    SheetRoomInput,
} from './sheetRoom';

type PdfWithTable = jsPDF & { lastAutoTable?: { finalY: number } };

export interface SheetRoomPdfRow {
    room: SheetRoomInput;
    layout: RoomSheetLayout;
}

export const createSheetRoomPdfRows = (rooms: SheetRoomInput[]): SheetRoomPdfRow[] => rooms.flatMap(room => {
    const layout = calculateRoomSheetLayout(room.length, room.width, SHEET_STOCK_PROFILES[room.material]);
    return layout ? [{ room, layout }] : [];
});

export const generateSheetRoomPdf = async (rooms: SheetRoomInput[]): Promise<void> => {
    const rows = createSheetRoomPdfRows(rooms);
    if (!rows.length) throw new Error('Укажите длину и ширину хотя бы одного помещения.');

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
    const totalArea = rows.reduce((total, row) => total + row.layout.roomAreaM2, 0);
    const osbCount = rows.filter(row => row.room.material === 'osb').reduce((total, row) => total + row.layout.sheetCount, 0);
    const plywoodCount = rows.filter(row => row.room.material === 'plywood').reduce((total, row) => total + row.layout.sheetCount, 0);
    const totalSheets = osbCount + plywoodCount;
    const continuationMeta = 'Карта листовых материалов · OSB и фанера';

    doc.setProperties({
        title: 'Карта раскроя OSB и фанеры',
        subject: 'Схемы покрытия помещений листовыми материалами',
        author: 'Каркас Мастер',
        creator: 'Каркас Мастер',
        keywords: 'OSB, фанера, раскрой, листовые материалы, Каркас Мастер',
    });

    let y = brand.drawFirstPageHeader({
        eyebrow: 'Производственный документ',
        title: 'Карта листов',
        rightTop: 'OSB И ФАНЕРА',
        rightBottom: `${rows.length} помещений`,
    });

    const summaryHeight = 38;
    const leftWidth = 108;
    const gap = 6;
    const rightX = page.margin + leftWidth + gap;
    const rightWidth = page.contentWidth - leftWidth - gap;
    doc.setFont(font, 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(...colors.red);
    doc.text('ПАРАМЕТРЫ ЛИСТОВ', page.margin, y + 4);
    doc.setFontSize(10);
    doc.setTextColor(...colors.text);
    doc.text('OSB 2500×1250 мм', page.margin, y + 10);
    doc.text('Фанера 1525×1525 мм', page.margin, y + 16);
    doc.setFont(font, 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(...colors.muted);
    doc.text(`Общая площадь помещений ${totalArea.toFixed(2)} м²`, page.margin, y + 24);
    doc.text('Краевые остатки между помещениями не переносятся.', page.margin, y + 29);

    doc.setFillColor(...colors.graphiteSoft);
    doc.roundedRect(rightX, y, rightWidth, summaryHeight, 4, 4, 'F');
    doc.setFont(font, 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(...colors.red);
    doc.text('ИТОГО К ЗАКУПКЕ', rightX + 6, y + 8);
    doc.setFontSize(19);
    doc.setTextColor(...colors.white);
    doc.text(`${totalSheets} шт.`, rightX + 6, y + 20);
    doc.setFont(font, 'normal');
    doc.setFontSize(7.4);
    doc.text(`OSB ${osbCount} шт.`, rightX + 6, y + 27);
    doc.text(`Фанера ${plywoodCount} шт.`, rightX + 6, y + 32);
    y += summaryHeight + 8;

    y = brand.drawSectionBanner('Ведомость помещений', y, 'Площадь и количество листов рассчитаны отдельно для каждого помещения.');

    autoTable(doc, {
        startY: y,
        head: [['Помещение', 'Материал', 'Размер помещения', 'Площадь', 'Листов']],
        body: rows.map(({ room, layout }) => [
            room.name,
            SHEET_STOCK_PROFILES[room.material].label,
            `${room.length}×${room.width} мм`,
            `${layout.roomAreaM2.toFixed(2)} м²`,
            String(layout.sheetCount),
        ]),
        foot: [['Итого', '-', '-', `${totalArea.toFixed(2)} м²`, String(osbCount + plywoodCount)]],
        styles: { font, fontSize: 7.8, cellPadding: 2.1, textColor: colors.text, lineColor: colors.line, lineWidth: 0.2, valign: 'middle' },
        headStyles: { fillColor: colors.graphite, textColor: colors.white, font, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: colors.row },
        footStyles: { fillColor: colors.paleRed, textColor: colors.text, fontStyle: 'bold', font },
        columnStyles: { 0: { cellWidth: 54 }, 1: { cellWidth: 28 }, 2: { cellWidth: 45 }, 3: { cellWidth: 32 }, 4: { cellWidth: 23 } },
        margin: { left: page.margin, right: page.margin, top: 39, bottom: 21 },
        theme: 'grid',
        willDrawPage: (data) => {
            if (data.pageNumber > 1) brand.drawContinuationHeader(continuationMeta);
        },
    });

    rows.forEach(({ room, layout }, roomIndex) => {
        doc.addPage();
        let roomY = brand.drawContinuationHeader(continuationMeta);
        const profile = SHEET_STOCK_PROFILES[room.material];
        roomY = brand.drawSectionBanner(`${roomIndex + 1}. ${room.name}`, roomY, `${profile.label} · лист ${profile.length}×${profile.width} мм · помещение ${room.length}×${room.width} мм`);

        const cardGap = 4;
        const cardWidth = (page.contentWidth - cardGap * 2) / 3;
        const cardTop = roomY + 5;
        const cardHeight = 22;
        const cards = [
            ['ПЛОЩАДЬ', `${layout.roomAreaM2.toFixed(2)} м²`],
            ['КОЛИЧЕСТВО', `${layout.sheetCount} листов`],
            ['СЕТКА УКЛАДКИ', `${layout.columns} × ${layout.rows}`],
        ] as const;
        cards.forEach(([label, value], index) => {
            const x = page.margin + index * (cardWidth + cardGap);
            doc.setFillColor(...(index === 1 ? colors.graphiteSoft : colors.white));
            doc.roundedRect(x, cardTop, cardWidth, cardHeight, 3, 3, 'F');
            doc.setFont(font, 'bold');
            doc.setFontSize(6.5);
            doc.setTextColor(...colors.red);
            doc.text(label, x + 5, cardTop + 7);
            doc.setFontSize(12);
            doc.setTextColor(...(index === 1 ? colors.white : colors.text));
            doc.text(value, x + 5, cardTop + 16);
        });

        const diagramTop = cardTop + cardHeight + 9;
        const maxWidth = 170;
        const maxHeight = 178;
        const scale = Math.min(maxWidth / room.length, maxHeight / room.width);
        const drawWidth = room.length * scale;
        const drawHeight = room.width * scale;
        const originX = (page.width - drawWidth) / 2;
        const originY = diagramTop;
        doc.setDrawColor(...colors.graphite);
        doc.setFillColor(...colors.white);
        doc.setLineWidth(0.65);
        doc.rect(originX, originY, drawWidth, drawHeight, 'FD');

        if (layout.columns <= 100 && layout.rows <= 100) {
            doc.setDrawColor(...colors.red);
            doc.setLineWidth(0.32);
            for (let column = 1; column < layout.columns; column += 1) {
                const x = originX + Math.min(room.length, column * layout.sheetLength) * scale;
                doc.line(x, originY, x, originY + drawHeight);
            }
            for (let row = 1; row < layout.rows; row += 1) {
                const gridY = originY + Math.min(room.width, row * layout.sheetWidth) * scale;
                doc.line(originX, gridY, originX + drawWidth, gridY);
            }
        }

        doc.setFont(font, 'bold');
        doc.setFontSize(7.4);
        doc.setTextColor(...colors.muted);
        const noteY = Math.min(page.contentBottom - 2, originY + drawHeight + 7);
        doc.text(`Раскладка ${layout.sheetLength}×${layout.sheetWidth} мм${layout.rotated ? ' с поворотом листа' : ''}. Краевые обрезки ${layout.wasteAreaM2.toFixed(2)} м².`, page.margin, noteY);
    });

    brand.addFooters('Карта листов');

    doc.save('Раскрой_OSB_и_фанера.pdf');
};
