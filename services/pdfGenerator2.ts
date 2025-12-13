// @ts-nocheck
import { Estimate, EstimateSubgroup, EstimateCategory } from '../types';
import { ESTIMATE_CATEGORIES } from '../constants';
import LiberationFontUrl from '../assets/LiberationSans-Regular.ttf?url';
import logoUrl from '../logo/acetone-2025920-104546-498.png?url';

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
    }
    return btoa(binary);
}

export const generatePdf = async (estimate: Estimate) => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const FONT_NAME = 'LiberationSans';

    // --- Font Setup ---
    try {
        const resp = await fetch(LiberationFontUrl);
        const ab = await resp.arrayBuffer();
        const b64 = arrayBufferToBase64(ab);
        doc.addFileToVFS('LiberationSans-Regular.ttf', b64);
        doc.addFont('LiberationSans-Regular.ttf', 'LiberationSans', 'normal');
        doc.setFont(FONT_NAME, 'normal');
    } catch (e) {
        console.error('Failed to load LiberationSans font for PDF generation:', e);
    }

    // --- Logo Setup ---
    let logoBase64 = '';
    try {
        const logoResp = await fetch(logoUrl);
        const logoAb = await logoResp.arrayBuffer();
        logoBase64 = arrayBufferToBase64(logoAb);
    } catch (e) {
        console.error('Failed to load logo for PDF generation:', e);
    }

    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;

    // Keep track of decorated pages
    const drawnPages = new Set<number>();

    const drawPageDecor = (pageNumber: number) => {
        // Switch to target page
        try {
            doc.setPage(pageNumber);
        } catch (e) {}

        // --- BACKGROUND ---
        // Light green background (brand color #f8fff8)
        doc.setFillColor(248, 255, 248);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');

        // --- HEADER BAND (brand color #2e5d41) ---
        doc.setFillColor(46, 93, 65); // HEX #2e5d41
        doc.rect(0, 0, pageWidth, 40, 'F'); // 40mm high header band

        // --- HEADER CONTENT (white text on green band) ---
        doc.setTextColor(255, 255, 255); // White text
        doc.setFontSize(16);
        doc.setFont(FONT_NAME, 'normal');
        doc.text('Каркас Мастер', margin, 15);

        doc.setFontSize(9);
        doc.setFont(FONT_NAME, 'normal');
        doc.text('Строительство каркасных домов', margin, 22);
        doc.text('kmobn.ru', margin, 29);

        // --- COMPANY LOGO (30x30mm - matching simple PDF) ---
        if (logoBase64) {
            doc.addImage(
                logoBase64, 
                'PNG', 
                pageWidth - margin - 30,  // X position
                6,                        // Y position
                30,                       // Width (mm)
                30                        // Height (mm)
            );
        }

        // --- WATERMARK (subtle brand reinforcement) ---
        if (logoBase64 && pageNumber === 1) {
            doc.addImage(
                logoBase64, 
                'PNG', 
                pageWidth / 2 - 50, 
                pageHeight / 2 - 15, 
                100, 
                30, 
                undefined, 
                'FAST', 
                0.05 // 5% opacity
            );
        }

        // --- CLIENT INFO (only on first page) ---
        if (pageNumber === 1) {
            doc.setTextColor(0, 0, 0); // Black text
            doc.setFontSize(10);
            doc.setFont(FONT_NAME, 'normal');
            doc.text(`Подготовлено для: ${estimate.client}`, margin, 50);
            doc.text(`Вид строения: ${estimate.buildingType}, Площадь: ${estimate.area} м²`, pageWidth - margin, 50, { align: 'right' });

            // --- ESTIMATE TITLE ---
            doc.setFontSize(26);
            doc.setFont(FONT_NAME, 'normal');
            doc.text('СМЕТА', pageWidth / 2, 68, { align: 'center' });
            
            doc.setFontSize(12);
            doc.text(`№ ${estimate.estimateNumber} от ${new Date(estimate.date).toLocaleDateString('ru-RU')}`, pageWidth / 2, 76, { align: 'center' });
        }
    };

    // --- TABLE BODY ---
    const tableBody = [];

    const safeTotal = (item) => item.total ?? item.quantity * item.price;
    const worksTotal = estimate.items.reduce((sum, item) => {
        const value = safeTotal(item);
        return sum + ((item.subgroup || EstimateSubgroup.WORKS) === EstimateSubgroup.WORKS ? value : 0);
    }, 0);
    const materialsTotal = estimate.items.reduce((sum, item) => {
        const value = safeTotal(item);
        return sum + (item.subgroup === EstimateSubgroup.MATERIALS ? value : 0);
    }, 0);
    const deliveryTotal = estimate.items.reduce((sum, item) => {
        const value = safeTotal(item);
        return sum + (item.subgroup === EstimateSubgroup.DELIVERY ? value : 0);
    }, 0);

    ESTIMATE_CATEGORIES.forEach((category) => {
        const itemsInCategory = estimate.items.filter(item => item.category === category);
        if (itemsInCategory.length > 0) {
            // Category Header
            tableBody.push([{ 
                content: category, 
                colSpan: 5, 
                styles: { 
                    font: FONT_NAME, 
                    fontStyle: 'normal', 
                    fillColor: [46, 93, 65], // #2e5d41
                    textColor: [255, 255, 255],
                    halign: 'center' 
                } 
            }]);
            const categoryTotal = itemsInCategory.reduce((sum, it) => sum + (it.total || it.quantity * it.price), 0);
            const worksTotal = itemsInCategory.filter(i => (i.subgroup || EstimateSubgroup.WORKS) === EstimateSubgroup.WORKS).reduce((sum, it) => sum + (it.total || it.quantity * it.price), 0);
            const materialsTotal = itemsInCategory.filter(i => i.subgroup === EstimateSubgroup.MATERIALS).reduce((sum, it) => sum + (it.total || it.quantity * it.price), 0);
            const deliveryTotal = itemsInCategory.filter(i => i.subgroup === EstimateSubgroup.DELIVERY).reduce((sum, it) => sum + (it.total || it.quantity * it.price), 0);

            const subgroupList = category === EstimateCategory.LOGISTICS ? [EstimateSubgroup.WORKS, EstimateSubgroup.DELIVERY] : [EstimateSubgroup.WORKS, EstimateSubgroup.MATERIALS];
            subgroupList.forEach(subgroup => {
                const subItems = itemsInCategory.filter(i => (i.subgroup || EstimateSubgroup.WORKS) === subgroup);
                if (subItems.length === 0) return;
                const subTotal = subItems.reduce((s, it) => s + (it.total || it.quantity * it.price), 0);

                // Subgroup header
                tableBody.push([{ 
                    content: subgroup, 
                    colSpan: 5, 
                    styles: { 
                        font: FONT_NAME, 
                        fontStyle: 'normal', 
                        fillColor: [27, 94, 32], // #1b5e20
                        textColor: [255, 255, 255],
                        halign: 'left' 
                    } 
                }]);

                subItems.forEach(item => {
                    tableBody.push([
                        item.name,
                        item.unit,
                        item.quantity.toLocaleString('ru-RU', {minimumFractionDigits: 0, maximumFractionDigits: 2}),
                        item.price.toLocaleString('ru-RU') + ' ₽',
                        item.total.toLocaleString('ru-RU') + ' ₽'
                    ]);
                });

                // (removed subgroup total row - totals will be shown as summary at block end)
            });
            // At end of category block: show the gray summary line (moved here)
            const breakdownText = category === EstimateCategory.LOGISTICS
                ? `Итого по разделу: ${categoryTotal.toLocaleString('ru-RU')} ₽ (Работы: ${worksTotal.toLocaleString('ru-RU')} ₽, Доставка: ${deliveryTotal.toLocaleString('ru-RU')} ₽)`
                : `Итого по разделу: ${categoryTotal.toLocaleString('ru-RU')} ₽ (Работы: ${worksTotal.toLocaleString('ru-RU')} ₽, Материалы: ${materialsTotal.toLocaleString('ru-RU')} ₽)`;
            tableBody.push([{ 
                content: breakdownText, 
                colSpan: 5, 
                styles: {
                    font: FONT_NAME,
                    fontStyle: 'normal',
                    fillColor: [74, 78, 84],
                    textColor: [247, 249, 249],
                    halign: 'left'
                }
            }]);
        }
    });

    // --- AUTO TABLE GENERATION ---
    const availablePageWidth = pageWidth - margin * 2;
    const colWidthsFixed = [15, 20, 25, 28];
    const fixedSum = colWidthsFixed.reduce((s, v) => s + v, 0);
    const firstColWidth = Math.max(availablePageWidth - fixedSum - 2, 40);

    doc.autoTable({
        startY: 85, // Adjusted for new header height
        margin: { top: 45, left: margin, right: margin, bottom: 15 }, // Увеличен top margin для второй страницы
        head: [['Наименование работ/материалов', 'Ед. изм.', 'Кол-во', 'Цена за ед.', 'Сумма']],
        body: tableBody,
        theme: 'grid',
        tableWidth: availablePageWidth,
        showHead: 'everyPage', // Показывать заголовок на каждой странице
        rowPageBreak: 'avoid', // Избегать разрыва строк между страницами
        styles: {
            font: FONT_NAME,
            fontStyle: 'normal',
            fontSize: 8,
            cellPadding: { top: 1.2, right: 2, bottom: 1.2, left: 2 },
            minCellHeight: 6,
            overflow: 'linebreak',
        },
        headStyles: { 
            font: FONT_NAME,
            fontSize: 9,
            fillColor: [232, 245, 233], // #e8f5e9
            textColor: [27, 94, 32],     // #1b5e20
            fontStyle: 'normal',
            halign: 'center'
        },
        alternateRowStyles: { 
            fillColor: [241, 248, 233] // #f1f8e9
        },
        columnStyles: {
            0: { cellWidth: firstColWidth },
            1: { cellWidth: colWidthsFixed[0], halign: 'center' },
            2: { halign: 'right', cellWidth: colWidthsFixed[1] },
            3: { halign: 'right', cellWidth: colWidthsFixed[2] },
            4: { halign: 'right', cellWidth: colWidthsFixed[3] },
        },
        willDrawCell: (data) => {
            try {
                if (!drawnPages.has(data.pageNumber)) {
                    drawPageDecor(data.pageNumber);
                    drawnPages.add(data.pageNumber);
                }

                if (data.row && data.row.section === 'body') {
                    const cell = data.cell || {};
                    const raw = cell.raw || {};
                    const colSpan = raw.colSpan ?? cell.colSpan ?? 1;
                    const styles = raw.styles ?? cell.styles ?? {};

                    if (colSpan > 1 && styles.fillColor) {
                        let fill = styles.fillColor;
                        if (typeof fill === 'string') {
                            const hex = fill.replace('#', '');
                            if (hex.length === 6) {
                                fill = [
                                    parseInt(hex.substring(0, 2), 16),
                                    parseInt(hex.substring(2, 4), 16),
                                    parseInt(hex.substring(4, 6), 16),
                                ];
                            } else {
                                fill = [220, 220, 220];
                            }
                        }

                        let spanWidth = 0;
                        const startColIndex = data.column.index;
                        for (let i = startColIndex; i < startColIndex + colSpan; i++) {
                            const col = data.table.columns[i];
                            if (col && typeof col.width === 'number') spanWidth += col.width;
                            else spanWidth += (availablePageWidth / data.table.columns.length);
                        }
                        if (!spanWidth || spanWidth < 1) spanWidth = availablePageWidth;

                        doc.setFillColor(Array.isArray(fill) ? fill : [220, 220, 220]);
                        doc.rect(cell.x, cell.y, spanWidth, cell.height, 'F');
                    }
                }
            } catch (e) {
                // ignore
            }
        },
        didDrawPage: (data) => {
            // --- FOOTER ---
            const pageCount = doc.internal.getNumberOfPages();
            doc.setFont(FONT_NAME, 'normal');
            doc.setFontSize(8);
            doc.setTextColor(100);
            doc.text(`Страница ${data.pageNumber} из ${pageCount}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
            doc.text('Смета создана в системе "Каркас Мастер"', margin, pageHeight - 10);
        }
    });

    // --- Final Breakdown Block ---
    const tableEndY = doc.autoTable.previous ? doc.autoTable.previous.finalY : 0;
    const breakdownBlockHeight = 44;
    let blockStartY = tableEndY + 15;
    if (blockStartY + breakdownBlockHeight > pageHeight - margin) {
        doc.addPage();
        const newPageNumber = doc.internal.getNumberOfPages();
        drawPageDecor(newPageNumber);
        drawnPages.add(newPageNumber);
        blockStartY = 40;
    }

    const blockX = margin;
    const blockWidth = pageWidth - margin * 2;
    // Use light green block with dark green text to match estimate theme
    doc.setFillColor(220, 237, 200); // #dcedc8
    doc.roundedRect(blockX, blockStartY, blockWidth, breakdownBlockHeight, 4, 4, 'F');

    doc.setFont(FONT_NAME, 'normal');
    doc.setFontSize(10);
    doc.setTextColor(51, 105, 30); // #33691e
    const breakdownLines = [
        { label: 'Работы', value: worksTotal },
        { label: 'Материалы', value: materialsTotal },
        { label: 'Доставка', value: deliveryTotal },
    ];
    let detailY = blockStartY + 10;
    breakdownLines.forEach(line => {
        doc.text(`${line.label}: ${line.value.toLocaleString('ru-RU')} ₽`, blockX + 8, detailY);
        detailY += 7;
    });

    // Draw total left-aligned under the breakdown lines (use normal font; emulate bold)
    doc.setFont(FONT_NAME, 'normal');
    doc.setFontSize(14);
    const totalText = `ОБЩИЙ ИТОГ: ${estimate.total.toLocaleString('ru-RU')} ₽`;
    const totalX = blockX + 8;
    const totalY = blockStartY + breakdownBlockHeight - 8;
    doc.text(totalText, totalX + 0.2, totalY + 0.2);
    doc.text(totalText, totalX, totalY);

    // --- SAVE PDF ---
    doc.save(`Смета_${estimate.estimateNumber}_${estimate.client}.pdf`);
};