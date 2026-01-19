import {
    AlignmentType,
    BorderStyle,
    Document,
    HeadingLevel,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TableLayoutType,
    TextRun,
    WidthType,
} from 'docx';
import { ESTIMATE_CATEGORIES } from '../constants';
import { Estimate, EstimateItem, EstimateSubgroup } from '../types';

const formatCurrency = (value: number) => `${value.toLocaleString('ru-RU')} ₽`;

const safeTotal = (item: EstimateItem) => (item.total ?? item.quantity * item.price);

const sanitizeFileName = (value: string) => value.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();

type AlignmentValue = (typeof AlignmentType)[keyof typeof AlignmentType];

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

    const unitsMale = ['','один','два','три','четыре','пять','шесть','семь','восемь','девять'];
    const unitsFemale = ['','одна','две','три','четыре','пять','шесть','семь','восемь','девять'];
    const teens = ['десять','одиннадцать','двенадцать','тринадцать','четырнадцать','пятнадцать','шестнадцать','семнадцать','восемнадцать','девятнадцать'];
    const tens = ['','десять','двадцать','тридцать','сорок','пятьдесят','шестьдесят','семьдесят','восемьдесят','девяносто'];
    const hundreds = ['','сто','двести','триста','четыреста','пятьсот','шестьсот','семьсот','восемьсот','девятьсот'];

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

const createTextParagraph = (text: string, options?: { bold?: boolean; align?: AlignmentValue; size?: number }) => {
    return new Paragraph({
        alignment: options?.align,
        children: [
            new TextRun({
                text,
                bold: options?.bold,
                size: options?.size,
            }),
        ],
    });
};

const createCell = (text: string, options?: { bold?: boolean; align?: AlignmentValue; width?: number; size?: number }) => {
    return new TableCell({
        width: options?.width ? { size: options.width, type: WidthType.PERCENTAGE } : undefined,
        children: [createTextParagraph(text, { bold: options?.bold, align: options?.align, size: options?.size })],
    });
};

const createCategoryRow = (category: string) => {
    return new TableRow({
        cantSplit: true,
        children: [
            new TableCell({
                columnSpan: 5,
                children: [createTextParagraph(category, { bold: true, align: AlignmentType.CENTER })],
            }),
        ],
    });
};

const createHeaderRow = () => {
    return new TableRow({
        children: [
            createCell('Наименование', { bold: true, align: AlignmentType.CENTER, width: 60 }),
            createCell('Ед.изм', { bold: true, align: AlignmentType.CENTER, width: 8 }),
            createCell('Кол-во', { bold: true, align: AlignmentType.CENTER, width: 8 }),
            createCell('Цена', { bold: true, align: AlignmentType.CENTER, width: 12 }),
            createCell('Сумма', { bold: true, align: AlignmentType.CENTER, width: 12 }),
        ],
    });
};

const createItemRow = (item: EstimateItem) => {
    return new TableRow({
        cantSplit: false,
        children: [
            createCell(item.name, { width: 60 }),
            createCell(item.unit, { align: AlignmentType.CENTER, width: 8 }),
            createCell(item.quantity.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }), { align: AlignmentType.RIGHT, width: 8 }),
            createCell(formatCurrency(item.price), { align: AlignmentType.RIGHT, width: 12 }),
            createCell(formatCurrency(safeTotal(item)), { align: AlignmentType.RIGHT, width: 12 }),
        ],
    });
};

export const generateWordContract = async (estimate: Estimate, contractName: string) => {
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

    const rows: TableRow[] = [createHeaderRow()];

    ESTIMATE_CATEGORIES.forEach((category) => {
        const itemsInCategory = estimate.items.filter((item) => item.category === category);
        if (itemsInCategory.length === 0) return;
        rows.push(createCategoryRow(category));
        itemsInCategory.forEach((item) => rows.push(createItemRow(item)));
    });

    const table = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows,
        layout: TableLayoutType.FIXED,
        alignment: AlignmentType.CENTER,
        borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
            left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
            right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
            insideVertical: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
        },
    });

    const doc = new Document({
        sections: [
            {
                children: [
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        heading: HeadingLevel.HEADING_1,
                        children: [new TextRun({ text: `Приложение №1 к договору ${normalizedContractName}`, bold: true })],
                    }),
                    new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [new TextRun({ text: `Смета № ${estimate.estimateNumber} от ${estimateDate}` })],
                    }),
                    new Paragraph({ text: '' }),
                    new Paragraph({ text: '' }),
                    table,
                    new Paragraph({ text: '' }),
                    createTextParagraph('ЦЕНЫ АКТУАЛЬНЫ НА ДАТУ СОСТАВЛЕНИЯ СМЕТЫ*', { bold: true }),
                    new Paragraph({ text: '' }),
                    createTextParagraph(`Работы: ${formatCurrency(worksTotal)}`),
                    createTextParagraph(`Материалы: ${formatCurrency(materialsTotal)}`),
                    createTextParagraph(`Доставка: ${formatCurrency(deliveryTotal)}`),
                    new Paragraph({ text: '' }),
                    createTextParagraph(`ОБЩИЙ ИТОГ: ${formatCurrency(total)} (${totalWords})`, { bold: true, size: 24 }),
                    new Paragraph({ text: '' }),
                    createTextParagraph('СОГЛАСОВАНО:', { bold: true }),
                    new Paragraph({ text: '' }),
                    createTextParagraph('Подрядчик: Афонькин В.А.'),
                    new Paragraph({ text: '' }),
                    createTextParagraph('Заказчик:'),
                ],
            },
        ],
    });

    const blob = await Packer.toBlob(doc);
    const safeContractName = sanitizeFileName(normalizedContractName);
    const fileName = `Приложение_№1_к_договору_${safeContractName}_Смета_${estimate.estimateNumber}.docx`;
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
