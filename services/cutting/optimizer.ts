import { compareCuttingStages } from './stageOrder';
import {
    BoardCut,
    BoardPurchaseRow,
    CuttingBoard,
    CuttingItem,
    CuttingPattern,
    CuttingPlan,
    CuttingSettings,
    CuttingSheet,
    getSheetStockProfile,
    PlacedSheetPart,
    SheetStockProfile,
    SheetPurchaseRow,
} from './types';

interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface SheetPiece extends BoardCut {
    width: number;
    height: number;
    thickness?: number;
}

const expandBoardCuts = (items: CuttingItem[]): BoardCut[] => items
    .filter(item => !item.isSheet)
    .flatMap(item => Array.from({ length: item.quantity }, (_, index) => ({
        id: `${item.id}-${index + 1}`,
        itemId: item.id,
        construction: item.construction,
        section: item.section,
        stage: item.stage,
        length: item.length,
    })));

const getUsedLength = (cuts: BoardCut[], kerf: number): number => (
    cuts.reduce((total, cut) => total + cut.length, 0) + Math.max(0, cuts.length - 1) * kerf
);

const packFirstFit = (cuts: BoardCut[], settings: CuttingSettings): CuttingBoard[] => {
    const boards: CuttingBoard[] = [];
    for (const cut of cuts) {
        const target = boards.find(board => {
            const addedLength = cut.length + (board.cuts.length > 0 ? settings.boardKerf : 0);
            return board.usedLength + addedLength <= settings.boardStockLength;
        });
        if (target) {
            target.cuts.push(cut);
            target.usedLength = getUsedLength(target.cuts, settings.boardKerf);
            continue;
        }
        boards.push({
            id: '',
            section: cut.section,
            stockLength: settings.boardStockLength,
            cuts: [cut],
            usedLength: cut.length,
            wasteLength: 0,
            usefulOffcut: false,
        });
    }
    return boards;
};

const packBestFit = (cuts: BoardCut[], settings: CuttingSettings): CuttingBoard[] => {
    const boards: CuttingBoard[] = [];
    for (const cut of cuts) {
        let best: CuttingBoard | undefined;
        let bestRemaining = Number.POSITIVE_INFINITY;
        for (const board of boards) {
            const addedLength = cut.length + (board.cuts.length > 0 ? settings.boardKerf : 0);
            const remaining = settings.boardStockLength - board.usedLength - addedLength;
            if (remaining >= 0 && remaining < bestRemaining) {
                best = board;
                bestRemaining = remaining;
            }
        }
        if (best) {
            best.cuts.push(cut);
            best.usedLength = getUsedLength(best.cuts, settings.boardKerf);
            continue;
        }
        boards.push({
            id: '',
            section: cut.section,
            stockLength: settings.boardStockLength,
            cuts: [cut],
            usedLength: cut.length,
            wasteLength: 0,
            usefulOffcut: false,
        });
    }
    return boards;
};

const finalizeBoards = (boards: CuttingBoard[], settings: CuttingSettings): CuttingBoard[] => boards.map(board => {
    const usedLength = getUsedLength(board.cuts, settings.boardKerf);
    const wasteLength = Math.max(0, settings.boardStockLength - usedLength);
    return { ...board, usedLength, wasteLength, usefulOffcut: wasteLength >= settings.usefulOffcutLength };
});

const usefulOffcutTotal = (boards: CuttingBoard[], threshold: number): number => boards.reduce(
    (total, board) => total + (board.wasteLength >= threshold ? board.wasteLength : 0),
    0,
);

const chooseBoards = (left: CuttingBoard[], right: CuttingBoard[], settings: CuttingSettings): CuttingBoard[] => {
    if (left.length !== right.length) return left.length < right.length ? left : right;
    const leftUseful = usefulOffcutTotal(left, settings.usefulOffcutLength);
    const rightUseful = usefulOffcutTotal(right, settings.usefulOffcutLength);
    return rightUseful > leftUseful ? right : left;
};

