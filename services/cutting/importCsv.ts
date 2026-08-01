import { classifyCuttingStage } from './stageOrder';
import {
    CuttingImportIssue,
    CuttingImportResult,
    CuttingItem,
    CuttingSettings,
    CuttingSkippedRow,
    DEFAULT_CUTTING_SETTINGS,
    getSheetStockProfile,
} from './types';

const HEADER_ALIASES = {
    construction: ['использование в конструкции', 'применение в конструкции', 'наименование', 'adsk использование в конструкции'],
    section: ['размеры сечения', 'сечение', 'размер сечения'],
    length: ['фактическая длина мм', 'длина мм', 'фактическая длина', 'длина'],
    width: ['фактическая ширина мм', 'ширина мм', 'ширина'],
    count: ['число', 'количество', 'кол-во'],
    volume: ['объем позиции м3', 'объём позиции м3', 'объем м3', 'объём м3'],
} as const;

type HeaderKey = keyof typeof HEADER_ALIASES;

const normalizeHeader = (value: string): string => value
    .replace(/^\uFEFF/, '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[.,;:_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const parseNumber = (value: string | undefined): number | undefined => {
    if (!value) return undefined;
    const normalized = value.replace(/\s/g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
};

const countDelimiter = (line: string, delimiter: string): number => {
    let count = 0;
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if (char === '"') quoted = !quoted;
        else if (!quoted && char === delimiter) count += 1;
    }
    return count;
};

const detectDelimiter = (text: string): string => {
    const sample = text.split(/\r?\n/).filter(Boolean).slice(0, 10).join('\n');
    return [';', '\t', ','].sort((left, right) => countDelimiter(sample, right) - countDelimiter(sample, left))[0];
};

export const parseDelimitedText = (text: string): string[][] => {
    const delimiter = detectDelimiter(text);
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        const next = text[index + 1];
        if (char === '"' && quoted && next === '"') {
            cell += '"';
            index += 1;
        } else if (char === '"') {
            quoted = !quoted;
        } else if (char === delimiter && !quoted) {
            row.push(cell.trim());
            cell = '';
        } else if ((char === '\n' || char === '\r') && !quoted) {
            if (char === '\r' && next === '\n') index += 1;
            row.push(cell.trim());
            if (row.some(value => value !== '')) rows.push(row);
            row = [];
            cell = '';
        } else {
            cell += char;
        }
    }

    row.push(cell.trim());
    if (row.some(value => value !== '')) rows.push(row);
    return rows;
};

const findHeaderIndexes = (headers: string[]): Partial<Record<HeaderKey, number>> => {
    const normalized = headers.map(normalizeHeader);
    return Object.fromEntries(Object.entries(HEADER_ALIASES).map(([key, aliases]) => [
        key,
        normalized.findIndex(value => aliases.includes(value as never)),
    ]).filter(([, index]) => Number(index) >= 0)) as Partial<Record<HeaderKey, number>>;
};

const isSheetMaterial = (construction: string): boolean => /(?:фанер|osb|осб|осп|plywood)/i.test(construction);

const parseSheetSection = (section: string): { width?: number; thickness?: number } => {
    const match = section.match(/(\d+(?:[.,]\d+)?)\s*[xх×]\s*(\d+(?:[.,]\d+)?)/i);
    if (!match) return {};
    const first = parseNumber(match[1]);
    const second = parseNumber(match[2]);
    if (!first || !second) return {};
    if (first <= 100 && second > 100) return { width: second, thickness: first };
    if (second <= 100 && first > 100) return { width: first, thickness: second };
    return {};
};

const parseThicknessFromName = (construction: string): number | undefined => {
    const match = construction.match(/(\d+(?:[.,]\d+)?)\s*мм/i);
    return match ? parseNumber(match[1]) : undefined;
};

