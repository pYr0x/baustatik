import { afterEach, describe, expect, it, vi } from 'vitest';

import { Arc, Point, Polygon, Polyline } from '@baustatik/section-geometry';

import {
    sectionArcEndPointToWorld,
    sectionArcMidPointToWorld,
    sectionArcStartPointToWorld,
    sectionPointToWorld,
    sectionPolygonToWorldPoints,
    sectionPolylineToWorldPoints,
} from '../../src/mapping';

describe('section -> world point mapping', () => {
    it('{ y: 10, z: 20 } maps to { u: 10, v: 20 }', () => {
        const p = Point.make(10, 20);

        expect(sectionPointToWorld(p)).toEqual({ u: 10, v: 20 });
    });

    it('keeps negative values', () => {
        const p = Point.make(-3.5, -7.25);

        expect(sectionPointToWorld(p)).toEqual({ u: -3.5, v: -7.25 });
    });

    it('does not mutate input point', () => {
        const p = Object.freeze({ y: 2, z: -4 });

        const before = structuredClone(p);
        expect(() => sectionPointToWorld(p)).not.toThrow();
        expect(p).toEqual(before);
    });
});

describe('polyline/polygon mapping', () => {
    it('preserves point order for polylines', () => {
        const pl = Polyline.make([Point.make(1, 2), Point.make(3, 4), Point.make(-5, 6)]);

        expect(sectionPolylineToWorldPoints(pl)).toEqual([
            { u: 1, v: 2 },
            { u: 3, v: 4 },
            { u: -5, v: 6 },
        ]);
    });

    it('preserves point order for polygons', () => {
        const pg = Polygon.make([Point.make(0, 0), Point.make(2, 0), Point.make(1, 3)]);

        expect(sectionPolygonToWorldPoints(pg)).toEqual(
            pg.points.map((p) => ({ u: p.y, v: p.z })),
        );
    });

    it('returns new arrays and does not mutate inputs', () => {
        const pl = Polyline.make([Point.make(1, 2), Point.make(3, 4)]);
        const pg = Polygon.make([Point.make(-1, -2), Point.make(-3, -4), Point.make(-5, -6)]);

        const plBefore = structuredClone(pl);
        const pgBefore = structuredClone(pg);

        const plOut = sectionPolylineToWorldPoints(pl);
        const pgOut = sectionPolygonToWorldPoints(pg);

        expect(plOut).not.toBe(pl.points);
        expect(pgOut).not.toBe(pg.points);
        expect(pl).toEqual(plBefore);
        expect(pg).toEqual(pgBefore);
    });
});

describe('arc mapping', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('reads start/mid/end points via section-geometry arc API', () => {
        const arc = Arc.fromCenter(Point.make(0, 0), 5, 0, Math.PI / 2);

        const start = Point.make(10, 20);
        const mid = Point.make(30, 40);
        const end = Point.make(50, 60);

        const startSpy = vi.spyOn(Arc, 'startPoint').mockReturnValue(start);
        const midSpy = vi.spyOn(Arc, 'midpoint').mockReturnValue(mid);
        const endSpy = vi.spyOn(Arc, 'endPoint').mockReturnValue(end);

        expect(sectionArcStartPointToWorld(arc)).toEqual({ u: 10, v: 20 });
        expect(sectionArcMidPointToWorld(arc)).toEqual({ u: 30, v: 40 });
        expect(sectionArcEndPointToWorld(arc)).toEqual({ u: 50, v: 60 });

        expect(startSpy).toHaveBeenCalledWith(arc);
        expect(midSpy).toHaveBeenCalledWith(arc);
        expect(endSpy).toHaveBeenCalledWith(arc);
    });

    it('does not swallow errors from section-geometry', () => {
        const arc = Arc.fromCenter(Point.make(0, 0), 2, 0, Math.PI / 3);
        const cause = new Error('section-geometry failed');

        vi.spyOn(Arc, 'startPoint').mockImplementation(() => {
            throw cause;
        });

        expect(() => sectionArcStartPointToWorld(arc)).toThrow(cause);
    });
});
