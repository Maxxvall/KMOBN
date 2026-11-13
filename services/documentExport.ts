import type { Estimate, Material } from '../types';

// Единая точка экспорта документов: динамические импорты держат jsPDF и
// генераторы вне стартового чанка — загрузка происходит только при выборе
// пользователем конкретного формата.

export const exportEstimatePdfPlain = async (estimate: Estimate, title?: string): Promise<void> => {
    const { generatePdf } = await import('./pdfGenerator');
    await generatePdf(estimate, title);
};

export const exportEstimatePdfColored = async (estimate: Estimate, materials: readonly Material[], title?: string): Promise<void> => {
    const { createPremiumEstimatePdf, premiumEstimateFileName } = await import('./premiumPdf');
    const { loadPremiumPdfResources } = await import('./pdfUtils');
    const { fontBase64, boldFontBase64 } = await loadPremiumPdfResources();

    if (!fontBase64) {
        throw new Error('Не удалось загрузить кириллический шрифт для премиального PDF.');
    }

    const doc = createPremiumEstimatePdf(
        estimate,
        { fontBase64, boldFontBase64 },
        { materials, title },
    );
    doc.save(premiumEstimateFileName(estimate, title));
};

export const exportContractPdf = async (estimate: Estimate, contractName: string): Promise<void> => {
    const { generatePdfContract } = await import('./pdfContractGenerator');
    await generatePdfContract(estimate, contractName);
};
