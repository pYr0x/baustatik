import { describe, expect, it } from 'vitest';
import {
  DiscontinuousLinesError,
  InvalidPolygonError,
  Line,
  Point,
  Polygon,
  Vector,
} from '../src';

const rect = [
  Point.make(0, 0),
  Point.make(4, 0),
  Point.make(4, 3),
  Point.make(0, 3),
];

describe('Polygon.make and signedArea', () => {
  it('throws for fewer than 3 points', () => {
    expect(() => Polygon.make([Point.make(0, 0), Point.make(1, 0)])).toThrow(
      InvalidPolygonError,
    );
  });

  it('uses signedArea > 0 for YZ-clockwise polygons', () => {
    const clockwise = [
      Point.make(0, 0),
      Point.make(1, 0),
      Point.make(1, 1),
      Point.make(0, 1),
    ];
    const counterClockwise = [...clockwise].reverse();
    expect(Polygon.signedArea(clockwise)).toBeGreaterThan(0);
    expect(Polygon.signedArea(counterClockwise)).toBeLessThan(0);
  });

  // Normalisiert auf den positiven Drehsinn (+y → +z), passend zu
  // Vector.angle/cross/Arc.sweep. Im Bild ist das rechtsdrehend.
  it('normalizes to signedArea >= 0 and keeps input array immutable', () => {
    const counterClockwise = [
      Point.make(0, 1),
      Point.make(1, 1),
      Point.make(1, 0),
      Point.make(0, 0),
    ];
    const snapshot = [...counterClockwise];
    const polygon = Polygon.make(counterClockwise);
    expect(Polygon.signedArea(polygon.points)).toBeGreaterThan(0);
    expect(Polygon.isClockwise(polygon)).toBe(true);
    expect(counterClockwise).toEqual(snapshot);
  });

  it('leaves an already positively wound ring untouched', () => {
    const positive = [
      Point.make(0, 0),
      Point.make(1, 0),
      Point.make(1, 1),
      Point.make(0, 1),
    ];
    expect(Polygon.make(positive).points).toEqual(positive);
  });
});

describe('Polygon scalar and point operations', () => {
  it('computes area, centroid and perimeter', () => {
    const polygon = Polygon.make(rect);
    expect(Polygon.area(polygon)).toBeCloseTo(12);
    expect(Polygon.area(polygon)).toBeGreaterThanOrEqual(0);
    const centroid = Polygon.centroid(polygon);
    expect(centroid.y).toBeCloseTo(2);
    expect(centroid.z).toBeCloseTo(1.5);
    expect(Polygon.perimeter(polygon)).toBeCloseTo(14);
  });

  it('checks containment', () => {
    const polygon = Polygon.make(rect);
    expect(Polygon.contains(polygon, Point.make(2, 1.5))).toBe(true);
    expect(Polygon.contains(polygon, Point.make(5, 5))).toBe(false);
  });
});

describe('Polygon winding helpers', () => {
  it('toClockwise and toCounterClockwise behave as expected', () => {
    const poly = Polygon.make([
      Point.make(0, 0),
      Point.make(0, 3),
      Point.make(4, 3),
      Point.make(4, 0),
    ]);
    const clockwise = Polygon.toClockwise(poly);
    expect(Polygon.isClockwise(clockwise)).toBe(true);

    const counterClockwise = Polygon.toCounterClockwise(clockwise);
    expect(Polygon.isClockwise(counterClockwise)).toBe(false);
  });
});

describe('Polygon construction and boolean ops', () => {
  it('creates polygon from line loop and validates input', () => {
    const lines = [
      Line.make(Point.make(0, 0), Point.make(4, 0)),
      Line.make(Point.make(4, 0), Point.make(4, 3)),
      Line.make(Point.make(4, 3), Point.make(0, 3)),
      Line.make(Point.make(0, 3), Point.make(0, 0)),
    ];
    const polygon = Polygon.fromLines(lines);
    expect(Polygon.area(polygon)).toBeCloseTo(12);

    expect(() => Polygon.fromLines(lines.slice(0, 2))).toThrow(InvalidPolygonError);

    const disconnected = [
      Line.make(Point.make(0, 0), Point.make(1, 0)),
      Line.make(Point.make(5, 0), Point.make(5, 1)),
      Line.make(Point.make(5, 1), Point.make(0, 0)),
    ];
    expect(() => Polygon.fromLines(disconnected)).toThrow(DiscontinuousLinesError);
  });

  it('supports intersect/union/subtract and normalizes outputs to YZ-counter-clockwise', () => {
    const a = Polygon.make([
      Point.make(0, 0),
      Point.make(4, 0),
      Point.make(4, 4),
      Point.make(0, 4),
    ]);
    const b = Polygon.make([
      Point.make(2, 0),
      Point.make(6, 0),
      Point.make(6, 4),
      Point.make(2, 4),
    ]);

    // Alle Ausgaben laufen durch Polygon.make und tragen daher den positiven
    // Drehsinn (signedArea >= 0).
    const positivelyWound = (polygon: { points: Point[] }) =>
      Polygon.signedArea(polygon.points) >= 0;

    const intersection = Polygon.intersect(a, b);
    expect(intersection.length).toBeGreaterThan(0);
    expect(intersection.every(positivelyWound)).toBe(true);

    const union = Polygon.union(a, b);
    expect(union.length).toBeGreaterThan(0);
    expect(union.every(positivelyWound)).toBe(true);

    const subtraction = Polygon.subtract(a, b);
    expect(subtraction.length).toBeGreaterThan(0);
    expect(subtraction.every(positivelyWound)).toBe(true);

    expect(Polygon.intersect(a, Polygon.translate(b, Vector.make(100, 0)))).toEqual([]);
    expect(Polygon.subtract(a, a)).toEqual([]);
  });
});

describe('Polygon transforms and bounding box', () => {
  it('computes bounding box with ordered min/max', () => {
    const boundingBox = Polygon.boundingBox(Polygon.make(rect));
    expect(boundingBox.min.y).toBe(0);
    expect(boundingBox.min.z).toBe(0);
    expect(boundingBox.max.y).toBe(4);
    expect(boundingBox.max.z).toBe(3);
  });

  it('translates, rotates and mirrors while preserving winding policy', () => {
    const polygon = Polygon.make(rect);
    // Ueber die Bounding-Box geprueft statt ueber points[0]: welche Ecke der
    // Ring zuerst nennt, haengt an der Normalisierung und ist keine Zusage.
    const translated = Polygon.translate(polygon, Vector.make(1, 1));
    const box = Polygon.boundingBox(translated);
    expect(box.min).toEqual({ y: 1, z: 1 });
    expect(box.max).toEqual({ y: 5, z: 4 });

    const rotated = Polygon.rotate(polygon, Math.PI / 2, Point.make(0, 0));
    expect(Polygon.area(rotated)).toBeCloseTo(12); // area is rotation-invariant

    // Spiegeln dreht die Windung um, Polygon.make normalisiert sie zurueck.
    const mirrored = Polygon.mirror(polygon, Point.make(0, 0), Point.make(1, 0));
    expect(Polygon.signedArea(mirrored.points)).toBeGreaterThanOrEqual(0);
    expect(Polygon.area(mirrored)).toBeCloseTo(12);
  });
});
