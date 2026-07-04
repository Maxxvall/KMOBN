// @ts-nocheck
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Estimate, EstimateItem, EstimateSubgroup } from '../types';
import { ESTIMATE_CATEGORIES } from '../types';
import LiberationFontUrl from '../assets/LiberationSans-Regular.ttf?url';

const formatCurrency = (value: number) => `${value.toLocaleString('ru-RU')} ₽`;

const safeTotal = (item: EstimateItem) => (item.total ?? item.quantity * item.price);

const sanitizeFileName = (value: string) => value.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
    }
    return btoa(binary);
};

const declension = (value: number, forms: [string, string, string]) => {
    const n = Math.abs(value) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return forms[2];
    if (n1 > 1 && n1 < 5) return forms[1];
    if (n1 === 1) return forms[0];
    return forms[2];
};

const numberToWordsRu = (value: number) => {
    if (!Number.isFinite(value)) return '';
    let num = Math.floor(Math.abs(value));
    if (num === 0) return 'ноль рублей';

    const unitsMale = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
    const unitsFemale = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
    const teens = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
    const tens = ['', 'десять', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
    const hundreds = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

    const parts: string[] = [];

    const pushGroup = (group: number, forms: [string, string, string], female: boolean) => {
        if (!group) return;
        const h = Math.floor(group / 100);
        const t = Math.floor((group % 100) / 10);
        const u = group % 10;
        if (h) parts.push(hundreds[h]);
        if (t === 1) {
            parts.push(teens[u]);
        } else {
            if (t) parts.push(tens[t]);
            if (u) parts.push((female ? unitsFemale : unitsMale)[u]);
        }
        parts.push(declension(group, forms));
    };

    const billions = Math.floor(num / 1_000_000_000);
    const millions = Math.floor((num % 1_000_000_000) / 1_000_000);
    const thousands = Math.floor((num % 1_000_000) / 1000);
    const rest = num % 1000;

    pushGroup(billions, ['миллиард', 'миллиарда', 'миллиардов'], false);
    pushGroup(millions, ['миллион', 'миллиона', 'миллионов'], false);
    pushGroup(thousands, ['тысяча', 'тысячи', 'тысяч'], true);

    if (rest) {
        const h = Math.floor(rest / 100);
        const t = Math.floor((rest % 100) / 10);
        const u = rest % 10;
        if (h) parts.push(hundreds[h]);
        if (t === 1) {
            parts.push(teens[u]);
        } else {
            if (t) parts.push(tens[t]);
            if (u) parts.push(unitsMale[u]);
        }
    }

    parts.push(declension(num, ['рубль', 'рубля', 'рублей']));
    return parts.join(' ').replace(/\s+/g, ' ').trim();
};

export const generatePdfContract = async (estimate: Estimate, contractName: string) => {
    const normalizedContractName = contractName.trim();
    const estimateDate = new Date(estimate.date).toLocaleDateString('ru-RU');

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

    const calculatedTotal = estimate.items.reduce((sum, item) => sum + safeTotal(item), 0);
    const total = Number.isFinite(estimate.total) ? estimate.total : calculatedTotal;
    const totalRounded = Math.round(total);
    const totalWords = numberToWordsRu(totalRounded);

    const doc = new jsPDF();

    const FONT_NAME = 'LiberationSans';
    const fontResult = await Promise.allSettled([
        fetch(LiberationFontUrl).then(r => r.arrayBuffer()),
    ]);

    if (fontResult[0].status === 'fulfilled') {
        try {
            const b64 = arrayBufferToBase64(fontResult[0].value);
            doc.addFileToVFS('LiberationSans-Regular.ttf', b64);
            doc.addFont('LiberationSans-Regular.ttf', FONT_NAME, 'normal');
            doc.addFont('LiberationSans-Regular.ttf', FONT_NAME, 'bold');
        } catch (e) {
            console.error('Failed to setup LiberationSans font for PDF contract:', e);
        }
    } else {
        console.error('Failed to load LiberationSans font for PDF contract:', fontResult[0].reason);
    }

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;

    doc.setFont(FONT_NAME, 'normal');
    doc.setFontSize(16);
    doc.setFont(FONT_NAME, 'bold');
    doc.setFontSize(16);
    doc.text(normalizedContractName, pageWidth / 2, 20, { align: 'center' });

    doc.setFont(FONT_NAME, 'normal');
    doc.setFontSize(12);
    doc.text(`Смета № ${estimate.estimateNumber} от ${estimateDate}`, pageWidth / 2, 28, { align: 'center' });

    const tableBody: Array<unknown> = [];

    const subgroupOrder = [
        EstimateSubgroup.WORKS,
        EstimateSubgroup.MATERIALS,
        EstimateSubgroup.DELIVERY,
    ];

    ESTIMATE_CATEGORIES.forEach((category) => {
        const itemsInCategory = estimate.items.filter(item => item.category === category);
        if (itemsInCategory.length === 0) return;

        const categoryRow = [
            {
                content: category,
                colSpan: 5,
                styles: {
                    halign: 'center',
                    fontStyle: 'bold',
                    textColor: [0, 0, 0],
                    fillColor: [255, 255, 255],
                    font: FONT_NAME,
                },
            },
        ];
        (categoryRow as { rowPageBreak?: string }).rowPageBreak = 'avoid';
        tableBody.push(categoryRow);

        subgroupOrder.forEach(subgroup => {
            const subgroupItems = itemsInCategory.filter(item => item.subgroup === subgroup);
            if (!subgroupItems.length) return;

            const subgroupRow = [
                {
                    content: subgroup,
                    colSpan: 5,
                    styles: {
                        halign: 'left',
                        fontStyle: 'bold',
                        textColor: [0, 0, 0],
                        fillColor: [255, 255, 255],
                        font: FONT_NAME,
                    },
                },
            ];
            (subgroupRow as { rowPageBreak?: string }).rowPageBreak = 'avoid';
            tableBody.push(subgroupRow);

            subgroupItems.forEach(item => {
                tableBody.push([
                    item.name,
                    item.unit,
                    item.quantity.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
                    formatCurrency(item.price),
                    formatCurrency(safeTotal(item)),
                ]);
            });
        });
    });

    const availableWidth = pageWidth - margin * 2;
    const colWidths = {
        name: availableWidth * 0.60,
        unit: availableWidth * 0.08,
        qty: availableWidth * 0.08,
        price: availableWidth * 0.12,
        sum: availableWidth * 0.12,
    };

    autoTable(doc, {
        startY: 34,
        head: [['Наименование', 'Ед.изм', 'Кол-во', 'Цена', 'Сумма']],
        body: tableBody,
        theme: 'grid',
        margin: { left: margin, right: margin },
        styles: { fontSize: 9, cellPadding: 2, font: FONT_NAME, lineColor: [180, 180, 180], lineWidth: 0.3 },
        headStyles: { textColor: [0, 0, 0], halign: 'center', fontStyle: 'bold', font: FONT_NAME, fillColor: [255, 255, 255], lineColor: [120, 120, 120], lineWidth: 0.5 },
        bodyStyles: { font: FONT_NAME },
        columnStyles: {
            0: { cellWidth: colWidths.name },
            1: { cellWidth: colWidths.unit, halign: 'center' },
            2: { cellWidth: colWidths.qty, halign: 'right' },
            3: { cellWidth: colWidths.price, halign: 'right' },
            4: { cellWidth: colWidths.sum, halign: 'right' },
        },
    });

    let y = (doc.lastAutoTable?.finalY ?? 34) + 8;
    const ensureSpace = (needed: number) => {
        if (y + needed <= pageHeight - margin) return;
        doc.addPage();
        y = 20;
    };

    const addLine = (text: string, options?: { bold?: boolean; size?: number }) => {
        const size = options?.size ?? 11;
        const needed = Math.max(8, Math.ceil(size * 0.9));
        ensureSpace(needed + 2);
        doc.setFont(FONT_NAME, options?.bold ? 'bold' : 'normal');
        doc.setFontSize(size);
        doc.text(text, margin, y);
        y += needed;
    };

    addLine('ЦЕНЫ АКТУАЛЬНЫ НА ДАТУ СОСТАВЛЕНИЯ СМЕТЫ*', { bold: true });
    // Маленькая сноска: допускается замена материалов на аналог
    ensureSpace(10);
    doc.setFont(FONT_NAME, 'normal');
    doc.setFontSize(9);
    doc.text('Допускается замена любого материала на аналог', margin, y);
    y += 6;

    // Печатаем блок "Работы / Материалы / Доставка" без внутренних отступов,
    // но с отступом перед блоком и после блока.
    const tightLines = [
        `Работы: ${formatCurrency(worksTotal)}`,
        `Материалы: ${formatCurrency(materialsTotal)}`,
        `Доставка: ${formatCurrency(deliveryTotal)}`,
    ];
    const tightLineHeight = 6; // плотный межстрочный интервал внутри блока
    const blockNeeded = tightLines.length * tightLineHeight + 4;
    ensureSpace(blockNeeded + 2);
    y += 3; // отступ перед блоком
    tightLines.forEach((line) => {
        doc.setFont(FONT_NAME, 'normal');
        doc.setFontSize(11);
        doc.text(line, margin, y);
        y += tightLineHeight;
    });
    y += 3; // отступ после блока

    addLine(`ОБЩИЙ ИТОГ: ${formatCurrency(total)} (${totalWords})`, { bold: true, size: 12 });
    y += 3;
    // Блок согласования — печатаем без внутренних отступов между строками
    addLine('СОГЛАСОВАНО:', { bold: true });
    const agreeLines = [
        'Подрядчик: Афонькин В.А.',
        'Заказчик:',
    ];
    const agreeLineHeight = 6;
    ensureSpace(agreeLines.length * agreeLineHeight + 2);
    agreeLines.forEach(line => {
        doc.setFont(FONT_NAME, 'normal');
        doc.setFontSize(11);
        doc.text(line, margin, y);
        y += agreeLineHeight;
    });

    const fileName = `${sanitizeFileName(normalizedContractName).replace(/\s+/g, '_')}_Смета_${estimate.estimateNumber}.pdf`;
    doc.save(fileName);
};
