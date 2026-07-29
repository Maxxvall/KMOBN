import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { HouseVariantResult } from './houseCalculator';
import type { HouseProposalDocxInput } from './houseProposalDocx';
import { loadPremiumPdfResources, PDF_FONT_NAME, registerPdfFont } from './pdfUtils';

type Rgb = [number, number, number];
type PdfWithTable = jsPDF & { lastAutoTable?: { finalY: number } };

export type HouseProposalPdfInput = HouseProposalDocxInput;

export interface HouseProposalPdfAssets {
    fontBase64: string | null;
    boldFontBase64?: string | null;
}

export interface HouseProposalPdfModel {
    selectedLabel: string;
    selectedBase: number;
    selectedLow: number;
    selectedHigh: number;
    variants: Array<{ label: string; description: string; base: number; low: number; high: number; selected: boolean }>;
    sections: Array<{ label: string; total: number }>;
    financialRows: Array<{ label: string; value: number }>;
    clientDescription: string;
    preliminaryText: string;
}

export const HOUSE_PROPOSAL_PRELIMINARY_TEXT = 'Расчёт является предварительным. Окончательная стоимость будет указана после выбора проекта и согласования дополнительных деталей.';

const COLORS = {
    graphite: [16, 19, 24] as Rgb,
    graphiteSoft: [23, 27, 33] as Rgb,
    red: [239, 65, 54] as Rgb,
    paper: [244, 241, 233] as Rgb,
    white: [255, 255, 255] as Rgb,
    row: [251, 250, 247] as Rgb,
    line: [216, 210, 199] as Rgb,
    text: [23, 26, 31] as Rgb,
    muted: [105, 112, 120] as Rgb,
    paleRed: [252, 235, 232] as Rgb,
    positive: [23, 107, 77] as Rgb,
} as const;

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 14;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const CONTENT_BOTTOM = 275;

const setFill = (doc: jsPDF, color: Rgb) => doc.setFillColor(...color);
const setDraw = (doc: jsPDF, color: Rgb) => doc.setDrawColor(...color);
const setText = (doc: jsPDF, color: Rgb) => doc.setTextColor(...color);

const formatNumber = (value: number): string => Math.round(value).toLocaleString('ru-RU');
const money = (value: number): string => `${formatNumber(value)}\u00a0руб.`;

const selectedVariant = (input: HouseProposalPdfInput): HouseVariantResult => {
    const selected = input.variants.find(variant => variant.tier === input.selectedTier) || input.variants[0];
    if (!selected) throw new Error('Нет рассчитанного варианта для коммерческого предложения.');
    return selected;
};

export const buildHouseProposalPdfModel = (input: HouseProposalPdfInput): HouseProposalPdfModel => {
    const selected = selectedVariant(input);
    const financialRows = [
        { label: 'Материалы', value: selected.result.financials.materials },
        { label: 'Работы', value: selected.result.financials.works },
        { label: 'Логистика', value: selected.result.financials.logistics },
        { label: 'Техника', value: selected.result.financials.equipment },
        { label: 'Накладные расходы', value: selected.result.financials.overhead },
        { label: 'Наценка', value: selected.result.financials.margin },
        { label: 'Резерв', value: selected.result.financials.reserve },
        { label: 'Налог', value: selected.result.financials.tax },
        { label: 'Скидка', value: -selected.result.financials.discount },
    ].filter(row => row.value !== 0);

    return {
        selectedLabel: selected.label,
        selectedBase: selected.result.base,
        selectedLow: selected.result.low,
        selectedHigh: selected.result.high,
        variants: input.variants.map(variant => ({
            label: variant.label,
            description: variant.description,
            base: variant.result.base,
            low: variant.result.low,
            high: variant.result.high,
            selected: variant.tier === input.selectedTier,
        })),
        sections: selected.result.sections.map(section => ({
            label: String(section.category),
            total: section.total,
        })),
        financialRows,
        clientDescription: input.clientDescription?.trim() || '',
        preliminaryText: HOUSE_PROPOSAL_PRELIMINARY_TEXT,
    };
};

