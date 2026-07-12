import {
    AlignmentType,
    BorderStyle,
    Document,
    Footer,
    Header,
    HeadingLevel,
    PageNumber,
    Packer,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableRow,
    TextRun,
    VerticalAlign,
    WidthType,
} from 'docx';
import { HouseTier, HouseVariantResult } from './houseCalculator';

export interface HouseProposalDocxInput {
    area: number;
    floors: number;
    windows: number;
    doors: number;
    roof: string;
    clientDescription?: string;
    selectedTier: HouseTier;
    variants: HouseVariantResult[];
}

const NAVY = '1E293B';
const RED = 'DC2626';
const MUTED = '64748B';
const LIGHT = 'F1F5F9';
const WHITE = 'FFFFFF';
const GREEN = '166534';
const BORDER = 'CBD5E1';
const CONTENT_WIDTH = 9360;
const cellMargins = { top: 110, bottom: 110, left: 140, right: 140 };
const money = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`;

const borders = {
    top: { style: BorderStyle.SINGLE, size: 1, color: BORDER },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: BORDER },
    left: { style: BorderStyle.SINGLE, size: 1, color: BORDER },
    right: { style: BorderStyle.SINGLE, size: 1, color: BORDER },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: BORDER },
    insideVertical: { style: BorderStyle.SINGLE, size: 1, color: BORDER },
};

const text = (value: string, options: { bold?: boolean; color?: string; size?: number } = {}) => new TextRun({
    text: value,
    bold: options.bold,
    color: options.color || NAVY,
    size: options.size || 22,
    font: 'Calibri',
});

const cell = (
    value: string,
    width: number,
    options: { bold?: boolean; fill?: string; color?: string; align?: typeof AlignmentType[keyof typeof AlignmentType] } = {},
) => new TableCell({
    width: { size: width, type: WidthType.DXA },
    margins: cellMargins,
    verticalAlign: VerticalAlign.CENTER,
    shading: options.fill ? { type: ShadingType.CLEAR, fill: options.fill, color: 'auto' } : undefined,
    children: [new Paragraph({
        alignment: options.align || AlignmentType.LEFT,
        spacing: { before: 0, after: 0, line: 280 },
        children: [text(value, { bold: options.bold, color: options.color })],
    })],
});

const heading = (value: string) => new Paragraph({
    heading: HeadingLevel.HEADING_1,
    keepNext: true,
    spacing: { before: 320, after: 160 },
    children: [text(value, { bold: true, color: NAVY, size: 32 })],
});

const comparisonTable = (input: HouseProposalDocxInput) => new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [1800, 2760, 2200, 2600],
    borders,
    rows: [
        new TableRow({
            tableHeader: true,
            children: [
                cell('Вариант', 1800, { bold: true, fill: NAVY, color: WHITE }),
                cell('Готовность', 2760, { bold: true, fill: NAVY, color: WHITE }),
                cell('Стоимость', 2200, { bold: true, fill: NAVY, color: WHITE, align: AlignmentType.RIGHT }),
                cell('Предварительный диапазон', 2600, { bold: true, fill: NAVY, color: WHITE, align: AlignmentType.RIGHT }),
            ],
        }),
        ...input.variants.map(variant => {
            const selected = variant.tier === input.selectedTier;
            return new TableRow({ children: [
                cell(`${selected ? 'Выбрано: ' : ''}${variant.label}`, 1800, { bold: selected, fill: selected ? 'FEE2E2' : WHITE, color: selected ? RED : NAVY }),
                cell(variant.description, 2760, { fill: selected ? 'FEE2E2' : WHITE }),
                cell(money(variant.result.base), 2200, { bold: true, fill: selected ? 'FEE2E2' : WHITE, align: AlignmentType.RIGHT }),
                cell(`${money(variant.result.low)} - ${money(variant.result.high)}`, 2600, { fill: selected ? 'FEE2E2' : WHITE, align: AlignmentType.RIGHT }),
            ] });
        }),
    ],
});

export async function buildHouseProposalDocx(input: HouseProposalDocxInput): Promise<Blob> {
    const selected = input.variants.find(variant => variant.tier === input.selectedTier) || input.variants[0];
    if (!selected) throw new Error('Нет рассчитанного варианта для коммерческого предложения.');

    const allFinancialRows: Array<[string, number]> = [
        ['Материалы', selected.result.financials.materials],
        ['Работы', selected.result.financials.works],
        ['Логистика', selected.result.financials.logistics],
        ['Техника', selected.result.financials.equipment],
        ['Накладные расходы', selected.result.financials.overhead],
        ['Наценка', selected.result.financials.margin],
        ['Резерв', selected.result.financials.reserve],
        ['Налог', selected.result.financials.tax],
        ['Скидка', -selected.result.financials.discount],
    ];
    const financialRows = allFinancialRows.filter(([, value]) => value !== 0);

    const doc = new Document({
        creator: 'Каркас Мастер',
        title: `Коммерческое предложение - каркасный дом ${input.area} м²`,
        description: 'Предварительное коммерческое предложение по строительству каркасного дома',
        styles: {
            default: { document: { run: { font: 'Calibri', size: 22, color: NAVY }, paragraph: { spacing: { after: 160, line: 300 } } } },
            paragraphStyles: [
                { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Calibri', size: 32, bold: true, color: NAVY }, paragraph: { spacing: { before: 320, after: 160 }, keepNext: true } },
            ],
        },
        sections: [{
            properties: {
                page: {
                    size: { width: 12240, height: 15840 },
                    margin: { top: 1440, right: 1440, bottom: 1440, left: 1440, header: 708, footer: 708 },
                },
            },
            headers: { default: new Header({ children: [new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 0 },
                children: [text('КАРКАС МАСТЕР  |  ПРЕДВАРИТЕЛЬНОЕ ПРЕДЛОЖЕНИЕ', { bold: true, color: MUTED, size: 17 })],
            })] }) },
            footers: { default: new Footer({ children: [new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [text('Страница ', { color: MUTED, size: 18 }), new TextRun({ children: [PageNumber.CURRENT], color: MUTED, size: 18, font: 'Calibri' })],
            })] }) },
            children: [
                new Paragraph({ spacing: { after: 60 }, children: [text('КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ', { bold: true, color: RED, size: 19 })] }),
                new Paragraph({ spacing: { after: 100 }, children: [text(`Каркасный дом ${input.area} м²`, { bold: true, color: NAVY, size: 52 })] }),
                new Paragraph({ spacing: { after: 360 }, children: [text('Три варианта комплектации на основе актуальных смет и справочников компании', { color: MUTED, size: 26 })] }),
                new Table({
                    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
                    columnWidths: [1800, 2880, 1800, 2880],
                    borders,
                    rows: [
                        new TableRow({ children: [cell('Площадь', 1800, { bold: true, fill: LIGHT }), cell(`${input.area} м²`, 2880), cell('Этажность', 1800, { bold: true, fill: LIGHT }), cell(`${input.floors}`, 2880)] }),
                        new TableRow({ children: [cell('Окна', 1800, { bold: true, fill: LIGHT }), cell(`${input.windows}`, 2880), cell('Двери', 1800, { bold: true, fill: LIGHT }), cell(`${input.doors}`, 2880)] }),
                        new TableRow({ children: [cell('Крыша', 1800, { bold: true, fill: LIGHT }), cell(input.roof, 2880), cell('Выбран вариант', 1800, { bold: true, fill: LIGHT }), cell(selected.label, 2880, { bold: true, color: RED })] }),
                    ],
                }),
                heading('Сравнение вариантов'),
                comparisonTable(input),
                heading(`Выбранный вариант: ${selected.label}`),
                new Table({
                    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
                    columnWidths: [6000, 3360],
                    borders,
                    rows: [
                        new TableRow({ children: [cell('Предварительная стоимость', 6000, { bold: true, fill: 'ECFDF5', color: GREEN }), cell(money(selected.result.base), 3360, { bold: true, fill: 'ECFDF5', color: GREEN, align: AlignmentType.RIGHT })] }),
                        new TableRow({ children: [cell('Рабочий диапазон', 6000), cell(`${money(selected.result.low)} - ${money(selected.result.high)}`, 3360, { align: AlignmentType.RIGHT })] }),
                    ],
                }),
                heading('Этапы и разделы строительства'),
                new Table({
                    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
                    columnWidths: [6200, 3160],
                    borders,
                    rows: [
                        new TableRow({ tableHeader: true, children: [cell('Раздел', 6200, { bold: true, fill: NAVY, color: WHITE }), cell('Стоимость', 3160, { bold: true, fill: NAVY, color: WHITE, align: AlignmentType.RIGHT })] }),
                        ...selected.result.sections.map(section => new TableRow({ children: [cell(String(section.category), 6200), cell(money(section.total), 3160, { align: AlignmentType.RIGHT })] })),
                    ],
                }),
                heading('За что производится оплата'),
                new Table({
                    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
                    columnWidths: [6200, 3160],
                    borders,
                    rows: financialRows.map(([label, value]) => new TableRow({ children: [cell(label, 6200), cell(money(value), 3160, { align: AlignmentType.RIGHT, color: value < 0 ? GREEN : NAVY })] })),
                }),
                ...(input.clientDescription ? [heading('Пожелания клиента'), new Paragraph({ children: [text(input.clientDescription)] })] : []),
                heading('Важные условия'),
                new Paragraph({ children: [text('Расчёт является предварительным и подготовлен на основании исторических смет пользователя. Финальная стоимость фиксируется после уточнения проекта, геологии участка, логистики, состава инженерии и выбранных материалов.', { color: MUTED })] }),
                ...selected.result.warnings.slice(0, 5).map(warning => new Paragraph({ spacing: { after: 100 }, children: [text(`Важно: ${warning}`, { color: RED })] })),
            ],
        }],
    });

    return Packer.toBlob(doc);
}

export async function downloadHouseProposalDocx(input: HouseProposalDocxInput): Promise<void> {
    const blob = await buildHouseProposalDocx(input);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Коммерческое предложение - каркасный дом ${input.area} м².docx`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}
