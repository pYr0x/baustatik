import { describe, expect, it } from 'vitest';
import { Line, Point, Vector } from '../src';

const p00 = Point.make(0, 0);
const p30 = Point.make(3, 0);
const p34 = Point.make(3, 4);

describe('Line scalar and point methods', () => {
  it('computes length and midpoint', () => {
    expect(Line.length(Line.make(p00, p34))).toBeCloseTo(5);
    expect(Line.midpoint(Line.make(p00, p30))).toEqual({ y: 1.5, z: 0 });
  });

  it('computes direction and normal', () => {
    const direction = Line.direction(Line.make(p00, p30));
    expect(direction.dy).toBeCloseTo(1);
    expect(direction.dz).toBeCloseTo(0);
    // CCW perpendicular to +y direction points toward -z (upward in YZ drawing)
    const normal = Line.normalVector(Line.make(p00, p30));
    expect(normal.dy).toBeCloseTo(0);
    expect(normal.dz).toBeCloseTo(-1);
  });
});

describe('Line geometry operations', () => {
  it('extends and builds parallel line', () => {
    const extended = Line.extend(Line.make(p00, p30), 1, 1);
    expect(extended.p1.y).toBeCloseTo(-1);
    expect(extended.p2.y).toBeCloseTo(4);

    // Parallel offset: normal of +y line = -z (upward), so distance=2 offsets upward
    const parallel = Line.parallel(Line.make(p00, p30), 2);
    expect(parallel.p1.z).toBeCloseTo(-2);
    expect(parallel.p2.z).toBeCloseTo(-2);
  });

  it('finds closest point and distance to point', () => {
    const closest = Line.closestPoint(Line.make(p00, p30), Point.make(1.5, 5));
    expect(closest.y).toBeCloseTo(1.5);
    expect(closest.z).toBeCloseTo(0);
    expect(
      Line.distanceToPoint(Line.make(p00, p30), Point.make(1.5, 3)),
    ).toBeCloseTo(3);
  });

  it('intersects lines and segment-bounded intersections', () => {
    const a = Line.make(Point.make(0, 0), Point.make(2, 2));
    const b = Line.make(Point.make(0, 2), Point.make(2, 0));
    const c = Line.make(Point.make(5, -1), Point.make(5, 1));

    const intersection = Line.intersect(a, b);
    expect(intersection?.y).toBeCloseTo(1);
    expect(intersection?.z).toBeCloseTo(1);
    expect(Line.intersectSegment(Line.make(p00, Point.make(1, 0)), c)).toBeNull();
  });
});

describe('Line transforms and relation checks', () => {
  it('detects parallel/perpendicular and computes angle', () => {
    expect(
      Line.isParallel(
        Line.make(p00, p30),
        Line.make(Point.make(0, 1), Point.make(3, 1)),
      ),
    ).toBe(true);
    expect(
      Line.isPerpendicular(
        Line.make(p00, p30),
        Line.make(Point.make(1, 0), Point.make(1, 3)),
      ),
    ).toBe(true);
    expect(
      Line.angle(Line.make(p00, p30), Line.make(p00, Point.make(0, 3))),
    ).toBeCloseTo(Math.PI / 2);
  });

  it('supports split, translate, rotate and mirror', () => {
    const [first, second] = Line.split(Line.make(p00, p30), Point.make(1, 0));
    expect(first.p2).toEqual({ y: 1, z: 0 });
    expect(second.p1).toEqual({ y: 1, z: 0 });

    const translated = Line.translate(Line.make(p00, p30), Vector.make(0, 1));
    expect(translated.p1).toEqual({ y: 0, z: 1 });

    const rotated = Line.rotate(Line.make(p00, p30), Math.PI / 2);
    expect(rotated.p2.y).toBeCloseTo(0);
    expect(rotated.p2.z).toBeCloseTo(-3);

    const mirrored = Line.mirror(
      Line.make(Point.make(0, 1), Point.make(3, 1)),
      Point.make(0, 0),
      Point.make(1, 0),
    );
    expect(mirrored.p1.z).toBeCloseTo(-1);
    expect(mirrored.p2.z).toBeCloseTo(-1);
  });
});
