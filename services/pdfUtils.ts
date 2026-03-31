import type { jsPDF } from 'jspdf';
import LiberationFontUrl from '../assets/LiberationSans-Regular.ttf?url';
import logoUrl from '../logo/acetone-2025920-104546-498.png?url';

const PDF_FONT_FILE = 'LiberationSans-Regular.ttf';
export const PDF_FONT_NAME = 'LiberationSans';

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;

    for (let index = 0; index < bytes.length; index += chunk) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(index, index + chunk)));
    }

    return btoa(binary);
};

let cachedFont: string | null = null;
let cachedLogo: string | null = null;
let fontLoadPromise: Promise<string | null> | null = null;
let logoLoadPromise: Promise<string | null> | null = null;

const fetchResourceAsBase64 = async (url: string): Promise<string> => {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to load PDF resource: ${response.status} ${response.statusText}`);
    }
    return arrayBufferToBase64(await response.arrayBuffer());
};

const loadCachedResource = (
    currentValue: string | null,
    inFlight: Promise<string | null> | null,
    url: string,
    onLoaded: (value: string | null) => void,
    onInFlightChange: (value: Promise<string | null> | null) => void,
    label: string,
): Promise<string | null> => {
    if (currentValue) {
        return Promise.resolve(currentValue);
    }

    if (inFlight) {
        return inFlight;
    }

    const request = fetchResourceAsBase64(url)
        .then((value) => {
            onLoaded(value);
            return value;
        })
        .catch((error) => {
            console.error(`Failed to load ${label} for PDF generation:`, error);
            return null;
        })
        .finally(() => {
            onInFlightChange(null);
        });

    onInFlightChange(request);
    return request;
};

export async function loadPdfResources(): Promise<{ fontBase64: string | null; logoBase64: string | null }> {
    const [fontBase64, logoBase64] = await Promise.all([
        loadCachedResource(
            cachedFont,
            fontLoadPromise,
            LiberationFontUrl,
            (value) => {
                cachedFont = value;
            },
            (value) => {
                fontLoadPromise = value;
            },
            'LiberationSans font',
        ),
        loadCachedResource(
            cachedLogo,
            logoLoadPromise,
            logoUrl,
            (value) => {
                cachedLogo = value;
            },
            (value) => {
                logoLoadPromise = value;
            },
            'logo',
        ),
    ]);

    return { fontBase64, logoBase64 };
}

export function registerPdfFont(doc: jsPDF, fontBase64: string | null): void {
    if (!fontBase64) {
        return;
    }

    try {
        doc.addFileToVFS(PDF_FONT_FILE, fontBase64);
        doc.addFont(PDF_FONT_FILE, PDF_FONT_NAME, 'normal');
        doc.addFont(PDF_FONT_FILE, PDF_FONT_NAME, 'bold');
        doc.setFont(PDF_FONT_NAME, 'normal');
    } catch (error) {
        console.error('Failed to setup LiberationSans font for PDF generation:', error);
    }
}