const optimizeBoards = (items: CuttingItem[], settings: CuttingSettings): CuttingBoard[] => {
    const groups = new Map<string, BoardCut[]>();
    for (const cut of expandBoardCuts(items)) {
        const key = settings.separateStages ? `${cut.section}::${cut.stage}` : cut.section;
        const group = groups.get(key) ?? [];
        group.push(cut);
        groups.set(key, group);
    }

    const result: CuttingBoard[] = [];
    for (const cuts of groups.values()) {
        const sorted = [...cuts].sort((left, right) => (
            right.length - left.length
            || compareCuttingStages(left.stage, right.stage)
            || left.construction.localeCompare(right.construction, 'ru')
            || left.id.localeCompare(right.id)
        ));
        const firstFit = finalizeBoards(packFirstFit(sorted, settings), settings);
        const bestFit = finalizeBoards(packBestFit(sorted, settings), settings);
        result.push(...chooseBoards(firstFit, bestFit, settings));
    }

    return result.map((board, index) => ({ ...board, id: `Д-${index + 1}` }));
};

const createPatterns = (boards: CuttingBoard[]): CuttingPattern[] => {
    const patterns = new Map<string, CuttingPattern>();
    for (const board of boards) {
        const cutKey = [...board.cuts]
            .sort((left, right) => right.length - left.length || left.construction.localeCompare(right.construction, 'ru'))
            .map(cut => `${cut.length}:${cut.construction}:${cut.stage}`)
            .join('|');
        const key = `${board.section}:${board.stockLength}:${cutKey}`;
        const existing = patterns.get(key);
        if (existing) {
            existing.boardIds.push(board.id);
        } else {
            patterns.set(key, {
                key,
                section: board.section,
                stockLength: board.stockLength,
                boardIds: [board.id],
                cuts: board.cuts,
                usedLength: board.usedLength,
                wasteLength: board.wasteLength,
            });
        }
    }
    return [...patterns.values()];
};

const createBoardPurchase = (boards: CuttingBoard[]): BoardPurchaseRow[] => {
    const rows = new Map<string, BoardPurchaseRow>();
    for (const board of boards) {
        const key = `${board.section}:${board.stockLength}`;
        const match = board.section.match(/(\d+(?:[.,]\d+)?)\s*[xх×]\s*(\d+(?:[.,]\d+)?)/i);
        const crossSection = match ? Number(match[1].replace(',', '.')) * Number(match[2].replace(',', '.')) : 0;
        const existing = rows.get(key);
        if (existing) {
            existing.quantity += 1;
            existing.volumeM3 += (crossSection * board.stockLength) / 1_000_000_000;
        } else {
            rows.set(key, {
                section: board.section,
                stockLength: board.stockLength,
                quantity: 1,
                volumeM3: (crossSection * board.stockLength) / 1_000_000_000,
            });
        }
    }
    return [...rows.values()].sort((left, right) => left.section.localeCompare(right.section, 'ru'));
};

const expandSheetPieces = (items: CuttingItem[]): SheetPiece[] => items
    .filter(item => item.isSheet && item.width && item.width > 0)
    .flatMap(item => Array.from({ length: item.quantity }, (_, index) => ({
        id: `${item.id}-${index + 1}`,
        itemId: item.id,
        construction: item.construction,
        section: item.section,
        stage: item.stage,
        length: item.length,
        width: item.width!,
        height: item.length,
        thickness: item.thickness,
    })));

const placeSheetPiece = (
    piece: SheetPiece,
    freeRects: Rect[],
    profile: SheetStockProfile,
): { placed?: PlacedSheetPart; freeRects: Rect[] } => {
    let bestIndex = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    let rotated = false;
    let placedWidth = piece.width;
    let placedHeight = piece.height;

    freeRects.forEach((rect, index) => {
        const candidates = [
            { width: piece.width, height: piece.height, rotated: false },
            ...(profile.allowRotation ? [{ width: piece.height, height: piece.width, rotated: true }] : []),
        ];
        for (const candidate of candidates) {
            if (candidate.width <= rect.width && candidate.height <= rect.height) {
                const score = rect.width * rect.height - candidate.width * candidate.height;
                if (score < bestScore) {
                    bestIndex = index;
                    bestScore = score;
                    rotated = candidate.rotated;
                    placedWidth = candidate.width;
                    placedHeight = candidate.height;
                }
            }
        }
    });

    if (bestIndex < 0) return { freeRects };
    const target = freeRects[bestIndex];
    const next = freeRects.filter((_, index) => index !== bestIndex);
    const rightWidth = target.width - placedWidth - profile.kerf;
    const bottomHeight = target.height - placedHeight - profile.kerf;
    if (rightWidth > 0) {
        next.push({
            x: target.x + placedWidth + profile.kerf,
            y: target.y,
            width: rightWidth,
            height: placedHeight,
        });
    }
    if (bottomHeight > 0) {
        next.push({
            x: target.x,
            y: target.y + placedHeight + profile.kerf,
            width: target.width,
            height: bottomHeight,
        });
    }

    return {
        freeRects: next,
        placed: {
            ...piece,
            x: target.x,
            y: target.y,
            width: placedWidth,
            height: placedHeight,
            rotated,
        },
    };
};

