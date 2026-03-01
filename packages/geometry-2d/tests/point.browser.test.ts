import { describe, it, expect } from 'vitest';
import { Point } from '../src/point';

describe('Point Browser Smoke Test', () => {
    it('correctly creates and rotates a point', () => {
        const p = Point.make(1, 0);
        const rotated = Point.rotate(p, Math.PI / 2);

        expect(rotated.x).toBeCloseTo(0);
        expect(rotated.y).toBeCloseTo(1);
    });

    it('correctly calculates distance', () => {
        const a = Point.make(0, 0);
        const b = Point.make(3, 4);
        expect(Point.distance(a, b)).toBe(5);
    });
});
