import { describe, expect, it } from 'vitest';
import {
  DiscontinuousLinesError,
  InvalidPolygonError,
  InvalidPolylineError,
  Line,
  OpenPolylineError,
  Point,
  Polygon,
  Polyline,
  Vector,
} from '../src';

const points = [Point.make(0, 0), Point.make(3, 0), Point.make(3, 4)];

describe('Polyline basics', () => {
  it('creates, measures and detects closed state', () => {
    expect(Polyline.make(points).points.length).toBe(3);
    expect(Polyline.length(Polyline.make(points))).toBeCloseTo(7);
    expect(Polyline.isClosed(Polyline.make(points))).toBe(false);
    expect(Polyline.isClosed(Polyline.make([...points, Point.make(0, 0)]))).toBe(
      true,
    );
  });

  it('builds from connected lines and throws for discontinuity', () => {
    const connected = [
      Line.make(Point.make(0, 0), Point.make(1, 0)),
      Line.make(Point.make(1, 0), Point.make(2, 0)),
    ];
    expect(Polyline.fromLines(connected).points.length).toBe(3);

    const disconnected = [
      Line.make(Point.make(0, 0), Point.make(1, 0)),
      Line.make(Point.make(5, 0), Point.make(6, 0)),
    ];
    expect(() => Polyline.fromLines(disconnected)).toThrow(
      DiscontinuousLinesError,
    );
  });
});

describe('Polyline polygon conversion and sampling', () => {
  it('throws on open polyline and converts closed polyline', () => {
    expect(() => Polyline.toPolygon(Polyline.make(points))).toThrow(
      OpenPolylineError,
    );

    const closed = Polyline.make([
      Point.make(0, 0),
      Point.make(1, 0),
      Point.make(1, 1),
      Point.make(0, 0),
    ]);
    const polygon = Polyline.toPolygon(closed);
    expect(polygon.points.length).toBe(3);
    expect(Polygon.isClockwise(polygon)).toBe(true);
  });

  it('throws InvalidPolygonError for < 3 unique points', () => {
    const degenerate = Polyline.make([
      Point.make(0, 0),
      Point.make(1, 0),
      Point.make(0, 0),
    ]);
    expect(() => Polyline.toPolygon(degenerate)).toThrow(InvalidPolygonError);
  });

  it('supports pointAt, closestPoint and split', () => {
    const polyline = Polyline.make(points);
    const start = Polyline.pointAt(polyline, 0);
    const end = Polyline.pointAt(polyline, 1);
    expect(start.y).toBeCloseTo(points[0]?.y ?? 0);
    expect(start.z).toBeCloseTo(points[0]?.z ?? 0);
    expect(end.y).toBeCloseTo(points[2]?.y ?? 0);
    expect(end.z).toBeCloseTo(points[2]?.z ?? 0);

    const closest = Polyline.closestPoint(
      Polyline.make([Point.make(0, 0), Point.make(4, 0)]),
      Point.make(2, 5),
    );
    expect(closest.y).toBeCloseTo(2);
    expect(closest.z).toBeCloseTo(0);

    const [first, second] = Polyline.split(
      Polyline.make([Point.make(0, 0), Point.make(4, 0), Point.make(4, 4)]),
      Point.make(2, 0),
    );
    expect(first.points.length).toBe(2);
    expect(second.points.length).toBe(3);
  });
});

describe('Polyline transforms and error paths', () => {
  it('translates, rotates and mirrors', () => {
    const translated = Polyline.translate(Polyline.make(points), Vector.make(0, 5));
    expect(translated.points[0]).toEqual({ y: 0, z: 5 });

    const rotated = Polyline.rotate(Polyline.make([Point.make(1, 0)]), Math.PI / 2);
    expect(rotated.points[0]?.y).toBeCloseTo(0);
    expect(rotated.points[0]?.z).toBeCloseTo(-1);

    const mirrored = Polyline.mirror(
      Polyline.make([Point.make(1, 2)]),
      Point.make(0, 0),
      Point.make(1, 0),
    );
    expect(mirrored.points[0]?.z).toBeCloseTo(-2);
  });

  it('throws InvalidPolylineError for empty and too-short polylines', () => {
    expect(() => Polyline.pointAt(Polyline.make([]), 0.5)).toThrow(
      InvalidPolylineError,
    );
    expect(() =>
      Polyline.closestPoint(Polyline.make([]), Point.make(0, 0)),
    ).toThrow(InvalidPolylineError);
    expect(() => Polyline.split(Polyline.make([]), Point.make(0, 0))).toThrow(
      InvalidPolylineError,
    );
    expect(() =>
      Polyline.split(Polyline.make([Point.make(0, 0)]), Point.make(0, 0)),
    ).toThrow(InvalidPolylineError);
  });
});
