import { describe, it, expect } from 'vitest';
import { Point } from '../../src/primitives/point';
import { Line } from '../../src/primitives/line';
import { Contour } from '../../src/primitives/contour';
import { contourToKonvaPath } from '../../src/adapters/konva';

describe('Konva Adapter', () => {
    it('should transform rectangle to path', () => {
        const p1 = Point.make(0, 0);
        const p2 = Point.make(10, 0);
        const p3 = Point.make(10, 10);
        const p4 = Point.make(0, 10);

        const c = Contour.make([
            Line.make(p1, p2),
            Line.make(p2, p3),
            Line.make(p3, p4),
            Line.make(p4, p1),
        ]);

        const path = contourToKonvaPath(c);
        // M 0,0 L 10,0 L 10,-10 L 0,-10 L 0,0
        expect(path).toBe('M 0,0 L 10,0 L 10,-10 L 0,-10 L 0,0');
    });
});
