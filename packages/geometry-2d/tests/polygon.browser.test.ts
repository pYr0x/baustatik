import { describe, it, expect } from 'vitest';
import { Polygon } from '../src/polygon';
import { Point } from '../src/point';

describe('Polygon Browser Smoke Test', () => {
    it('calculates polygon area correctly', () => {
        const poly = Polygon.make([
            Point.make(0, 0),
            Point.make(10, 0),
            Point.make(10, 10),
            Point.make(0, 10),
        ]);
        expect(Polygon.area(poly)).toBe(100);
    });

    it('verifies clipping (martinez) works in browser', () => {
        const a = Polygon.make([
            Point.make(0, 0),
            Point.make(10, 0),
            Point.make(10, 10),
            Point.make(0, 10),
        ]);
        const b = Polygon.make([
            Point.make(5, 5),
            Point.make(15, 5),
            Point.make(15, 15),
            Point.make(5, 15),
        ]);
        const intersected = Polygon.intersect(a, b);
        expect(intersected.length).toBe(1);
        expect(Polygon.area(intersected[0]!)).toBeCloseTo(25);
    });
});
