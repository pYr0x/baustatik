import { describe, it, expect } from 'vitest';
import { Line } from '../src/line';
import { Point } from '../src/point';

describe('Line Browser Smoke Test', () => {
    it('calculates line length correctly', () => {
        const l = Line.make(Point.make(0, 0), Point.make(3, 4));
        expect(Line.length(l)).toBe(5);
    });

    it('finds intersection of two lines', () => {
        const l1 = Line.make(Point.make(0, 0), Point.make(10, 10));
        const l2 = Line.make(Point.make(0, 10), Point.make(10, 0));
        const intersection = Line.intersect(l1, l2);
        expect(intersection).not.toBeNull();
        expect(intersection!.x).toBeCloseTo(5);
        expect(intersection!.y).toBeCloseTo(5);
    });
});
