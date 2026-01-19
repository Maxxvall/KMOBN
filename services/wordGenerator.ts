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
    TextRun,
    WidthType,
} from 'docx';
import { ESTIMATE_CATEGORIES } from '../constants';
import { Estimate, EstimateItem, EstimateSubgroup } from '../types';

const formatCurrency = (value: number) => `${value.toLocaleString('ru-RU')} ₽`;

const safeTotal = (item: EstimateItem) => (item.total ?? item.quantity * item.price);

const sanitizeFileName = (value: string) => value.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();

type AlignmentValue = (typeof AlignmentType)[keyof typeof AlignmentType];

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
            createCell('Наименование', { bold: true, align: AlignmentType.CENTER, width: 45 }),
            createCell('Ед.изм', { bold: true, align: AlignmentType.CENTER, width: 15 }),
            createCell('Кол-во', { bold: true, align: AlignmentType.CENTER, width: 15 }),
            createCell('Цена', { bold: true, align: AlignmentType.CENTER, width: 20 }),
            createCell('Сумма', { bold: true, align: AlignmentType.CENTER, width: 20 }),
        ],
    });
};

const createItemRow = (item: EstimateItem) => {
    return new TableRow({
        cantSplit: false,
        children: [
            createCell(item.name, { width: 45 }),
            createCell(item.unit, { align: AlignmentType.CENTER, width: 15 }),
            createCell(item.quantity.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }), { align: AlignmentType.RIGHT, width: 15 }),
            createCell(formatCurrency(item.price), { align: AlignmentType.RIGHT, width: 20 }),
            createCell(formatCurrency(safeTotal(item)), { align: AlignmentType.RIGHT, width: 20 }),
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
                    new Paragraph({
                        children: [new TextRun({ text: `Подготовлено для: ${estimate.client}` })],
                    }),
                    new Paragraph({
                        children: [new TextRun({ text: `Вид строения: ${estimate.buildingType}, Площадь: ${estimate.area} м²` })],
                    }),
                    new Paragraph({ text: '' }),
                    table,
                    new Paragraph({ text: '' }),
                    createTextParagraph('ЦЕНЫ АКТУАЛЬНЫ НА ДАТУ СОСТАВЛЕНИЯ СМЕТЫ*', { bold: true }),
                    createTextParagraph(`Работы: ${formatCurrency(worksTotal)}`),
                    createTextParagraph(`Материалы: ${formatCurrency(materialsTotal)}`),
                    createTextParagraph(`Доставка: ${formatCurrency(deliveryTotal)}`),
                    createTextParagraph(`ОБЩИЙ ИТОГ: ${formatCurrency(total)}`, { bold: true, size: 28 }),
                    new Paragraph({ text: '' }),
                    createTextParagraph('СОГЛАСОВАНО:', { bold: true }),
                    createTextParagraph('Подрядчик: Афонькин В.А. _______________'),
                    createTextParagraph('Заказчик: _______________'),
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