const getSheetMaterialLabel = (construction: string, thickness?: number): string => {
    const suffix = thickness ? ` ${thickness} мм` : '';
    if (/(?:osb|осб|осп)/i.test(construction)) return `OSB${suffix}`;
    if (/(?:фанер|plywood)/i.test(construction)) return `Фанера${suffix}`;
    return construction.trim();
};

const getDefaultSheetPartWidth = (construction: string): number => (
    /(?:osb|осб|осп)/i.test(construction) ? 1250 : 1525
);

export const validateCuttingItems = (
    items: CuttingItem[],
    settings: CuttingSettings = DEFAULT_CUTTING_SETTINGS,
): CuttingImportIssue[] => {
    const issues: CuttingImportIssue[] = [];
    for (const item of items) {
        if (!item.isSheet && !item.section) {
            issues.push({
                id: `${item.id}-missing-section`,
                sourceRow: item.sourceRow,
                itemId: item.id,
                severity: 'error',
                code: 'missing-section',
                message: `${item.construction}: не указано сечение доски.`,
            });
        }
        if (item.isSheet && (!item.width || item.width <= 0)) {
            issues.push({
                id: `${item.id}-missing-sheet-width`,
                sourceRow: item.sourceRow,
                itemId: item.id,
                severity: 'error',
                code: 'missing-sheet-width',
                message: `${item.construction}: вручную укажите ширину детали.`,
            });
        }
        if (item.isSheet && item.width && (
            (() => {
                const profile = getSheetStockProfile(settings, item.section);
                return (item.width > profile.width || item.length > profile.height)
                    && (!profile.allowRotation || item.length > profile.width || item.width > profile.height);
            })()
        )) {
            const profile = getSheetStockProfile(settings, item.section);
            issues.push({
                id: `${item.id}-oversized-sheet`,
                sourceRow: item.sourceRow,
                itemId: item.id,
                severity: 'error',
                code: 'oversized-sheet-part',
                message: `${item.construction}: деталь ${item.length}×${item.width} мм не помещается на лист ${profile.width}×${profile.height} мм.`,
            });
        }
        if (!item.isSheet && item.length > settings.maxBoardPartLength) {
            issues.push({
                id: `${item.id}-oversized`,
                sourceRow: item.sourceRow,
                itemId: item.id,
                severity: 'error',
                code: 'oversized-board-part',
                message: `${item.construction}: длина ${item.length} мм больше допустимых ${settings.maxBoardPartLength} мм.`,
            });
        }
    }
    return issues;
};

