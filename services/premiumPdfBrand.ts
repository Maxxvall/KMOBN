import type { jsPDF } from 'jspdf';

export type PremiumPdfRgb = [number, number, number];

export const PREMIUM_PDF_LINKS = {
    website: 'https://karkasmaster.ru',
    phone: 'tel:+79533337171',
    email: 'mailto:karkasmasterobn@gmail.com',
    max: 'https://web.max.ru/399106591',
    telegram: 'https://t.me/karkasmaster40',
    vk: 'https://vk.com/kmobn',
} as const;

export const PREMIUM_PDF_COLORS = {
    graphite: [16, 19, 24] as PremiumPdfRgb,
    graphiteSoft: [23, 27, 33] as PremiumPdfRgb,
    red: [239, 65, 54] as PremiumPdfRgb,
    paper: [244, 241, 233] as PremiumPdfRgb,
    white: [255, 255, 255] as PremiumPdfRgb,
    row: [251, 250, 247] as PremiumPdfRgb,
    line: [216, 210, 199] as PremiumPdfRgb,
    text: [23, 26, 31] as PremiumPdfRgb,
    muted: [105, 112, 120] as PremiumPdfRgb,
    paleRed: [252, 235, 232] as PremiumPdfRgb,
} as const;

export const PREMIUM_PDF_PAGE = {
    width: 210,
    height: 297,
    margin: 14,
    contentWidth: 182,
    contentBottom: 276,
    footerLineY: 281,
    footerTextY: 288,
} as const;

export interface PremiumPdfBrand {
    drawPaper: () => void;
    drawFirstPageHeader: (config: { eyebrow: string; title: string; rightTop: string; rightBottom?: string }) => number;
    drawContinuationHeader: (meta: string) => number;
    overlayContinuationHeader: (meta: string) => void;
    drawSectionBanner: (title: string, top: number, subtitle?: string) => number;
    addFooters: (centerLabel: string) => void;
}

