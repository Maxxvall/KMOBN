import { Estimate, Material } from '../types';
import { loadPremiumPdfResources } from './pdfUtils';
import {
    createPremiumEstimatePdf,
    premiumEstimateFileName,
} from './premiumPdf';

export { createPremiumEstimatePdf } from './premiumPdf';

export const generatePdf = async (
    estimate: Estimate,
    materials: readonly Pick<Material, 'id' | 'link'>[] = [],
): Promise<void> => {
    const { fontBase64, boldFontBase64 } = await loadPremiumPdfResources();

    if (!fontBase64) {
        throw new Error('Не удалось загрузить кириллический шрифт для премиального PDF.');
    }

    const doc = createPremiumEstimatePdf(
        estimate,
        { fontBase64, boldFontBase64 },
        { materials },
    );
    doc.save(premiumEstimateFileName(estimate));
};
