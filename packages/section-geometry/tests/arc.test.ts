import { describe, expect, it } from 'vitest';
import {
  Arc,
  CollinearPointsError,
  InvalidArcError,
  Line,
  Point,
  Vector,
} from '../src';

describe('Arc factories', () => {
  it('creates arc from center and validates radius', () => {
    const arc = Arc.fromCenter(Point.make(0, 0), 5, 0, Math.PI);
    expect(arc.radius).toBe(5);
    expect(() => Arc.fromCenter(Point.make(0, 0), 0, 0, Math.PI)).toThrow(
      InvalidArcError,
    );
  });

  it('creates arc via make with positive sweep (CCW)', () => {
    const arc = Arc.make(Point.make(0, 0), 3, 0, Math.PI / 2);
    expect(arc.radius).toBe(3);
    expect(arc.sweep).toBeCloseTo(Math.PI / 2);
    expect(() => Arc.make(Point.make(0, 0), 0, 0, Math.PI)).toThrow(
      InvalidArcError,
    );
  });

  it('creates arc via make with negative sweep (CW)', () => {
    const arc = Arc.make(Point.make(0, 0), 3, 0, -Math.PI / 2);
    expect(arc.sweep).toBeCloseTo(-Math.PI / 2);
  });

  it('creates arc from three points and rejects collinear points', () => {
    const arc = Arc.fromPoints(Point.make(1, 0), Point.make(0, -1), Point.make(-1, 0));
    expect(arc.center.y).toBeCloseTo(0);
    expect(arc.center.z).toBeCloseTo(0);
    expect(arc.radius).toBeCloseTo(1);

    expect(() =>
      Arc.fromPoints(Point.make(0, 0), Point.make(1, 0), Point.make(2, 0)),
    ).toThrow(CollinearPointsError);
  });
});

describe('Arc swap', () => {
  it('reverses start/end and negates sweep', () => {
    const arc = Arc.make(Point.make(0, 0), 1, 0, Math.PI / 2);
    const swapped = Arc.swap(arc);
    expect(swapped.sweep).toBeCloseTo(-Math.PI / 2);
    // start point of swapped == end point of original
    expect(Arc.startPoint(swapped).y).toBeCloseTo(Arc.endPoint(arc).y);
    expect(Arc.startPoint(swapped).z).toBeCloseTo(Arc.endPoint(arc).z);
  });
});

describe('Arc geometry helpers', () => {
  it('computes length and midpoint', () => {
    const arc = Arc.fromCenter(Point.make(0, 0), 1, 0, Math.PI / 2);
    expect(Arc.length(arc)).toBeCloseTo(Math.PI / 2);
    const midpoint = Arc.midpoint(arc);
    // CCW from +y toward -z: midpoint at 45° CCW, so z is negative (upward)
    expect(midpoint.y).toBeCloseTo(Math.cos(Math.PI / 4));
    expect(midpoint.z).toBeCloseTo(-Math.sin(Math.PI / 4));
  });

  it('applies start/end swap rule for point accessors', () => {
    const arc = Arc.fromCenter(Point.make(0, 0), 1, 0, Math.PI / 2);
    // startAngle=0 → start point at (y=1, z=0)
    expect(Arc.startPoint(arc).y).toBeCloseTo(1);
    expect(Arc.startPoint(arc).z).toBeCloseTo(0);
    // endAngle=π/2 CCW from +y → end point at (y=0, z=-1) (upward)
    expect(Arc.endPoint(arc).y).toBeCloseTo(0);
    expect(Arc.endPoint(arc).z).toBeCloseTo(-1);
  });

  it('computes outward normals', () => {
    const arc = Arc.fromCenter(Point.make(0, 0), 1, 0, Math.PI * 2);
    const normalAtAngle = Arc.normalAt(arc, 0);
    expect(normalAtAngle.dy).toBeCloseTo(1);
    expect(normalAtAngle.dz).toBeCloseTo(0);

    const point = Arc.startPoint(arc);
    const radial = Vector.fromPoints(arc.center, point);
    const normalAtPoint = Arc.normalAtPoint(arc, point);
    expect(Vector.dot(radial, normalAtPoint)).toBeGreaterThan(0);
  });
});

