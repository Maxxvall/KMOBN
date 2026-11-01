import type { Estimate, Material } from '../types';

// Единая точка экспорта документов: динамические импорты держат jsPDF и
// генераторы вне стартового чанка — загрузка происходит только при выборе
// пользователем конкретного формата.

export const exportEstimatePdfPlain = async (estimate: Estimate, title?: string): Promise<void> => {
    const { generatePdf } = await import('./pdfGenerator');
    await generatePdf(estimate, title);
};

export const exportEstimatePdfColored = async (estimate: Estimate, materials: readonly Material[], title?: string): Promise<void> => {
    const { generatePdf } = await import('./pdfGenerator2');
    await generatePdf(estimate, materials, title);
};

export const exportContractPdf = async (estimate: Estimate, contractName: string): Promise<void> => {
    const { generatePdfContract } = await import('./pdfContractGenerator');
    await generatePdfContract(estimate, contractName);
};
