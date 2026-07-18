export type SheetMaterialKind = 'osb' | 'plywood';

export interface RoomSheetProfile {
    kind: SheetMaterialKind;
    label: string;
    length: number;
    width: number;
}

export interface SheetRoomInput {
    id: string;
    name: string;
    material: SheetMaterialKind;
    length: number;
    width: number;
}

export interface RoomSheetLayout {
    sheetLength: number;
    sheetWidth: number;
    columns: number;
    rows: number;
    sheetCount: number;
    roomAreaM2: number;
    purchaseAreaM2: number;
    wasteAreaM2: number;
    rotated: boolean;
}

export const SHEET_STOCK_PROFILES: Record<SheetMaterialKind, RoomSheetProfile> = {
    osb: { kind: 'osb', label: 'OSB', length: 2500, width: 1250 },
    plywood: { kind: 'plywood', label: 'Фанера', length: 1525, width: 1525 },
};

const layoutForOrientation = (
    roomLength: number,
    roomWidth: number,
    sheetLength: number,
    sheetWidth: number,
    rotated: boolean,
): RoomSheetLayout => {
    const columns = Math.ceil(roomLength / sheetLength);
    const rows = Math.ceil(roomWidth / sheetWidth);
    const sheetCount = columns * rows;
    const roomAreaM2 = roomLength * roomWidth / 1_000_000;
    const purchaseAreaM2 = sheetCount * sheetLength * sheetWidth / 1_000_000;
    return {
        sheetLength,
        sheetWidth,
        columns,
        rows,
        sheetCount,
        roomAreaM2,
        purchaseAreaM2,
        wasteAreaM2: Math.max(0, purchaseAreaM2 - roomAreaM2),
        rotated,
    };
};

export const calculateRoomSheetLayout = (
    roomLength: number,
    roomWidth: number,
    profile: RoomSheetProfile,
): RoomSheetLayout | null => {
    if (!Number.isFinite(roomLength) || roomLength <= 0 || !Number.isFinite(roomWidth) || roomWidth <= 0) return null;

    const direct = layoutForOrientation(roomLength, roomWidth, profile.length, profile.width, false);
    if (profile.length === profile.width) return direct;

    const rotated = layoutForOrientation(roomLength, roomWidth, profile.width, profile.length, true);
    return [direct, rotated].sort((left, right) => (
        left.sheetCount - right.sheetCount
        || left.wasteAreaM2 - right.wasteAreaM2
        || Number(left.rotated) - Number(right.rotated)
    ))[0];
};
