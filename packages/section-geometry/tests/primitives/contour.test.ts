import { describe, it, expect } from 'vitest';
import { Point } from '../../src/primitives/point';
import { Line } from '../../src/primitives/line';
import { Contour } from '../../src/primitives/contour';

describe('Contour', () => {
    it('should check if closed (Rectangle)', () => {
        const p1 = Point.make(0, 0);
        const p2 = Point.make(10, 0);
        const p3 = Point.make(10, 10);
        const p4 = Point.make(0, 10);

        const segments = [
            Line.make(p1, p2),
            Line.make(p2, p3),
            Line.make(p3, p4),
            Line.make(p4, p1),
        ];

        const c = Contour.make(segments);
        expect(Contour.isClosed(c)).toBe(true);
        expect(Contour.length(c)).toBe(40);
    });

    it('should check if open (U-profile)', () => {
        const p1 = Point.make(0, 0);
        const p2 = Point.make(10, 0);
        const p3 = Point.make(10, 10);
        const p4 = Point.make(0, 10);

        const segments = [
            Line.make(p1, p2),
            Line.make(p2, p3),
            Line.make(p3, p4),
        ];

        const c = Contour.make(segments);
        expect(Contour.isClosed(c)).toBe(false);
    });

    it('should calculate bounding box of rectangle', () => {
        const p1 = Point.make(10, 20);
        const p2 = Point.make(50, 60);
        const c = Contour.make([Line.make(p1, p2)]);
        const bb = Contour.boundingBox(c);
        expect(bb.min).toEqual({ y: 10, z: 20 });
        expect(bb.max).toEqual({ y: 50, z: 60 });
    });
});
