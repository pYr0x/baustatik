import { describe, it, expect } from 'vitest';
import { Arc } from '../src/arc';
import { Point } from '../src/point';

describe('Arc Browser Smoke Test', () => {
    it('creates an arc from center', () => {
        const arc = Arc.fromCenter(Point.make(0, 0), 5, 0, Math.PI);
        expect(arc.radius).toBe(5);
        expect(Arc.length(arc)).toBeCloseTo(5 * Math.PI);
    });

    it('gets correct start and end points', () => {
        const arc = Arc.fromCenter(Point.make(0, 0), 1, 0, Math.PI / 2);
        const start = Arc.startPoint(arc);
        const end = Arc.endPoint(arc);
        expect(start.x).toBeCloseTo(1);
        expect(start.y).toBeCloseTo(0);
        expect(end.x).toBeCloseTo(0);
        expect(end.y).toBeCloseTo(1);
    });
});