export const parseCuttingText = (
    text: string,
    fileName = 'Раскрой.csv',
    settings: CuttingSettings = DEFAULT_CUTTING_SETTINGS,
): CuttingImportResult => {
    const rows = parseDelimitedText(text.replace(/^\uFEFF/, ''));
    if (rows.length === 0) return { fileName, items: [], issues: [], skippedRows: 0, skippedDetails: [] };

    const headerRowIndex = rows.findIndex(row => {
        const values = row.map(normalizeHeader);
        return values.some(value => HEADER_ALIASES.construction.includes(value as never))
            && values.some(value => HEADER_ALIASES.length.includes(value as never));
    });
    if (headerRowIndex < 0) {
        return {
            fileName,
            items: [],
            skippedRows: rows.length,
            skippedDetails: rows.map((row, index) => ({
                id: `cut-row-${index + 1}-missing-headers`,
                sourceRow: index + 1,
                reason: 'Строка не распознана: в файле не найдены обязательные колонки «Наименование» и «Длина».',
                fields: [{ label: 'Данные строки', value: row.join(' | ') }],
            })),
            issues: [{
                id: 'missing-headers',
                sourceRow: 1,
                severity: 'error',
                code: 'invalid-value',
                message: 'Не найдены колонки «Использование в конструкции» и «Длина».',
            }],
        };
    }

    const indexes = findHeaderIndexes(rows[headerRowIndex]);
    const items: CuttingItem[] = [];
    const parseIssues: CuttingImportIssue[] = [];
    const skippedDetails: CuttingSkippedRow[] = [];
    let skippedRows = 0;
    const read = (row: string[], key: HeaderKey): string => {
        const index = indexes[key];
        return index === undefined ? '' : (row[index] ?? '').trim();
    };

    rows.slice(headerRowIndex + 1).forEach((row, offset) => {
        const sourceRow = headerRowIndex + offset + 2;
        const construction = read(row, 'construction');
        const section = read(row, 'section');
        const lengthRaw = read(row, 'length');
        const countRaw = read(row, 'count');
        const skippedFields = [
            { label: 'Наименование', value: construction },
            { label: 'Сечение', value: section },
            { label: 'Длина', value: lengthRaw },
            { label: 'Ширина', value: read(row, 'width') },
            { label: 'Количество', value: countRaw },
            { label: 'Объём', value: read(row, 'volume') },
        ].filter(field => field.value);
        const addSkippedRow = (reason: string) => {
            skippedRows += 1;
            skippedDetails.push({
                id: `cut-row-${sourceRow}-skipped`,
                sourceRow,
                reason,
                fields: skippedFields.length > 0
                    ? skippedFields
                    : [{ label: 'Данные строки', value: row.join(' | ') || 'Пустая строка' }],
            });
        };
        if (!construction) {
            const reason = section || lengthRaw || countRaw
                ? 'Не указано наименование детали.'
                : 'Не заполнены обязательные данные детали.';
            addSkippedRow(reason);
            if (section || lengthRaw || countRaw) {
                parseIssues.push({
                    id: `cut-row-${sourceRow}-missing-name`,
                    sourceRow,
                    severity: 'error',
                    code: 'invalid-value',
                    message: 'Не указано наименование детали.',
                });
            }
            return;
        }

        if (!section && !lengthRaw && !countRaw) {
            addSkippedRow('Не указаны сечение, длина и количество.');
            return;
        }
        const length = parseNumber(lengthRaw);
        const quantity = parseNumber(countRaw);
        if (!length || length <= 0 || !quantity || quantity <= 0 || !Number.isInteger(quantity)) {
            const reasons = [
                (!length || length <= 0) ? 'длина должна быть положительным числом' : '',
                (!quantity || quantity <= 0 || !Number.isInteger(quantity)) ? 'количество должно быть положительным целым числом' : '',
            ].filter(Boolean).join('; ');
            addSkippedRow(`${construction}: ${reasons}.`);
            parseIssues.push({
                id: `cut-row-${sourceRow}-invalid`,
                sourceRow,
                severity: 'error',
                code: 'invalid-value',
                message: `${construction}: ${reasons}.`,
            });
            return;
        }

        const isSheet = isSheetMaterial(construction);
        const sheetSection = isSheet ? parseSheetSection(section) : {};
        const thickness = sheetSection.thickness ?? parseThicknessFromName(construction);
        items.push({
            id: `cut-row-${sourceRow}`,
            sourceRow,
            construction,
            section: isSheet ? getSheetMaterialLabel(construction, thickness) : section,
            length,
            width: parseNumber(read(row, 'width')) ?? sheetSection.width ?? (isSheet ? getDefaultSheetPartWidth(construction) : undefined),
            thickness,
            quantity,
            volumeM3: parseNumber(read(row, 'volume')),
            isSheet,
            stage: classifyCuttingStage(construction),
        });
    });

    return { fileName, items, issues: [...parseIssues, ...validateCuttingItems(items, settings)], skippedRows, skippedDetails };
};

export const decodeCuttingFile = (buffer: ArrayBuffer): string => {
    const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    const replacementCount = (utf8.match(/\uFFFD/g) ?? []).length;
    if (replacementCount === 0) return utf8;
    try {
        return new TextDecoder('windows-1251').decode(buffer);
    } catch {
        return utf8;
    }
};
