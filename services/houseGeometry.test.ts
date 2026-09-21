import { describe, expect, it } from 'vitest';
import { EstimateCategory, EstimateSubgroup } from '../types';
import { calculateHouseGeometry, resolveHouseGeometryQuantity } from './houseGeometry';

const geometry = (length: number, width: number) => calculateHouseGeometry({
    length,
    width,
    floors: 1,
    floorHeight: 2.8,
    partitionLength: 20,
    openingsArea: 10,
    roofShape: 'gable',
    roofPitchDegrees: 30,
    roofOverhang: 0.5,
    foundation: { type: 'slab', thickness: 0.25 },
});

describe('house geometry', () => {
    it('distinguishes houses with equal floor area but different perimeter and wall area', () => {
        const compact = geometry(10, 10);
        const elongated = geometry(5, 20);

        expect(compact.totalFloorArea).toBe(100);
        expect(elongated.totalFloorArea).toBe(100);
        expect(compact.externalPerimeter).toBe(40);
        expect(elongated.externalPerimeter).toBe(50);
        expect(elongated.netExternalWallArea).toBeGreaterThan(compact.netExternalWallArea);
    });

    it('does not multiply the foundation footprint when a second floor is added', () => {
        const result = calculateHouseGeometry({
            length: 10,
            width: 8,
            floors: 2,
            floorHeight: 3,
            partitionLength: 0,
            openingsArea: 12,
            roofShape: 'single-slope',
            roofPitchDegrees: 10,
            roofOverhang: 0,
            foundation: { type: 'slab', thickness: 0.2 },
        });

        expect(result.footprintArea).toBe(80);
        expect(result.totalFloorArea).toBe(160);
        expect(result.foundationConcreteVolume).toBe(16);
    });

    it('increases roof area with pitch and overhangs', () => {
        const result = geometry(10, 10);

        expect(result.roofProjectionArea).toBe(121);
        expect(result.roofArea).toBeCloseTo(139.72, 2);
    });

    it('never returns a negative wall area when openings are invalidly large', () => {
        const result = calculateHouseGeometry({
            length: 6,
            width: 6,
            floors: 1,
            floorHeight: 2.5,
            partitionLength: 0,
            openingsArea: 1_000,
            roofShape: 'flat',
            roofPitchDegrees: 0,
            roofOverhang: 0,
            foundation: { type: 'piles', count: 20 },
        });

        expect(result.netExternalWallArea).toBe(0);
        expect(result.warnings).toHaveLength(1);
    });

    it('does not inflate a flat roof when a stale pitch value is present', () => {
        const result = calculateHouseGeometry({
            length: 10,
            width: 8,
            floors: 1,
            floorHeight: 3,
            partitionLength: 0,
            openingsArea: 0,
            roofShape: 'flat',
            roofPitchDegrees: 30,
            roofOverhang: 0,
            foundation: { type: 'slab', thickness: 0.2 },
        });

        expect(result.roofArea).toBe(80);
    });

    it('maps an unambiguous roof square-meter row to the calculated roof area', () => {
        const result = geometry(10, 10);
        const quantity = resolveHouseGeometryQuantity({
            id: 'roof',
            name: 'Монтаж кровли',
            unit: 'м²',
            quantity: 100,
            price: 500,
            total: 50_000,
            category: EstimateCategory.ROOF,
            subgroup: EstimateSubgroup.WORKS,
        }, result);

        expect(quantity).toEqual({ quantity: 139.72, basis: 'площадь кровли с учётом уклона и свесов' });
    });
});
