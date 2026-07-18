import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { loadPdfResources, PDF_FONT_NAME, registerPdfFont } from '../pdfUtils';
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

    const doc = new jsPDF({ unit: 'mm', format: 'a4' }) as PdfWithTable;
    const { fontBase64 } = await loadPdfResources();
    if (!fontBase64) throw new Error('Не удалось загрузить кириллический шрифт для PDF.');
    registerPdfFont(doc, fontBase64);
    if (!doc.getFontList()[PDF_FONT_NAME]) throw new Error('Не удалось зарегистрировать кириллический шрифт для PDF.');

    const font = PDF_FONT_NAME;
    const margin = 12;
    const pageWidth = doc.internal.pageSize.getWidth();
    const totalArea = rows.reduce((total, row) => total + row.layout.roomAreaM2, 0);
    const osbCount = rows.filter(row => row.room.material === 'osb').reduce((total, row) => total + row.layout.sheetCount, 0);
    const plywoodCount = rows.filter(row => row.room.material === 'plywood').reduce((total, row) => total + row.layout.sheetCount, 0);

    doc.setFont(font, 'bold');
    doc.setFontSize(18);
    doc.text('Раскрой OSB и фанеры', margin, 16);
    doc.setFont(font, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(75, 85, 99);
    doc.text(`Общая площадь: ${totalArea.toFixed(2)} м² · OSB: ${osbCount} листов · фанера: ${plywoodCount} листов`, margin, 23);
    doc.text('Форматы: OSB 2500×1250 мм · фанера 1525×1525 мм', margin, 28);
    doc.setTextColor(17, 24, 39);

    autoTable(doc, {
        startY: 34,
        head: [['Помещение', 'Материал', 'Размер помещения', 'Площадь', 'Листов']],
        body: rows.map(({ room, layout }) => [
            room.name,
            SHEET_STOCK_PROFILES[room.material].label,
            `${room.length}×${room.width} мм`,
            `${layout.roomAreaM2.toFixed(2)} м²`,
            String(layout.sheetCount),
        ]),
        foot: [['Итого', '-', '-', `${totalArea.toFixed(2)} м²`, String(osbCount + plywoodCount)]],
        styles: { font, fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [46, 93, 65], font },
        footStyles: { fillColor: [230, 235, 232], textColor: [17, 24, 39], fontStyle: 'bold', font },
        theme: 'grid',
    });

    rows.forEach(({ room, layout }, roomIndex) => {
        doc.addPage();
        const profile = SHEET_STOCK_PROFILES[room.material];
        doc.setFont(font, 'bold');
        doc.setFontSize(14);
        doc.text(`${roomIndex + 1}. ${room.name}`, margin, 16);
        doc.setFont(font, 'normal');
        doc.setFontSize(9);
        doc.text(`${profile.label} · лист ${profile.length}×${profile.width} мм · помещение ${room.length}×${room.width} мм`, margin, 22);
        doc.text(`Площадь ${layout.roomAreaM2.toFixed(2)} м² · нужно ${layout.sheetCount} листов · сетка ${layout.columns}×${layout.rows}`, margin, 27);

        const maxWidth = 180;
        const maxHeight = 225;
        const scale = Math.min(maxWidth / room.length, maxHeight / room.width);
        const drawWidth = room.length * scale;
        const drawHeight = room.width * scale;
        const originX = (pageWidth - drawWidth) / 2;
        const originY = 35;
        doc.setDrawColor(46, 93, 65);
        doc.setFillColor(239, 247, 242);
        doc.setLineWidth(0.5);
        doc.rect(originX, originY, drawWidth, drawHeight, 'FD');

        if (layout.columns <= 100 && layout.rows <= 100) {
            for (let column = 1; column < layout.columns; column += 1) {
                const x = originX + Math.min(room.length, column * layout.sheetLength) * scale;
                doc.line(x, originY, x, originY + drawHeight);
            }
            for (let row = 1; row < layout.rows; row += 1) {
                const y = originY + Math.min(room.width, row * layout.sheetWidth) * scale;
                doc.line(originX, y, originX + drawWidth, y);
            }
        }

        doc.setFontSize(8);
        doc.setTextColor(75, 85, 99);
        doc.text(`Раскладка ${layout.sheetLength}×${layout.sheetWidth} мм${layout.rotated ? ' с поворотом листа' : ''}. Краевые обрезки: ${layout.wasteAreaM2.toFixed(2)} м².`, margin, Math.min(286, originY + drawHeight + 8));
        doc.setTextColor(17, 24, 39);
    });

    doc.save('Раскрой_OSB_и_фанера.pdf');
};
