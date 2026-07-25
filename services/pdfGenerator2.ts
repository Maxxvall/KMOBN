import { Estimate } from '../types';
import { loadPremiumPdfResources } from './pdfUtils';
import {
    createPremiumEstimatePdf,
    premiumEstimateFileName,
} from './premiumPdf';

export { createPremiumEstimatePdf } from './premiumPdf';

export const generatePdf = async (estimate: Estimate): Promise<void> => {
    const { fontBase64, boldFontBase64 } = await loadPremiumPdfResources();

    if (!fontBase64) {
        throw new Error('Не удалось загрузить кириллический шрифт для премиального PDF.');
    }

    const doc = createPremiumEstimatePdf(estimate, { fontBase64, boldFontBase64 });
    doc.save(premiumEstimateFileName(estimate));
};
