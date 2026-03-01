import { describe, it, expect } from 'vitest';
import { Vector } from '../src/vector';
import { Point } from '../src/point';

describe('Vector Browser Smoke Test', () => {
    it('correctly creates a vector from points', () => {
        const a = Point.make(1, 1);
        const b = Point.make(4, 5);
        const v = Vector.fromPoints(a, b);
        expect(v.dx).toBe(3);
        expect(v.dy).toBe(4);
        expect(Vector.length(v)).toBe(5);
    });

    it('correctly rotates a vector', () => {
        const v = Vector.make(1, 0);
        const rotated = Vector.rotate(v, Math.PI / 2);
        expect(rotated.dx).toBeCloseTo(0);
        expect(rotated.dy).toBeCloseTo(1);
    });
});
