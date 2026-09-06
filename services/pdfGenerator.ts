// @ts-nocheck
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Estimate, EstimateSubgroup, EstimateCategory } from '../types';
import { getEstimateCategories, getSectionLabel, getSectionSubgroups } from './estimateSections';
import { loadPdfResources, PDF_FONT_NAME, registerPdfFont } from './pdfUtils';

export const generatePdf = async (estimate: Estimate) => {
    const doc = new jsPDF();
    const FONT_NAME = PDF_FONT_NAME;
    const { fontBase64, logoBase64 } = await loadPdfResources();
    registerPdfFont(doc, fontBase64);

    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;

    // We'll draw background/header/footer per page when the table is being drawn.
    // Keep track of which pages we've already decorated.
    const drawnPages = new Set<number>();

    const drawPageDecor = (pageNumber: number) => {
        // Ensure we're drawing on the correct page
        try {
            doc.setPage(pageNumber);
        } catch {
            // setPage might fail in some older jspdf builds; ignore safely
        }

        // --- Background ---
        doc.setFillColor(255, 255, 255); // БЕЛЫЙ фон вместо серого
        doc.rect(0, 0, pageWidth, pageHeight, 'F');

    // --- Header ---
    doc.setFontSize(20);
    doc.setFont(FONT_NAME, 'normal');
        doc.setTextColor(0); // Black color for company name
        doc.text('Каркас Мастер', margin, 20);
        doc.setTextColor(0);

        // Add logo if available (LOGO_BASE64 or logoBase64)
        try {
            if (typeof LOGO_BASE64 === 'string' && LOGO_BASE64.length > 100) {
                doc.addImage(LOGO_BASE64, 'PNG', pageWidth - margin - 30, 6, 30, 30);
            } else if (typeof logoBase64 === 'string' && logoBase64.length > 100) {
                doc.addImage(logoBase64, 'PNG', pageWidth - margin - 30, 6, 30, 30);
            }
        } catch (e) {
            // ignore image drawing errors
            console.warn('Logo drawing failed on page', pageNumber, e);
        }

    doc.setFontSize(10);
    doc.setFont(FONT_NAME, 'normal');
    doc.text('Строительство каркасных домов', margin, 26);
    doc.text('karkasmaster.ru', margin, 32);

    doc.setLineWidth(1);
    doc.setDrawColor(100, 100, 100); // gray line
    doc.line(margin, 36, pageWidth - margin, 36);

    // Add centered title under the line and client info only on the first page
    if (pageNumber === 1) {
        doc.setFontSize(26);
        doc.setFont(FONT_NAME, 'normal');
        doc.text('СМЕТА', pageWidth / 2, 50, { align: 'center' });
        doc.setFontSize(10);
        doc.setFont(FONT_NAME, 'normal');
        doc.text(`№ ${estimate.estimateNumber} от ${new Date(estimate.date).toLocaleDateString('ru-RU')}`, pageWidth / 2, 56, { align: 'center' });

        // --- Client Info ---
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.setFont(FONT_NAME, 'normal');
        doc.text(`Подготовлено для: ${estimate.client}`, margin, 62);
        doc.text(`Вид строения: ${estimate.buildingType}, Площадь: ${estimate.area} м²`, pageWidth - margin, 62, { align: 'right' });
    }
    };

    // --- Header ---
    doc.setFontSize(20);
    doc.setFont(FONT_NAME, 'bold');
    doc.setTextColor(0); // Black color for company name
    doc.text('Каркас Мастер', margin, 20);
    doc.setTextColor(0); // Reset to black

    // Add logo
    if (logoBase64) {
        doc.addImage(logoBase64, 'PNG', pageWidth - margin - 30, 6, 30, 30);
    }

    doc.setFontSize(10);
    doc.setFont(FONT_NAME, 'normal');
    doc.text('Строительство каркасных домов', margin, 26);

    doc.setLineWidth(1);
    doc.setDrawColor(100, 100, 100); // gray line
    doc.line(margin, 46, pageWidth - margin, 46);

    // --- Client Info ---
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('Подготовлено для:', margin, 70);
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.setFont(FONT_NAME, 'bold');
    doc.text(estimate.client, margin + 50, 70);
    doc.text(`Вид строения: ${estimate.buildingType}, Площадь: ${estimate.area} м²`, pageWidth - margin, 70, { align: 'right' });


    // --- Table Body ---
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
    // Add column headers
    tableBody.push([
        { content: 'Наименование', styles: { font: FONT_NAME, fontStyle: 'bold', halign: 'center' } },
        { content: 'Ед. изм', styles: { font: FONT_NAME, fontStyle: 'bold', halign: 'center' } },
        { content: 'Кол-во', styles: { font: FONT_NAME, fontStyle: 'bold', halign: 'center' } },
        { content: 'Цена', styles: { font: FONT_NAME, fontStyle: 'bold', halign: 'center' } },
        { content: 'Стоимость', styles: { font: FONT_NAME, fontStyle: 'bold', halign: 'center' } }
    ]);

    getEstimateCategories(estimate.items, estimate.selectedSections, estimate.sectionSnapshot).forEach((category) => {
        const itemsInCategory = estimate.items.filter(item => item.category === category);
        if (itemsInCategory.length > 0) {
            // Category Header
            tableBody.push([{ 
                content: getSectionLabel(category, estimate.sectionSnapshot),
                colSpan: 5, 
                styles: { 
                    font: FONT_NAME, 
                    fontStyle: 'bold', 
                    fillColor: '#2e5d41', // ТЕМНО-ЗЕЛЕНЫЙ фон (#2e5d41)
                    textColor: '#FFFFFF',  // БЕЛЫЙ текст
                    halign: 'center' 
                } 
            }]);

            const categoryTotal = itemsInCategory.reduce((sum, it) => sum + (it.total || it.quantity * it.price), 0);
            const worksTotal = itemsInCategory.filter(i => (i.subgroup || EstimateSubgroup.WORKS) === EstimateSubgroup.WORKS).reduce((sum, it) => sum + (it.total || it.quantity * it.price), 0);
            const materialsTotal = itemsInCategory.filter(i => i.subgroup === EstimateSubgroup.MATERIALS).reduce((sum, it) => sum + (it.total || it.quantity * it.price), 0);
            const deliveryTotal = itemsInCategory.filter(i => i.subgroup === EstimateSubgroup.DELIVERY).reduce((sum, it) => sum + (it.total || it.quantity * it.price), 0);

            const subgroupList = getSectionSubgroups(category, itemsInCategory);
            subgroupList.forEach(subgroup => {
                const subItems = itemsInCategory.filter(i => (i.subgroup || EstimateSubgroup.WORKS) === subgroup);
                if (subItems.length === 0) return;
                // Subgroup header
                tableBody.push([{ 
                    content: subgroup, 
                    colSpan: 5, 
                    styles: { 
                        font: FONT_NAME, 
                        fontStyle: 'bold', 
                        fillColor: '#1b5e20', // ТЕМНЕЕ-ЗЕЛЕНЫЙ фон (#1b5e20)
                        textColor: '#FFFFFF',  // БЕЛЫЙ текст
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
                    fontStyle: 'bold',
                    fillColor: '#4a4e54',
                    textColor: '#f7f9f9',
                    halign: 'left'
                }
            }]);
        }
    });

    // Grand Total
    tableBody.push([{ 
        content: `ОБЩИЙ ИТОГ: ${estimate.total.toLocaleString('ru-RU')} Рублей`, 
        colSpan: 5, 
        styles: { 
            font: FONT_NAME, 
            fontStyle: 'bold', 
            fillColor: '#dcedc8', // СВЕТЛО-ЗЕЛЕНЫЙ фон (#dcedc8)
            textColor: '#33691e',  // ТЕМНО-ЗЕЛЕНЫЙ текст (#33691e)
            halign: 'right' 
        } 
    }]);

    // --- AutoTable Generation ---
    // compute table widths to ensure table fits the page
    const availablePageWidth = pageWidth - margin * 2;
    // keep these numeric widths for numeric columns (in same units as jsPDF page width)
    const colWidthsFixed = [15, 20, 25, 28]; // cols 1..4 fixed widths
    const fixedSum = colWidthsFixed.reduce((s, v) => s + v, 0);
    // small safety gap of 2 units to account for borders/padding
    const firstColWidth = Math.max(availablePageWidth - fixedSum - 2, 40);

    doc.setDrawColor(100, 100, 100); // gray for table lines

    autoTable(doc, {
        // Сделаем общий верхний отступ, чтобы таблица на всех страницах
        // начиналась ниже шапки/логотипа и не заходила на логотип на 2-й странице
        startY: 55,
        margin: { top: 30, left: margin, right: margin },
        head: [['Наименование работ/материалов', 'Ед. изм.', 'Кол-во', 'Цена за ед.', 'Сумма']],
        body: tableBody,
        theme: 'grid',
        tableWidth: availablePageWidth,
        styles: {
            font: FONT_NAME,
            fontStyle: 'normal',
            // Меньший размер шрифта для компактности
            fontSize: 8,
            // Уменьшаем внутренние отступы в ячейках: сверху/снизу — меньше, слева/справа — чуть побольше
            cellPadding: { top: 1.2, right: 2, bottom: 1.2, left: 2 },
            // Минимальная высота ячейки, чтобы строки были ровными и компактными
            minCellHeight: 6,
            overflow: 'linebreak',
        },
        headStyles: { 
            font: FONT_NAME,
            // Сделаем заголовки чуть компактнее по высоте
            fontSize: 9,
            fillColor: '#e8f5e9', // СВЕТЛО-ЗЕЛЕНЫЙ фон (#e8f5e9)
            textColor: '#1b5e20',  // ТЕМНО-ЗЕЛЕНЫЙ текст (#1b5e20)
            fontStyle: 'normal',
            halign: 'center'
        },
        alternateRowStyles: { 
            fillColor: [241, 248, 233] // СВЕТЛО-ЗЕЛЕНЫЙ фон для чередующихся строк (#f1f8e9)
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
                if (!drawnPages.has(data.pageNumber) && data.section === 'body') {
                    drawPageDecor(data.pageNumber);
                    drawnPages.add(data.pageNumber);
                }

                // Fix: when a cell uses colSpan (e.g. category header)
                // ensure its background fills the whole spanned width on new pages.
                const cell = data.cell || {};
                const raw = cell.raw || {};
                const colSpan = raw.colSpan ?? cell.colSpan ?? 1;
                const styles = cell.styles || {};
                if (colSpan > 1 && styles.fillColor) {
                    // Normalize fillColor to rgb array
                    let fill = styles.fillColor;
                    if (typeof fill === 'string') {
                        const hex = fill.replace('#', '');
                        if (hex.length === 6) {
                            fill = [parseInt(hex.substring(0,2),16), parseInt(hex.substring(2,4),16), parseInt(hex.substring(4,6),16)];
                        } else {
                            fill = [220,220,220];
                        }
                    }

                    // compute total width across spanned columns; fall back to availablePageWidth
                    let spanWidth = 0;
                    for (let i = data.column.index; i < data.column.index + colSpan; i++) {
                        const col = data.table.columns[i];
                        if (col && typeof col.width === 'number') spanWidth += col.width;
                    }
                    if (!spanWidth || spanWidth < 1) spanWidth = availablePageWidth;

                    // draw rectangle behind the whole spanned area
                    doc.setFillColor(Array.isArray(fill) ? fill : [220,220,220]);
                    doc.rect(cell.x, cell.y, spanWidth, cell.height, 'F');
                }
            } catch {
                // ignore
            }
        },
        didDrawPage: (data) => {
            // --- Footer ---
            const pageCount = doc.internal.getNumberOfPages();
            doc.setFont(FONT_NAME, 'normal');
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`Страница ${data.pageNumber} из ${pageCount}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
            doc.text('Смета создана в системе "Каркас Мастер"', margin, pageHeight - 10);
        }
    });

    // --- Final Breakdown Block ---
    const tableEndY = doc.lastAutoTable?.finalY ?? 0;
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
    let lineY = blockStartY + 10;
    breakdownLines.forEach(line => {
        doc.text(`${line.label}: ${line.value.toLocaleString('ru-RU')} ₽`, blockX + 8, lineY);
        lineY += 7;
    });

    // Draw total left-aligned under the breakdown lines (use normal font; emulate bold)
    doc.setFont(FONT_NAME, 'normal');
    doc.setFontSize(14);
    const totalText = `ОБЩИЙ ИТОГ: ${estimate.total.toLocaleString('ru-RU')} ₽`;
    const totalX = blockX + 8;
    const totalY = blockStartY + breakdownBlockHeight - 8;
    // Emulate bold by drawing twice with tiny offset (since bold font file may be missing)
    doc.text(totalText, totalX + 0.2, totalY + 0.2);
    doc.text(totalText, totalX, totalY);

    // --- Save ---
    doc.save(`Смета_${estimate.estimateNumber}_${estimate.client}.pdf`);
};
