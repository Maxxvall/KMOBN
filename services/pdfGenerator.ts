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

    // We'll draw background/header/footer per page when the table is being drawn.
    // Keep track of which pages we've already decorated.
    const drawnPages = new Set<number>();

    const drawPageDecor = (pageNumber: number) => {
        // Ensure we're drawing on the correct page
        try {
            doc.setPage(pageNumber);
        } catch (e) {
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
    doc.text('kmobn.ru', margin, 32);

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
    // Add column headers
    tableBody.push([
        { content: 'Наименование', styles: { font: FONT_NAME, fontStyle: 'bold', halign: 'center' } },
        { content: 'Ед. изм', styles: { font: FONT_NAME, fontStyle: 'bold', halign: 'center' } },
        { content: 'Кол-во', styles: { font: FONT_NAME, fontStyle: 'bold', halign: 'center' } },
        { content: 'Цена', styles: { font: FONT_NAME, fontStyle: 'bold', halign: 'center' } },
        { content: 'Стоимость', styles: { font: FONT_NAME, fontStyle: 'bold', halign: 'center' } }
    ]);

    ESTIMATE_CATEGORIES.forEach((category) => {
        const itemsInCategory = estimate.items.filter(item => item.category === category);
        if (itemsInCategory.length > 0) {
            // Category Header
            tableBody.push([{ 
                content: category, 
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

                // Subgroup total at the bottom
                tableBody.push([{ 
                    content: `Итого ${subgroup.toLowerCase()}: ${subTotal.toLocaleString('ru-RU')} ₽`, 
                    colSpan: 5, 
                    styles: { 
                        font: FONT_NAME, 
                        fontStyle: 'bold', 
                        fillColor: '#dcedc8', // СВЕТЛО-ЗЕЛЕНЫЙ фон (#dcedc8)
                        textColor: '#33691e',  // ТЕМНО-ЗЕЛЕНЫЙ текст (#33691e)
                        halign: 'right' 
                    } 
                }]);
            });

            // Category total
            tableBody.push([{ 
                content: `Итого по разделу: ${categoryTotal.toLocaleString('ru-RU')} ₽`, 
                colSpan: 5, 
                styles: { 
                    font: FONT_NAME, 
                    fontStyle: 'bold', 
                    fillColor: '#dcedc8', // СВЕТЛО-ЗЕЛЕНЫЙ фон (#dcedc8)
                    textColor: '#33691e',  // ТЕМНО-ЗЕЛЕНЫЙ текст (#33691e)
                    halign: 'right' 
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
    const col1 = 0; // will be computed
    const col1Fixed = 0;
    const colWidthsFixed = [15, 20, 25, 28]; // cols 1..4 fixed widths
    const fixedSum = colWidthsFixed.reduce((s, v) => s + v, 0);
    // small safety gap of 2 units to account for borders/padding
    const firstColWidth = Math.max(availablePageWidth - fixedSum - 2, 40);

    doc.setDrawColor(100, 100, 100); // gray for table lines

    doc.autoTable({
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
            } catch (e) {
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

    // --- Save ---
    doc.save(`Смета_${estimate.estimateNumber}_${estimate.client}.pdf`);
};