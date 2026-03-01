import { describe, it, expect } from 'vitest';
import { Point } from '../../src/primitives/point';
import { Line } from '../../src/primitives/line';

describe('Line', () => {
    it('should calculate length', () => {
        const l = Line.make(Point.make(0, 0), Point.make(3, 4));
        expect(Line.length(l)).toBe(5);
    });

    it('should calculate midpoint', () => {
        const l = Line.make(Point.make(0, 0), Point.make(10, 20));
        expect(Line.midpoint(l)).toEqual({ y: 5, z: 10 });
    });

    it('should calculate area with thickness', () => {
        const l = Line.make(Point.make(0, 0), Point.make(10, 0));
        expect(Line.area(l, 5)).toBe(50);
    });
});
