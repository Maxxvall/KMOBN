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
    TableLayoutType,
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

const COLORS = {
    graphite: '101318',
    graphiteSoft: '171B21',
    red: 'EF4136',
    paper: 'F4F1E9',
    white: 'FFFFFF',
    row: 'FBFAF7',
    line: 'D8D2C7',
    text: '171A1F',
    muted: '697078',
    paleRed: 'FCEBE8',
    positive: '176B4D',
} as const;

const FONT = 'Arial';
const CONTENT_WIDTH = 10086;
const TABLE_INDENT = 120;
const CELL_MARGINS = { top: 110, bottom: 110, left: 120, right: 120 };

const money = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`;

type RunOptions = {
    bold?: boolean;
    color?: string;
    size?: number;
    italics?: boolean;
    break?: number;
};

const text = (value: string, options: RunOptions = {}) => new TextRun({
    text: value,
    bold: options.bold,
    color: options.color || COLORS.text,
    size: options.size || 20,
    italics: options.italics,
    break: options.break,
    font: FONT,
});

const gridBorders = {
    top: { style: BorderStyle.SINGLE, size: 6, color: COLORS.line },
    bottom: { style: BorderStyle.SINGLE, size: 6, color: COLORS.line },
    left: { style: BorderStyle.SINGLE, size: 6, color: COLORS.line },
    right: { style: BorderStyle.SINGLE, size: 6, color: COLORS.line },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 6, color: COLORS.line },
    insideVertical: { style: BorderStyle.SINGLE, size: 6, color: COLORS.line },
};

const richCell = (
    width: number,
    children: Paragraph[],
    options: { fill?: string } = {},
) => new TableCell({
    width: { size: width, type: WidthType.DXA },
    margins: CELL_MARGINS,
    verticalAlign: VerticalAlign.CENTER,
    shading: options.fill ? { type: ShadingType.CLEAR, fill: options.fill, color: 'auto' } : undefined,
    children,
});

const cell = (
    value: string,
    width: number,
    options: {
        bold?: boolean;
        fill?: string;
        color?: string;
        align?: typeof AlignmentType[keyof typeof AlignmentType];
        size?: number;
    } = {},
) => richCell(width, [new Paragraph({
    alignment: options.align || AlignmentType.LEFT,
    spacing: { before: 0, after: 0, line: 260 },
    keepLines: true,
    children: [text(value, {
        bold: options.bold,
        color: options.color,
        size: options.size,
    })],
})], { fill: options.fill });

const table = (
    columnWidths: number[],
    rows: TableRow[],
) => new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    indent: { size: TABLE_INDENT, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths,
    borders: gridBorders,
    rows,
});

const heading = (value: string) => new Paragraph({
    heading: HeadingLevel.HEADING_1,
    keepNext: true,
    keepLines: true,
    indent: { left: TABLE_INDENT },
    spacing: { before: 340, after: 180 },
    children: [text(value, { bold: true, color: COLORS.graphite, size: 28 })],
});

const masthead = (input: HouseProposalDocxInput) => new Paragraph({
    shading: { type: ShadingType.CLEAR, fill: COLORS.graphite, color: 'auto' },
    border: {
        top: { style: BorderStyle.SINGLE, size: 28, color: COLORS.red, space: 14 },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.graphite, space: 14 },
        left: { style: BorderStyle.SINGLE, size: 4, color: COLORS.graphite, space: 14 },
        right: { style: BorderStyle.SINGLE, size: 4, color: COLORS.graphite, space: 14 },
    },
    indent: { left: TABLE_INDENT },
    spacing: { before: 200, after: 360, line: 380 },
    children: [
        text('КАРКАС', { bold: true, color: COLORS.white, size: 22 }),
        text(' МАСТЕР', { bold: true, color: COLORS.red, size: 22 }),
        text('КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ', { bold: true, color: COLORS.red, size: 15, break: 1 }),
        text(`КАРКАСНЫЙ ДОМ ${input.area} М²`, { bold: true, color: COLORS.white, size: 40, break: 1 }),
        text('Три варианта комплектации на основе актуальных смет и справочников компании', {
            color: COLORS.white,
            size: 19,
            break: 1,
        }),
    ],
});

const parameterTable = (input: HouseProposalDocxInput, selected: HouseVariantResult) => {
    const widths = [1500, 3543, 1500, 3543];
    const parameterCell = (label: string) => cell(label.toUpperCase(), 1500, {
        bold: true,
        fill: COLORS.row,
        color: COLORS.red,
        size: 15,
    });
    return table(widths, [
        new TableRow({ cantSplit: true, children: [parameterCell('Площадь'), cell(`${input.area} м²`, 3543, { bold: true }), parameterCell('Этажность'), cell(`${input.floors}`, 3543, { bold: true })] }),
        new TableRow({ cantSplit: true, children: [parameterCell('Окна'), cell(`${input.windows}`, 3543), parameterCell('Двери'), cell(`${input.doors}`, 3543)] }),
        new TableRow({ cantSplit: true, children: [parameterCell('Крыша'), cell(input.roof, 3543), parameterCell('Выбран вариант'), cell(selected.label, 3543, { bold: true, color: COLORS.red })] }),
    ]);
};

const comparisonTable = (input: HouseProposalDocxInput) => {
    const widths = [1700, 3100, 2300, 2986];
    const header = (
        value: string,
        width: number,
        align: typeof AlignmentType[keyof typeof AlignmentType] = AlignmentType.LEFT,
    ) => cell(value.toUpperCase(), width, {
        bold: true,
        fill: COLORS.graphite,
        color: COLORS.white,
        align,
        size: 15,
    });
    return table(widths, [
        new TableRow({
            tableHeader: true,
            cantSplit: true,
            children: [
                header('Вариант', 1700),
                header('Готовность', 3100),
                header('Стоимость', 2300, AlignmentType.RIGHT),
                header('Предварительный диапазон', 2986, AlignmentType.RIGHT),
            ],
        }),
        ...input.variants.map(variant => {
            const selected = variant.tier === input.selectedTier;
            const fill = selected ? COLORS.paleRed : COLORS.row;
            return new TableRow({ cantSplit: true, children: [
                cell(`${selected ? 'ВЫБРАНО · ' : ''}${variant.label}`, 1700, { bold: true, fill, color: selected ? COLORS.red : COLORS.text, size: 18 }),
                cell(variant.description, 3100, { fill }),
                cell(money(variant.result.base), 2300, { bold: true, fill, align: AlignmentType.RIGHT }),
                cell(`${money(variant.result.low)} – ${money(variant.result.high)}`, 2986, { fill, align: AlignmentType.RIGHT, size: 18 }),
            ] });
        }),
    ]);
};

const selectedSummaryBlocks = (selected: HouseVariantResult): Paragraph[] => {
    return [
        new Paragraph({
            shading: { type: ShadingType.CLEAR, fill: COLORS.graphiteSoft, color: 'auto' },
            border: {
                top: { style: BorderStyle.SINGLE, size: 4, color: COLORS.graphiteSoft, space: 12 },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.graphiteSoft, space: 12 },
                left: { style: BorderStyle.SINGLE, size: 4, color: COLORS.graphiteSoft, space: 12 },
                right: { style: BorderStyle.SINGLE, size: 4, color: COLORS.graphiteSoft, space: 12 },
            },
            indent: { left: TABLE_INDENT },
            spacing: { before: 100, after: 0, line: 320 },
            keepLines: true,
            children: [
                text('ПРЕДВАРИТЕЛЬНАЯ СТОИМОСТЬ', { bold: true, color: COLORS.red, size: 15 }),
                text(money(selected.result.base), { bold: true, color: COLORS.white, size: 34, break: 1 }),
            ],
        }),
        new Paragraph({
            shading: { type: ShadingType.CLEAR, fill: COLORS.row, color: 'auto' },
            border: {
                top: { style: BorderStyle.SINGLE, size: 4, color: COLORS.line, space: 10 },
                bottom: { style: BorderStyle.SINGLE, size: 16, color: COLORS.red, space: 10 },
                left: { style: BorderStyle.SINGLE, size: 4, color: COLORS.line, space: 12 },
                right: { style: BorderStyle.SINGLE, size: 4, color: COLORS.line, space: 12 },
            },
            indent: { left: TABLE_INDENT },
            spacing: { before: 0, after: 180, line: 300 },
            keepLines: true,
            children: [
                text(`Рабочий диапазон: ${money(selected.result.low)} – ${money(selected.result.high)}`, { color: COLORS.text, size: 17 }),
            ],
        }),
    ];
};

const twoColumnMoneyTable = (
    headerLabel: string,
    rows: Array<[string, number]>,
    negativeIsGreen = false,
) => table([6500, 3586], [
    new TableRow({ tableHeader: true, cantSplit: true, children: [
        cell(headerLabel.toUpperCase(), 6500, { bold: true, fill: COLORS.graphite, color: COLORS.white, size: 15 }),
        cell('СТОИМОСТЬ', 3586, { bold: true, fill: COLORS.graphite, color: COLORS.white, align: AlignmentType.RIGHT, size: 15 }),
    ] }),
    ...rows.map(([label, value]) => new TableRow({ cantSplit: true, children: [
        cell(label, 6500, { fill: COLORS.row }),
        cell(money(value), 3586, {
            bold: true,
            fill: COLORS.row,
            color: negativeIsGreen && value < 0 ? COLORS.positive : COLORS.text,
            align: AlignmentType.RIGHT,
        }),
    ] })),
]);

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
        background: { color: COLORS.paper },
        styles: {
            default: {
                document: {
                    run: { font: FONT, size: 20, color: COLORS.text },
                    paragraph: { spacing: { after: 120, line: 280 } },
                },
            },
            paragraphStyles: [{
                id: 'Heading1',
                name: 'Heading 1',
                basedOn: 'Normal',
                next: 'Normal',
                quickFormat: true,
                run: { font: FONT, size: 28, bold: true, color: COLORS.graphite },
                paragraph: { spacing: { before: 300, after: 120 }, keepNext: true, keepLines: true },
            }],
        },
        sections: [{
            properties: {
                page: {
                    size: { width: 11906, height: 16838 },
                    margin: { top: 850, right: 850, bottom: 850, left: 850, header: 360, footer: 360 },
                },
            },
            headers: { default: new Header({ children: [new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 0 },
                children: [
                    text('КАРКАС ', { bold: true, color: COLORS.graphite, size: 14 }),
                    text('МАСТЕР', { bold: true, color: COLORS.red, size: 14 }),
                    text('  ·  ПРЕДВАРИТЕЛЬНОЕ ПРЕДЛОЖЕНИЕ', { bold: true, color: COLORS.muted, size: 14 }),
                ],
            })] }) },
            footers: { default: new Footer({ children: [new Paragraph({
                alignment: AlignmentType.RIGHT,
                border: { top: { style: BorderStyle.SINGLE, size: 5, color: COLORS.line } },
                spacing: { before: 80, after: 0 },
                children: [
                    text('КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ  ·  СТРАНИЦА ', { color: COLORS.muted, size: 14 }),
                    new TextRun({ children: [PageNumber.CURRENT], color: COLORS.muted, size: 14, font: FONT }),
                    text(' / ', { color: COLORS.muted, size: 14 }),
                    new TextRun({ children: [PageNumber.TOTAL_PAGES], color: COLORS.muted, size: 14, font: FONT }),
                ],
            })] }) },
            children: [
                masthead(input),
                parameterTable(input, selected),
                heading('Сравнение вариантов'),
                comparisonTable(input),
                heading(`Выбранный вариант: ${selected.label}`),
                ...selectedSummaryBlocks(selected),
                heading('Этапы и разделы строительства'),
                twoColumnMoneyTable('Раздел', selected.result.sections.map(section => [String(section.category), section.total])),
                heading('За что производится оплата'),
                twoColumnMoneyTable('Статья', financialRows, true),
                ...(input.clientDescription ? [
                    heading('Пожелания клиента'),
                    new Paragraph({
                        shading: { type: ShadingType.CLEAR, fill: COLORS.row, color: 'auto' },
                        border: { left: { style: BorderStyle.SINGLE, size: 18, color: COLORS.red } },
                        indent: { left: 220, right: 180 },
                        spacing: { before: 100, after: 160, line: 290 },
                        children: [text(input.clientDescription, { color: COLORS.text, size: 20 })],
                    }),
                ] : []),
                heading('Предварительный расчёт'),
                new Paragraph({
                    shading: { type: ShadingType.CLEAR, fill: COLORS.row, color: 'auto' },
                    border: {
                        top: { style: BorderStyle.SINGLE, size: 4, color: COLORS.row, space: 10 },
                        bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.row, space: 10 },
                        left: { style: BorderStyle.SINGLE, size: 16, color: COLORS.red, space: 12 },
                        right: { style: BorderStyle.SINGLE, size: 4, color: COLORS.row, space: 10 },
                    },
                    indent: { left: TABLE_INDENT },
                    spacing: { after: 180, line: 300 },
                    children: [text('Расчёт является предварительным. Окончательная стоимость будет указана после выбора проекта и согласования дополнительных деталей.', { color: COLORS.text })],
                }),
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