describe('Arc operations', () => {
  it('offsets radius and validates result', () => {
    const arc = Arc.fromCenter(Point.make(0, 0), 5, 0, Math.PI);
    expect(Arc.offset(arc, 2).radius).toBe(7);
    expect(() => Arc.offset(arc, -6)).toThrow(InvalidArcError);
  });

  it('creates polyline in correct CCW order', () => {
    const arc = Arc.fromCenter(Point.make(0, 0), 1, 0, Math.PI / 2);
    const polyline = Arc.toPolyline(arc, { segments: 8 });
    const start = Arc.startPoint(arc);
    const end = Arc.endPoint(arc);
    const first = polyline.points[0];
    const last = polyline.points.at(-1);
    expect(polyline.points.length).toBe(9);
    // first point matches startPoint, last point matches endPoint
    expect(first?.y).toBeCloseTo(start.y);
    expect(first?.z).toBeCloseTo(start.z);
    expect(last?.y).toBeCloseTo(end.y);
    expect(last?.z).toBeCloseTo(end.z);
  });

  it('intersects line and arc variants', () => {
    const arc = Arc.fromCenter(Point.make(0, 0), 1, 0, Math.PI);
    const line = Line.make(Point.make(0, -2), Point.make(0, 2));
    expect(Arc.intersectLine(arc, line).length).toBe(1);
    expect(Arc.intersectLineFull(arc, line).length).toBe(2);

    const circleA = Arc.fromCenter(Point.make(0, 0), 1, 0, 2 * Math.PI);
    const circleB = Arc.fromCenter(Point.make(1, 0), 1, 0, 2 * Math.PI);
    expect(Arc.intersectArcFull(circleA, circleB).length).toBe(2);
  });
});

describe('Arc transforms', () => {
  it('translates, rotates and mirrors', () => {
    const arc = Arc.fromCenter(Point.make(0, 0), 1, 0, Math.PI / 2);
    const axisP1 = Point.make(0, 0);
    const axisP2 = Point.make(1, 0);

    const translated = Arc.translate(arc, Vector.make(3, 1));
    expect(translated.center).toEqual({ y: 3, z: 1 });

    const rotated = Arc.rotate(arc, Math.PI / 2);
    // startAngle rotated CCW by π/2: 0 + π/2 = π/2
    expect(rotated.startAngle).toBeCloseTo(Math.PI / 2);

    const mirrored = Arc.mirror(arc, axisP1, axisP2);
    const expectedMirroredStart = Point.mirror(Arc.startPoint(arc), axisP1, axisP2);
    const expectedMirroredEnd = Point.mirror(Arc.endPoint(arc), axisP1, axisP2);
    const mirroredStart = Arc.startPoint(mirrored);
    const mirroredEnd = Arc.endPoint(mirrored);

    const sameOrder =
      Math.abs(mirroredStart.y - expectedMirroredStart.y) < 1e-10 &&
      Math.abs(mirroredStart.z - expectedMirroredStart.z) < 1e-10 &&
      Math.abs(mirroredEnd.y - expectedMirroredEnd.y) < 1e-10 &&
      Math.abs(mirroredEnd.z - expectedMirroredEnd.z) < 1e-10;

    const swappedOrder =
      Math.abs(mirroredStart.y - expectedMirroredEnd.y) < 1e-10 &&
      Math.abs(mirroredStart.z - expectedMirroredEnd.z) < 1e-10 &&
      Math.abs(mirroredEnd.y - expectedMirroredStart.y) < 1e-10 &&
      Math.abs(mirroredEnd.z - expectedMirroredStart.z) < 1e-10;

    expect(sameOrder || swappedOrder).toBe(true);
    expect(mirrored.radius).toBeCloseTo(arc.radius);
  });
});
