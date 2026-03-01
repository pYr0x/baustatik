import { describe, it, expect } from 'vitest';
import { Point } from '../../src/primitives/point';
import { Arc } from '../../src/primitives/arc';
import { CollinearPointsError } from '../../src/errors';

describe('Arc', () => {
    it('should make an arc from center', () => {
        const a = Arc.fromCenter(Point.make(0, 0), 10, 0, Math.PI);
        expect(a.radius).toBe(10);
        expect(a.startAngle).toBe(0);
        expect(a.endAngle).toBe(Math.PI);
    });

    it('should calculate length', () => {
        const a = Arc.fromCenter(Point.make(0, 0), 10, 0, Math.PI / 2);
        expect(Arc.length(a)).toBeCloseTo(10 * Math.PI / 2);
    });

    it('should make an arc from 3 points (half-circle)', () => {
        const p1 = Point.make(10, 0);
        const p2 = Point.make(0, 10);
        const p3 = Point.make(-10, 0);
        const a = Arc.fromPoints(p1, p2, p3);

        expect(Point.equals(a.center, Point.make(0, 0))).toBe(true);
        expect(a.radius).toBeCloseTo(10);
        // Path (10,0) -> (0,10) -> (-10,0) is CW if Z is down.
        // atan2(0, 10) = 0
        // atan2(10, 0) = PI/2
        // atan2(0, -10) = PI
        expect(a.startAngle).toBeCloseTo(0);
        expect(a.endAngle).toBeCloseTo(Math.PI);
    });

    it('should make an arc from 3 points (CCW)', () => {
        const p1 = Point.make(10, 0);
        const p2 = Point.make(0, -10);
        const p3 = Point.make(-10, 0);
        const a = Arc.fromPoints(p1, p2, p3);

        expect(Point.equals(a.center, Point.make(0, 0))).toBe(true);
        // Path (10,0) -> (0,-10) -> (-10,0) is CCW if Z is down.
        // atan2(0, 10) = 0
        // atan2(-10, 0) = -PI/2
        // atan2(0, -10) = PI/-PI
        expect(a.startAngle).toBeCloseTo(0);
        expect(a.endAngle).toBeCloseTo(-Math.PI);
    });

    it('should throw on collinear points', () => {
        const p1 = Point.make(0, 0);
        const p2 = Point.make(10, 0);
        const p3 = Point.make(20, 0);
        expect(() => Arc.fromPoints(p1, p2, p3)).toThrow(CollinearPointsError);
    });

    it('should convert to polyline', () => {
        const a = Arc.fromCenter(Point.make(0, 0), 10, 0, Math.PI / 2); // 90 deg
        const poly = Arc.toPolyline(a);
        expect(poly.length).toBe(91); // 90 segments + 1 point
    });
});
