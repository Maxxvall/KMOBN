import { EstimateCategory, type EstimateItem } from '../types';
import type { RoofShape } from './houseCalculator';

export type HouseFoundationGeometry =
    | { type: 'slab'; thickness: number }
    | { type: 'strip'; width: number; depth: number; internalLength: number }
    | { type: 'piles'; count: number };

export interface HouseGeometryInput {
    length: number;
    width: number;
    floors: number;
    floorHeight: number;
    partitionLength: number;
    openingsArea: number;
    roofShape: RoofShape;
    roofPitchDegrees: number;
    roofOverhang: number;
    foundation: HouseFoundationGeometry;
}

export interface HouseGeometryResult {
    footprintArea: number;
    totalFloorArea: number;
    externalPerimeter: number;
    grossExternalWallArea: number;
    netExternalWallArea: number;
    partitionArea: number;
    roofProjectionArea: number;
    roofArea: number | null;
    roofGeometrySupported: boolean;
    foundationLength: number | null;
    foundationConcreteVolume: number | null;
    foundationPileCount: number | null;
    warnings: string[];
}

export interface HouseGeometryQuantity {
    quantity: number;
    basis: string;
}

const round = (value: number): number => Math.round(value * 100) / 100;
const finitePositive = (value: number): boolean => Number.isFinite(value) && value > 0;

export function calculateHouseGeometry(input: HouseGeometryInput): HouseGeometryResult {
    if (!finitePositive(input.length) || !finitePositive(input.width) || !Number.isInteger(input.floors) || input.floors < 1 || input.floors > 2) {
        throw new Error('Для геометрического расчёта задайте положительные длину и ширину, этажность — 1 или 2.');
    }
    if (!finitePositive(input.floorHeight) || input.partitionLength < 0 || input.openingsArea < 0 || input.roofOverhang < 0) {
        throw new Error('Высота должна быть больше нуля; перегородки, проёмы и свесы не могут быть отрицательными.');
    }
    if (!Number.isFinite(input.roofPitchDegrees) || input.roofPitchDegrees < 0 || input.roofPitchDegrees >= 75) {
        throw new Error('Уклон кровли должен быть от 0 до 75 градусов.');
    }

    const footprintArea = input.length * input.width;
    const totalFloorArea = footprintArea * input.floors;
    const externalPerimeter = 2 * (input.length + input.width);
    const grossExternalWallArea = externalPerimeter * input.floorHeight * input.floors;
    const warnings: string[] = [];
    const netExternalWallArea = Math.max(0, grossExternalWallArea - input.openingsArea);
    if (input.openingsArea > grossExternalWallArea) warnings.push('Площадь проёмов превышает площадь наружных стен; чистая площадь стен принята равной нулю.');
    const partitionArea = input.partitionLength * input.floorHeight * input.floors;
    const roofProjectionArea = (input.length + input.roofOverhang * 2) * (input.width + input.roofOverhang * 2);
    const roofGeometrySupported = input.roofShape === 'single-slope' || input.roofShape === 'gable' || input.roofShape === 'flat';
    const roofArea = roofGeometrySupported
        ? input.roofShape === 'flat'
            ? roofProjectionArea
            : roofProjectionArea / Math.cos(input.roofPitchDegrees * Math.PI / 180)
        : null;
    if (!roofGeometrySupported) warnings.push('Для выбранной формы крыши точная геометрическая формула пока не настроена; кровля будет оценена по аналогу.');

    let foundationLength: number | null = null;
    let foundationConcreteVolume: number | null = null;
    let foundationPileCount: number | null = null;
    if (input.foundation.type === 'slab') {
        if (!finitePositive(input.foundation.thickness)) throw new Error('Толщина фундаментной плиты должна быть больше нуля.');
        foundationConcreteVolume = footprintArea * input.foundation.thickness;
    } else if (input.foundation.type === 'strip') {
        if (!finitePositive(input.foundation.width) || !finitePositive(input.foundation.depth) || input.foundation.internalLength < 0) {
            throw new Error('Для ленты задайте положительные ширину и глубину; внутренняя длина не может быть отрицательной.');
        }
        foundationLength = externalPerimeter + input.foundation.internalLength;
        foundationConcreteVolume = foundationLength * input.foundation.width * input.foundation.depth;
    } else {
        if (!Number.isInteger(input.foundation.count) || input.foundation.count < 1) throw new Error('Количество свай должно быть положительным целым числом.');
        foundationPileCount = input.foundation.count;
    }

    return {
        footprintArea: round(footprintArea),
        totalFloorArea: round(totalFloorArea),
        externalPerimeter: round(externalPerimeter),
        grossExternalWallArea: round(grossExternalWallArea),
        netExternalWallArea: round(netExternalWallArea),
        partitionArea: round(partitionArea),
        roofProjectionArea: round(roofProjectionArea),
        roofArea: roofArea === null ? null : round(roofArea),
        roofGeometrySupported,
        foundationLength: foundationLength === null ? null : round(foundationLength),
        foundationConcreteVolume: foundationConcreteVolume === null ? null : round(foundationConcreteVolume),
        foundationPileCount,
        warnings,
    };
}