export const createPremiumPdfBrand = (doc: jsPDF, fontName: string): PremiumPdfBrand => {
    const colors = PREMIUM_PDF_COLORS;
    const page = PREMIUM_PDF_PAGE;
    const setFont = (style: 'normal' | 'bold' = 'normal') => doc.setFont(fontName, style);
    const setFill = (color: PremiumPdfRgb) => doc.setFillColor(...color);
    const setDraw = (color: PremiumPdfRgb) => doc.setDrawColor(...color);
    const setText = (color: PremiumPdfRgb) => doc.setTextColor(...color);

    const linkArea = (x: number, top: number, width: number, height: number, url: string) => {
        doc.link(x, top, Math.max(width, 1), Math.max(height, 1), { url });
    };

    const drawPaper = () => {
        setFill(colors.paper);
        doc.rect(0, 0, page.width, page.height, 'F');
    };

    const drawWordmark = (baseline: number, light: boolean) => {
        setFont('bold');
        doc.setFontSize(10.5);
        setText(light ? colors.white : colors.graphite);
        doc.text('КАРКАС', page.margin, baseline);
        const firstWidth = doc.getTextWidth('КАРКАС');
        setText(colors.red);
        doc.text('МАСТЕР', page.margin + firstWidth + 1.2, baseline);
        const totalWidth = firstWidth + 1.2 + doc.getTextWidth('МАСТЕР');
        setDraw(colors.red);
        doc.setLineWidth(0.35);
        doc.line(page.margin, baseline + 1.7, page.margin + totalWidth, baseline + 1.7);
        linkArea(page.margin, baseline - 5, totalWidth, 8, PREMIUM_PDF_LINKS.website);
    };

    const drawWebsite = (baseline: number, light: boolean) => {
        setFont('normal');
        doc.setFontSize(8);
        setText(light ? colors.white : colors.muted);
        const text = 'KARKASMASTER.RU';
        const width = doc.getTextWidth(text);
        doc.text(text, page.width - page.margin, baseline, { align: 'right' });
        linkArea(page.width - page.margin - width, baseline - 5, width, 7, PREMIUM_PDF_LINKS.website);
    };

    const drawFirstPageHeader: PremiumPdfBrand['drawFirstPageHeader'] = ({ eyebrow, title, rightTop, rightBottom }) => {
        drawPaper();
        setFill(colors.red);
        doc.rect(0, 0, page.width, 4, 'F');
        doc.rect(0, 4, 3.5, 44, 'F');
        setFill(colors.graphite);
        doc.rect(3.5, 4, page.width - 3.5, 44, 'F');
        drawWordmark(16, true);
        drawWebsite(16, true);

        setFont('bold');
        doc.setFontSize(7.2);
        setText(colors.red);
        doc.text(eyebrow.toUpperCase(), page.margin, 28);
        setFont('bold');
        doc.setFontSize(20);
        setText(colors.white);
        doc.text(title.toUpperCase(), page.margin, 40, { maxWidth: 132 });

        setFont('normal');
        doc.setFontSize(8.2);
        setText(colors.white);
        doc.text(rightTop, page.width - page.margin, 35.5, { align: 'right', maxWidth: 49 });
        if (rightBottom) {
            doc.setFontSize(7.2);
            doc.text(rightBottom, page.width - page.margin, 40.5, { align: 'right', maxWidth: 49 });
        }
        return 54;
    };

    const overlayContinuationHeader = (meta: string): void => {
        setFill(colors.red);
        doc.rect(0, 0, page.width, 3.5, 'F');
        drawWordmark(16, false);
        setFont('normal');
        doc.setFontSize(8);
        setText(colors.muted);
        doc.text(meta, page.width - page.margin, 16, { align: 'right', maxWidth: 105 });
        setDraw(colors.line);
        doc.setLineWidth(0.35);
        doc.line(page.margin, 23, page.width - page.margin, 23);
    };

    const drawContinuationHeader = (meta: string): number => {
        drawPaper();
        overlayContinuationHeader(meta);
        return 29;
    };

    const drawSectionBanner = (title: string, top: number, subtitle?: string): number => {
        const height = subtitle ? 14 : 10;
        setFill(colors.graphiteSoft);
        doc.rect(page.margin, top, page.contentWidth, height, 'F');
        setFill(colors.red);
        doc.rect(page.margin, top, 2.4, height, 'F');
        setFont('bold');
        doc.setFontSize(9.2);
        setText(colors.white);
        doc.text(title.toUpperCase(), page.margin + 5, top + 6.2);
        if (subtitle) {
            setFont('normal');
            doc.setFontSize(6.8);
            setText(colors.white);
            doc.text(subtitle, page.margin + 5, top + 10.7, { maxWidth: page.contentWidth - 10 });
        }
        return top + height;
    };

    const addFooters = (centerLabel: string) => {
        const pageCount = doc.getNumberOfPages();
        for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
            doc.setPage(pageNumber);
            setDraw(colors.line);
            doc.setLineWidth(0.3);
            doc.line(page.margin, page.footerLineY, page.width - page.margin, page.footerLineY);
            setFont('normal');
            doc.setFontSize(7.2);
            setText(colors.muted);
            const website = 'KARKASMASTER.RU';
            doc.text(website, page.margin, page.footerTextY);
            linkArea(page.margin, page.footerTextY - 5, doc.getTextWidth(website), 7, PREMIUM_PDF_LINKS.website);
            doc.text(centerLabel.toUpperCase(), page.width / 2, page.footerTextY, { align: 'center' });
            doc.text(`${String(pageNumber).padStart(2, '0')} / ${String(pageCount).padStart(2, '0')}`, page.width - page.margin, page.footerTextY, { align: 'right' });
        }
    };

    return { drawPaper, drawFirstPageHeader, drawContinuationHeader, overlayContinuationHeader, drawSectionBanner, addFooters };
};
