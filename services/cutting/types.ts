export const CUTTING_STAGE_ORDER = [
    'rostverk',
    'subfloor',
    'joists',
    'walls',
    'roof',
    'exterior',
    'other',
] as const;

export type CuttingStageId = typeof CUTTING_STAGE_ORDER[number];

export const CUTTING_STAGE_LABELS: Record<CuttingStageId, string> = {
    rostverk: 'Ростверк',
    subfloor: 'Черновой пол',
    joists: 'Лаги и бриджи',
    walls: 'Стены',
    roof: 'Кровля',
    exterior: 'Фасад и терраса',
    other: 'Прочее',
};

export interface CuttingItem {
    id: string;
    sourceRow: number;
    construction: string;
    section: string;
    length: number;
    width?: number;
    thickness?: number;
    quantity: number;
    volumeM3?: number;
    isSheet: boolean;
    stage: CuttingStageId;
}

export type CuttingIssueSeverity = 'error' | 'warning';

export interface CuttingImportIssue {
    id: string;
    sourceRow: number;
    itemId?: string;
    severity: CuttingIssueSeverity;
    code: 'missing-section' | 'missing-sheet-width' | 'invalid-value' | 'oversized-board-part' | 'oversized-sheet-part';
    message: string;
}

export interface CuttingImportResult {
    fileName: string;
    items: CuttingItem[];
    issues: CuttingImportIssue[];
    skippedRows: number;
}

export interface CuttingSettings {
    boardStockLength: number;
    maxBoardPartLength: number;
    boardKerf: number;
    usefulOffcutLength: number;
    separateStages: boolean;
    sheetWidth: number;
    sheetHeight: number;
    sheetKerf: number;
    allowSheetRotation: boolean;
    sheetProfiles: Record<string, SheetStockProfile>;
}

export interface SheetStockProfile {
    width: number;
    height: number;
    kerf: number;
    allowRotation: boolean;
}

export const DEFAULT_CUTTING_SETTINGS: CuttingSettings = {
    boardStockLength: 6050,
    maxBoardPartLength: 6000,
    boardKerf: 4,
    usefulOffcutLength: 500,
    separateStages: false,
    sheetWidth: 1525,
    sheetHeight: 1525,
    sheetKerf: 5,
    allowSheetRotation: true,
    sheetProfiles: {},
};

export const getSheetStockProfile = (settings: CuttingSettings, material: string): SheetStockProfile => (
    settings.sheetProfiles[material] ?? {
        width: settings.sheetWidth,
        height: settings.sheetHeight,
        kerf: settings.sheetKerf,
        allowRotation: settings.allowSheetRotation,
    }
);

export interface BoardCut {
    id: string;
    itemId: string;
    construction: string;
    section: string;
    stage: CuttingStageId;
    length: number;
}

export interface CuttingBoard {
    id: string;
    section: string;
    stockLength: number;
    cuts: BoardCut[];
    usedLength: number;
    wasteLength: number;
    usefulOffcut: boolean;
}

export interface CuttingPattern {
    key: string;
    section: string;
    stockLength: number;
    boardIds: string[];
    cuts: BoardCut[];
    usedLength: number;
    wasteLength: number;
}

export interface BoardPurchaseRow {
    section: string;
    stockLength: number;
    quantity: number;
    volumeM3: number;
    wasteLength: number;
    wastePercentage: number;
}

export interface PlacedSheetPart extends BoardCut {
    x: number;
    y: number;
    width: number;
    height: number;
    rotated: boolean;
}

export interface CuttingSheet {
    id: string;
    material: string;
    thickness?: number;
    width: number;
    height: number;
    parts: PlacedSheetPart[];
    usedArea: number;
    wasteArea: number;
    wastePercentage: number;
}

export interface SheetPurchaseRow {
    material: string;
    thickness?: number;
    sheetWidth: number;
    sheetHeight: number;
    quantity: number;
}

export interface CuttingPlan {
    boards: CuttingBoard[];
    patterns: CuttingPattern[];
    boardPurchase: BoardPurchaseRow[];
    sheets: CuttingSheet[];
    sheetPurchase: SheetPurchaseRow[];
    totalBoardWastePercentage: number;
    totalSheetWastePercentage: number;
}
