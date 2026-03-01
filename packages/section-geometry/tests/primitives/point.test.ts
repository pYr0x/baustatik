import { describe, it, expect } from 'vitest';
import { Point } from '../../src/primitives/point';

describe('Point', () => {
    it('should make a point', () => {
        const p = Point.make(1, 2);
        expect(p).toEqual({ y: 1, z: 2 });
    });

    it('should calculate distance', () => {
        const p1 = Point.make(0, 0);
        const p2 = Point.make(3, 4);
        expect(Point.distance(p1, p2)).toBe(5);
    });

    it('should check equality', () => {
        const p1 = Point.make(1, 1);
        const p2 = Point.make(1.00000000001, 1);
        expect(Point.equals(p1, p2)).toBe(true);
        expect(Point.equals(p1, p2, 1e-12)).toBe(false);
    });
});
