import { describe, it, expect } from 'vitest';
import { Point } from '../../src/primitives/point';
import { Line } from '../../src/primitives/line';
import { Arc } from '../../src/primitives/arc';
import { Segment } from '../../src/primitives/segment';

describe('Segment', () => {
    const p1 = Point.make(0, 0);
    const p2 = Point.make(10, 0);
    const line = Line.make(p1, p2);
    const arc = Arc.fromCenter(p1, 10, 0, Math.PI);

    it('should identify line', () => {
        expect(Segment.isLine(line)).toBe(true);
        expect(Segment.isLine(arc)).toBe(false);
    });

    it('should identify arc', () => {
        expect(Segment.isArc(arc)).toBe(true);
        expect(Segment.isArc(line)).toBe(false);
    });

    it('should calculate length for both', () => {
        expect(Segment.length(line)).toBe(10);
        expect(Segment.length(arc)).toBeCloseTo(10 * Math.PI);
    });

    it('should get start and end points of line', () => {
        expect(Segment.startPoint(line)).toEqual(p1);
        expect(Segment.endPoint(line)).toEqual(p2);
    });

    it('should get start and end points of arc', () => {
        expect(Point.equals(Segment.startPoint(arc), Point.make(10, 0))).toBe(true);
        expect(Point.equals(Segment.endPoint(arc), Point.make(-10, 0))).toBe(true);
    });
});