const normalizedUnit = (unit: string): string => unit.toLocaleLowerCase('ru-RU').replace(/\s+/g, '').replace(/ё/g, 'е');
const isSquareUnit = (unit: string): boolean => ['м²', 'м2', 'кв.м', 'кв.м.'].includes(normalizedUnit(unit));
const isCubicUnit = (unit: string): boolean => ['м³', 'м3', 'куб.м', 'куб.м.'].includes(normalizedUnit(unit));
const isLinearUnit = (unit: string): boolean => ['м', 'м.п', 'м.п.', 'п.м', 'п.м.', 'пог.м', 'пог.м.'].includes(normalizedUnit(unit));
const isPieceUnit = (unit: string): boolean => ['шт', 'шт.', 'штука', 'штук'].includes(normalizedUnit(unit));
const normalizeText = (item: EstimateItem): string => `${item.name} ${item.note || ''}`.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');

export function resolveHouseGeometryQuantity(item: EstimateItem, geometry: HouseGeometryResult): HouseGeometryQuantity | null {
    const text = normalizeText(item);
    if (isCubicUnit(item.unit) && (item.category === EstimateCategory.FOUNDATION || text.includes('фундамент')) && geometry.foundationConcreteVolume !== null) {
        return { quantity: geometry.foundationConcreteVolume, basis: 'объём бетона фундамента' };
    }
    if (isSquareUnit(item.unit) && item.category === EstimateCategory.FOUNDATION) {
        return { quantity: geometry.footprintArea, basis: 'площадь пятна фундамента' };
    }
    if (isLinearUnit(item.unit) && (item.category === EstimateCategory.FOUNDATION || text.includes('фундамент')) && geometry.foundationLength !== null) {
        return { quantity: geometry.foundationLength, basis: 'длина фундаментной ленты' };
    }
    if (isPieceUnit(item.unit) && (text.includes('сва') || text.includes('винтов')) && geometry.foundationPileCount !== null) {
        return { quantity: geometry.foundationPileCount, basis: 'количество свай' };
    }
    if (isSquareUnit(item.unit) && (item.category === EstimateCategory.ROOF || text.includes('кровл') || text.includes('кры') || text.includes('стропил')) && geometry.roofArea !== null) {
        return { quantity: geometry.roofArea, basis: 'площадь кровли с учётом уклона и свесов' };
    }
    if (isSquareUnit(item.unit) && (text.includes('перегород') || text.includes('внутренн') && text.includes('стен'))) {
        return { quantity: geometry.partitionArea, basis: 'площадь внутренних перегородок' };
    }
    if (isSquareUnit(item.unit) && (text.includes('стен') || text.includes('фасад') || text.includes('утепл'))) {
        return { quantity: geometry.netExternalWallArea, basis: 'чистая площадь наружных стен' };
    }
    if (isLinearUnit(item.unit) && (text.includes('стен') || text.includes('обвяз') || text.includes('периметр'))) {
        return { quantity: geometry.externalPerimeter, basis: 'наружный периметр дома' };
    }
    if (isSquareUnit(item.unit) && (text.includes('пол') || text.includes('перекрыт') || text.includes('потол'))) {
        return { quantity: geometry.totalFloorArea, basis: 'суммарная площадь этажей' };
    }
    return null;
}
