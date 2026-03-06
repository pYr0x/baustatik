import { describe, expect, it } from 'vitest';
import { DegenerateAxisError, Point, Vector } from '../src';

describe('Point.make', () => {
  it('creates a point', () => {
    expect(Point.make(3, 4)).toEqual({ y: 3, z: 4 });
  });
});

describe('Point.distance and equals', () => {
  it('computes 3-4-5 distance', () => {
    expect(Point.distance(Point.make(0, 0), Point.make(3, 4))).toBe(5);
  });

  it('supports tolerance', () => {
    expect(Point.equals(Point.make(0, 0), Point.make(0, 1e-11), 1e-10)).toBe(
      true,
    );
  });
});

describe('Point transforms', () => {
  it('translates by vector', () => {
    expect(Point.translate(Point.make(1, 2), Vector.make(3, -1))).toEqual({
      y: 4,
      z: 1,
    });
  });

  it('rotates 90 degrees around origin', () => {
    const rotated = Point.rotate(Point.make(1, 0), Math.PI / 2);
    expect(rotated.y).toBeCloseTo(0);
    expect(rotated.z).toBeCloseTo(-1);
  });

  it('rotates with custom origin', () => {
    const rotated = Point.rotate(Point.make(2, 0), Math.PI / 2, Point.make(1, 0));
    expect(rotated.y).toBeCloseTo(1);
    expect(rotated.z).toBeCloseTo(-1);
  });

  it('mirrors across z=0 axis', () => {
    const mirrored = Point.mirror(
      Point.make(1, 2),
      Point.make(0, 0),
      Point.make(1, 0),
    );
    expect(mirrored.y).toBeCloseTo(1);
    expect(mirrored.z).toBeCloseTo(-2);
  });

  it('throws for degenerate mirror axis', () => {
    expect(() =>
      Point.mirror(Point.make(1, 2), Point.make(0, 0), Point.make(0, 0)),
    ).toThrow(DegenerateAxisError);
  });
});