const optimizeSheets = (items: CuttingItem[], settings: CuttingSettings): CuttingSheet[] => {
    const groups = new Map<string, SheetPiece[]>();
    for (const piece of expandSheetPieces(items)) {
        const key = settings.separateStages ? `${piece.section}::${piece.stage}` : piece.section;
        const group = groups.get(key) ?? [];
        group.push(piece);
        groups.set(key, group);
    }

    const sheets: CuttingSheet[] = [];
    for (const pieces of groups.values()) {
        const profile = getSheetStockProfile(settings, pieces[0].section);
        const sorted = [...pieces].sort((left, right) => (
            right.width * right.height - left.width * left.height || right.height - left.height
        ));
        const groupSheets: Array<{ sheet: CuttingSheet; freeRects: Rect[] }> = [];
        for (const piece of sorted) {
            let placed = false;
            for (const entry of groupSheets) {
                const result = placeSheetPiece(piece, entry.freeRects, profile);
                if (result.placed) {
                    entry.sheet.parts.push(result.placed);
                    entry.sheet.usedArea += result.placed.width * result.placed.height;
                    entry.freeRects = result.freeRects;
                    placed = true;
                    break;
                }
            }
            if (placed) continue;
            const result = placeSheetPiece(piece, [{ x: 0, y: 0, width: profile.width, height: profile.height }], profile);
            if (!result.placed) continue;
            groupSheets.push({
                freeRects: result.freeRects,
                sheet: {
                    id: '',
                    material: piece.section,
                    thickness: piece.thickness,
                    width: profile.width,
                    height: profile.height,
                    parts: [result.placed],
                    usedArea: result.placed.width * result.placed.height,
                    wasteArea: 0,
                    wastePercentage: 0,
                },
            });
        }
        sheets.push(...groupSheets.map(entry => entry.sheet));
    }

    return sheets.map((sheet, index) => {
        const sheetArea = sheet.width * sheet.height;
        const wasteArea = Math.max(0, sheetArea - sheet.usedArea);
        return {
            ...sheet,
            id: `Л-${index + 1}`,
            wasteArea,
            wastePercentage: sheetArea > 0 ? wasteArea / sheetArea * 100 : 0,
        };
    });
};

const createSheetPurchase = (sheets: CuttingSheet[]): SheetPurchaseRow[] => {
    const rows = new Map<string, SheetPurchaseRow>();
    for (const sheet of sheets) {
        const key = `${sheet.material}:${sheet.thickness ?? ''}:${sheet.width}:${sheet.height}`;
        const existing = rows.get(key);
        if (existing) existing.quantity += 1;
        else rows.set(key, {
            material: sheet.material,
            thickness: sheet.thickness,
            sheetWidth: sheet.width,
            sheetHeight: sheet.height,
            quantity: 1,
        });
    }
    return [...rows.values()];
};

export const optimizeCuttingPlan = (items: CuttingItem[], settings: CuttingSettings): CuttingPlan => {
    const boards = optimizeBoards(items, settings);
    const sheets = optimizeSheets(items, settings);
    const totalBoardLength = boards.reduce((total, board) => total + board.stockLength, 0);
    const totalBoardWaste = boards.reduce((total, board) => total + board.wasteLength, 0);
    const totalSheetArea = sheets.reduce((total, sheet) => total + sheet.width * sheet.height, 0);
    const totalSheetWaste = sheets.reduce((total, sheet) => total + sheet.wasteArea, 0);

    return {
        boards,
        patterns: createPatterns(boards),
        boardPurchase: createBoardPurchase(boards),
        sheets,
        sheetPurchase: createSheetPurchase(sheets),
        totalBoardWastePercentage: totalBoardLength > 0 ? totalBoardWaste / totalBoardLength * 100 : 0,
        totalSheetWastePercentage: totalSheetArea > 0 ? totalSheetWaste / totalSheetArea * 100 : 0,
    };
};
