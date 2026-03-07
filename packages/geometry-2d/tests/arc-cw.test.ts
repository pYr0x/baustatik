import { describe, it, expect } from 'vitest';
import { Arc } from '../src/arc';
import { Point } from '../src/point';
import { Line } from '../src/line';

describe('Arc CW (Clockwise) Functionality', () => {
    describe('Arc.make – direction via signed sweep', () => {
        it('creates a CCW arc for a positive sweep angle', () => {
            const arc = Arc.make(Point.make(0, 0), 5, 0, Math.PI / 2);
            expect(arc.sweep).toBeCloseTo(Math.PI / 2);
            expect(arc.sweep).toBeGreaterThan(0);
            expect(arc.startAngle).toBeCloseTo(0);
        });

        it('creates a CW arc for a negative sweep angle', () => {
            const arc = Arc.make(Point.make(0, 0), 5, 0, -Math.PI / 2);
            expect(arc.sweep).toBeCloseTo(-Math.PI / 2);
            expect(arc.sweep).toBeLessThan(0);
            expect(arc.startAngle).toBeCloseTo(0);
        });

        it('endPoint is startAngle + sweep', () => {
            const arc = Arc.make(Point.make(0, 0), 5, 0, -Math.PI / 2);
            const end = Arc.endPoint(arc);
            // startAngle=0, sweep=-PI/2 → endAngle = -PI/2 → Point(0, -5)
            expect(end.x).toBeCloseTo(0);
            expect(end.y).toBeCloseTo(-5);
        });
    });

    describe('Arc.swap', () => {
        it('swaps start and end angles and negates sweep', () => {
            const ccwArc = Arc.make(Point.make(0, 0), 5, 0, Math.PI / 2);
            const cwArc = Arc.swap(ccwArc);

            expect(cwArc.sweep).toBeCloseTo(-Math.PI / 2);
            expect(cwArc.startAngle).toBeCloseTo(Math.PI / 2);
            // endPoint des geswatten Arcs = ehemaliger startPoint
            const end = Arc.endPoint(cwArc);
            expect(end.x).toBeCloseTo(5);
            expect(end.y).toBeCloseTo(0);
        });

        it('swap is its own inverse', () => {
            const arc = Arc.make(Point.make(0, 0), 5, 0, Math.PI / 2);
            const restored = Arc.swap(Arc.swap(arc));
            expect(restored.startAngle).toBeCloseTo(arc.startAngle);
            expect(restored.sweep).toBeCloseTo(arc.sweep);
        });
    });

    describe('CW Arc properties', () => {
        it('calculates the correct length for a CW arc', () => {
            // 90° CW sweep from PI → PI/2
            const arc = Arc.make(Point.make(0, 0), 10, Math.PI, -Math.PI / 2);
            expect(Arc.length(arc)).toBeCloseTo(10 * (Math.PI / 2));
        });

        it('calculates the correct midpoint for a CW arc', () => {
            // Arc from PI to PI/2 (CW) → midpoint at 3PI/4
            const arc = Arc.make(Point.make(0, 0), 10, Math.PI, -Math.PI / 2);
            const mid = Arc.midpoint(arc);
            expect(mid.x).toBeCloseTo(10 * Math.cos(Math.PI * 0.75));
            expect(mid.y).toBeCloseTo(10 * Math.sin(Math.PI * 0.75));
        });

        it('generates a polyline with reversed point order for CW', () => {
            // startAngle=PI, sweep=-PI/2 → geht CW von (-1,0) nach (0,1)
            const arc = Arc.make(Point.make(0, 0), 1, Math.PI, -Math.PI / 2);
            const poly = Arc.toPolyline(arc, { segments: 2 });

            expect(poly.points.length).toBe(3);
            // Start: angle=PI → (-1, 0)
            expect(poly.points[0]!.x).toBeCloseTo(-1);
            expect(poly.points[0]!.y).toBeCloseTo(0);
            // Mid: angle=PI + (-PI/4) = 3PI/4 → (-√2/2, √2/2)
            expect(poly.points[1]!.x).toBeCloseTo(Math.cos(Math.PI * 0.75));
            expect(poly.points[1]!.y).toBeCloseTo(Math.sin(Math.PI * 0.75));
            // End: angle=PI + (-PI/2) = PI/2 → (0, 1)
            expect(poly.points[2]!.x).toBeCloseTo(0);
            expect(poly.points[2]!.y).toBeCloseTo(1);
        });
    });

    describe('intersections with CW arcs', () => {
        it('intersectLine matches only the CW segment', () => {
            // Obere Halbkreis CW: startAngle=PI, sweep=-PI (→ von PI nach 0 über oben)
            const arc = Arc.make(Point.make(0, 0), 1, Math.PI, -Math.PI);

            // Vertikale Linie bei x=0
            const line = Line.make(Point.make(0, -2), Point.make(0, 2));

            const intersections = Arc.intersectLine(arc, line);
            expect(intersections.length).toBe(1);
            // Schnittpunkt sollte oben sein (0, 1) – nicht (0, -1) da CW obere Halbkreis
            expect(intersections[0]!.y).toBeCloseTo(1);
        });
    });
});
