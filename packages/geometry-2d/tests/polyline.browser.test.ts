import { describe, it, expect } from 'vitest';
import { Polyline } from '../src/polyline';
import { Point } from '../src/point';

describe('Polyline Browser Smoke Test', () => {
    it('calculates polyline length correctly', () => {
        const pl = Polyline.make([
            Point.make(0, 0),
            Point.make(3, 4),
            Point.make(3, 10),
        ]);
        expect(Polyline.length(pl)).toBe(5 + 6);
    });

    it('checks if polyline is closed', () => {
        const closed = Polyline.make([
            Point.make(0, 0),
            Point.make(1, 0),
            Point.make(0, 1),
            Point.make(0, 0),
        ]);
        const open = Polyline.make([
            Point.make(0, 0),
            Point.make(1, 0),
            Point.make(0, 1),
        ]);
        expect(Polyline.isClosed(closed)).toBe(true);
        expect(Polyline.isClosed(open)).toBe(false);
    });
});