export const houseProposalPdfFileName = (area: number): string => {
    const safeArea = String(area).replace(/[\\/:*?"<>|]/g, '_');
    return `Коммерческое предложение - каркасный дом ${safeArea} м².pdf`;
};

export const createHouseProposalPdf = (
    input: HouseProposalPdfInput,
    assets: HouseProposalPdfAssets,
): jsPDF => {
    const model = buildHouseProposalPdfModel(input);
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
        putOnlyUsedFonts: true,
    }) as PdfWithTable;
    registerPdfFont(doc, assets.fontBase64, assets.boldFontBase64 ?? null);
    const font = assets.fontBase64 ? PDF_FONT_NAME : 'helvetica';

    doc.setProperties({
        title: `Коммерческое предложение — каркасный дом ${input.area} м²`,
        subject: 'Предварительное коммерческое предложение по строительству каркасного дома',
        author: 'Каркас Мастер',
        creator: 'Каркас Мастер',
        keywords: 'коммерческое предложение, строительство, Каркас Мастер',
    });

    const setFont = (style: 'normal' | 'bold' = 'normal') => doc.setFont(font, style);
    const drawPaper = () => {
        setFill(doc, COLORS.paper);
        doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, 'F');
    };
    const drawWordmark = (x: number, y: number, light = false) => {
        setFont('bold');
        doc.setFontSize(9.5);
        setText(doc, light ? COLORS.white : COLORS.graphite);
        doc.text('КАРКАС', x, y);
        const width = doc.getTextWidth('КАРКАС');
        setText(doc, COLORS.red);
        doc.text('МАСТЕР', x + width + 1.2, y);
    };
    const drawSecondaryPage = () => {
        drawPaper();
        setFill(doc, COLORS.red);
        doc.rect(0, 0, PAGE_WIDTH, 3.5, 'F');
        drawWordmark(MARGIN, 13);
        setFont('bold');
        doc.setFontSize(6.8);
        setText(doc, COLORS.muted);
        doc.text('КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ', PAGE_WIDTH - MARGIN, 13, { align: 'right' });
        setDraw(doc, COLORS.line);
        doc.setLineWidth(0.25);
        doc.line(MARGIN, 17, PAGE_WIDTH - MARGIN, 17);
    };
    const addSecondaryPage = () => {
        doc.addPage();
        drawSecondaryPage();
    };
    const sectionTitle = (label: string, y: number): number => {
        setFont('bold');
        doc.setFontSize(13.5);
        setText(doc, COLORS.graphite);
        doc.text(label, MARGIN, y);
        setFill(doc, COLORS.red);
        doc.rect(MARGIN, y + 2.4, 24, 0.8, 'F');
        return y + 8;
    };
    const tableContinuation = (startingPage: number) => ({
        margin: { top: 23, right: MARGIN, bottom: 23, left: MARGIN },
        willDrawPage: () => {
            if (doc.getCurrentPageInfo().pageNumber > startingPage) drawSecondaryPage();
        },
    });

    drawPaper();
    setFill(doc, COLORS.red);
    doc.rect(0, 0, PAGE_WIDTH, 4, 'F');
    setFill(doc, COLORS.graphite);
    doc.roundedRect(MARGIN, 17, CONTENT_WIDTH, 55, 1.5, 1.5, 'F');
    setFill(doc, COLORS.red);
    doc.rect(MARGIN, 17, 4, 55, 'F');
    drawWordmark(MARGIN + 11, 29, true);
    setFont('bold');
    doc.setFontSize(7.5);
    setText(doc, COLORS.red);
    doc.text('КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ', MARGIN + 11, 39);
    setFont('bold');
    doc.setFontSize(input.area >= 1000 ? 18 : 21);
    setText(doc, COLORS.white);
    doc.text(`КАРКАСНЫЙ ДОМ ${input.area} М²`, MARGIN + 11, 51.5);
    setFont('normal');
    doc.setFontSize(8.5);
    setText(doc, COLORS.white);
    doc.text('Три варианта комплектации на основе актуальных смет компании', MARGIN + 11, 62.5);

    autoTable(doc, {
        startY: 80,
        body: [
            ['ПЛОЩАДЬ', `${input.area} м²`, 'ЭТАЖНОСТЬ', String(input.floors)],
            ['ОКНА', String(input.windows), 'ДВЕРИ', String(input.doors)],
            ['КРЫША', input.roof, 'ВЫБРАН ВАРИАНТ', model.selectedLabel],
        ],
        theme: 'grid',
        styles: { font, fontSize: 8.5, cellPadding: { top: 3, right: 3, bottom: 3, left: 3 }, textColor: COLORS.text, lineColor: COLORS.line, lineWidth: 0.25, fillColor: COLORS.row },
        columnStyles: {
            0: { cellWidth: 27, fontStyle: 'bold', fontSize: 7, textColor: COLORS.red },
            1: { cellWidth: 64, fontStyle: 'bold' },
            2: { cellWidth: 31, fontStyle: 'bold', fontSize: 7, textColor: COLORS.red },
            3: { cellWidth: 60, fontStyle: 'bold' },
        },
        margin: { left: MARGIN, right: MARGIN },
    });

    let y = sectionTitle('Сравнение вариантов', (doc.lastAutoTable?.finalY ?? 110) + 10);
    const comparisonStartPage = doc.getCurrentPageInfo().pageNumber;
    autoTable(doc, {
        startY: y,
        head: [['ВАРИАНТ', 'ГОТОВНОСТЬ', 'СТОИМОСТЬ', 'ПРЕДВАРИТЕЛЬНЫЙ ДИАПАЗОН']],
        body: model.variants.map(variant => [
            `${variant.selected ? 'ВЫБРАНО · ' : ''}${variant.label}`,
            variant.description,
            money(variant.base),
            `${money(variant.low)} – ${money(variant.high)}`,
        ]),
        theme: 'grid',
        styles: { font, fontSize: 7.6, cellPadding: 2.8, textColor: COLORS.text, lineColor: COLORS.line, lineWidth: 0.25, valign: 'middle' },
        headStyles: { fillColor: COLORS.graphite, textColor: COLORS.white, fontStyle: 'bold', fontSize: 6.5 },
        bodyStyles: { fillColor: COLORS.row },
        alternateRowStyles: { fillColor: COLORS.row },
        columnStyles: {
            0: { cellWidth: 31, fontStyle: 'bold' },
            1: { cellWidth: 58 },
            2: { cellWidth: 36, halign: 'right', fontStyle: 'bold' },
            3: { cellWidth: 57, halign: 'right' },
        },
        didParseCell: data => {
            if (data.section === 'body' && model.variants[data.row.index]?.selected) {
                data.cell.styles.fillColor = COLORS.paleRed;
                if (data.column.index === 0) data.cell.styles.textColor = COLORS.red;
            }
        },
        ...tableContinuation(comparisonStartPage),
    });

    y = (doc.lastAutoTable?.finalY ?? y) + 10;
    if (y > 235) {
        addSecondaryPage();
        y = 28;
    }
    setFont('bold');
    doc.setFontSize(12.5);
    setText(doc, COLORS.graphite);
    doc.text(`Выбранный вариант: ${model.selectedLabel}`, MARGIN, y);
    y += 6;
    setFill(doc, COLORS.graphiteSoft);
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 27, 1.5, 1.5, 'F');
    setFont('bold');
    doc.setFontSize(6.8);
    setText(doc, COLORS.red);
    doc.text('ПРЕДВАРИТЕЛЬНАЯ СТОИМОСТЬ', MARGIN + 7, y + 8);
    setFont('bold');
    doc.setFontSize(19);
    setText(doc, COLORS.white);
    doc.text(money(model.selectedBase), MARGIN + 7, y + 20.5);
    setFont('normal');
    doc.setFontSize(8.4);
    setText(doc, COLORS.white);
    doc.text(`Рабочий диапазон: ${money(model.selectedLow)} – ${money(model.selectedHigh)}`, PAGE_WIDTH - MARGIN - 7, y + 17.5, { align: 'right' });

    addSecondaryPage();
    y = sectionTitle('Этапы и разделы строительства', 29);
    const sectionsStartPage = doc.getCurrentPageInfo().pageNumber;
    autoTable(doc, {
        startY: y,
        head: [['РАЗДЕЛ', 'СТОИМОСТЬ']],
        body: model.sections.length
            ? model.sections.map(section => [section.label, money(section.total)])
            : [['Состав разделов уточняется после выбора проекта', '—']],
        theme: 'grid',
        styles: { font, fontSize: 8.5, cellPadding: 3, textColor: COLORS.text, lineColor: COLORS.line, lineWidth: 0.25 },
        headStyles: { fillColor: COLORS.graphite, textColor: COLORS.white, fontStyle: 'bold', fontSize: 7 },
        bodyStyles: { fillColor: COLORS.row },
        columnStyles: { 0: { cellWidth: 128 }, 1: { cellWidth: 54, halign: 'right', fontStyle: 'bold' } },
        ...tableContinuation(sectionsStartPage),
    });

    y = (doc.lastAutoTable?.finalY ?? y) + 11;
    if (y > 235) {
        addSecondaryPage();
        y = 29;
    }
    y = sectionTitle('За что производится оплата', y);
    const financialStartPage = doc.getCurrentPageInfo().pageNumber;
    autoTable(doc, {
        startY: y,
        head: [['СТАТЬЯ', 'СТОИМОСТЬ']],
        body: model.financialRows.map(row => [row.label, money(row.value)]),
        theme: 'grid',
        styles: { font, fontSize: 8.5, cellPadding: 3, textColor: COLORS.text, lineColor: COLORS.line, lineWidth: 0.25 },
        headStyles: { fillColor: COLORS.graphite, textColor: COLORS.white, fontStyle: 'bold', fontSize: 7 },
        bodyStyles: { fillColor: COLORS.row },
        columnStyles: { 0: { cellWidth: 128 }, 1: { cellWidth: 54, halign: 'right', fontStyle: 'bold' } },
        didParseCell: data => {
            if (data.section === 'body' && model.financialRows[data.row.index]?.value < 0 && data.column.index === 1) {
                data.cell.styles.textColor = COLORS.positive;
            }
        },
        ...tableContinuation(financialStartPage),
    });

    const drawTextCard = (title: string, value: string, requestedY: number): number => {
        let top = requestedY;
        if (top + 28 > CONTENT_BOTTOM) {
            addSecondaryPage();
            top = 28;
        }
        sectionTitle(title, top);
        const cardStartPage = doc.getCurrentPageInfo().pageNumber;
        autoTable(doc, {
            startY: top + 5,
            body: [[value]],
            theme: 'plain',
            styles: {
                font,
                fontSize: 8.8,
                cellPadding: { top: 6, right: 7, bottom: 6, left: 8 },
                textColor: COLORS.text,
                fillColor: COLORS.row,
                minCellHeight: 18,
                overflow: 'linebreak',
            },
            margin: { left: MARGIN, right: MARGIN, bottom: 23, top: 23 },
            didDrawCell: data => {
                if (data.section !== 'body') return;
                setFill(doc, COLORS.red);
                doc.rect(data.cell.x, data.cell.y, 2.2, data.cell.height, 'F');
            },
            willDrawPage: () => {
                if (doc.getCurrentPageInfo().pageNumber > cardStartPage) drawSecondaryPage();
            },
        });
        return doc.lastAutoTable?.finalY ?? top + 28;
    };

    y = (doc.lastAutoTable?.finalY ?? y) + 12;
    if (model.clientDescription) y = drawTextCard('Пожелания клиента', model.clientDescription, y) + 10;
    drawTextCard('Предварительный расчёт', model.preliminaryText, y);

    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        setDraw(doc, COLORS.line);
        doc.setLineWidth(0.25);
        doc.line(MARGIN, 282, PAGE_WIDTH - MARGIN, 282);
        setFont('normal');
        doc.setFontSize(6.8);
        setText(doc, COLORS.muted);
        doc.text('КАРКАС МАСТЕР · ПРЕДВАРИТЕЛЬНОЕ КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ', MARGIN, 288);
        doc.text(`СТРАНИЦА ${page} / ${pageCount}`, PAGE_WIDTH - MARGIN, 288, { align: 'right' });
    }

    return doc;
};

export async function downloadHouseProposalPdf(input: HouseProposalPdfInput): Promise<void> {
    const assets = await loadPremiumPdfResources();
    if (!assets.fontBase64) throw new Error('Не удалось загрузить кириллический шрифт для PDF.');
    const doc = createHouseProposalPdf(input, assets);
    if (!doc.getFontList()[PDF_FONT_NAME]) throw new Error('Не удалось зарегистрировать кириллический шрифт для PDF.');
    doc.save(houseProposalPdfFileName(input.area));
}
