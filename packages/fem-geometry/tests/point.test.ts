import { describe, expect, it } from 'vitest';
import { Point } from '../src/point';
import { Vector } from '../src/vector';

const origin = Point.make(0, 0);

describe('Point.rotate', () => {
  // Gleicher Drehsinn wie Vector.rotate: +x geht nach +z, also im Bild nach
  // unten. Siehe tests/vector.test.ts.
  it('+90° dreht (1,0) auf (0,1)', () => {
    const r = Point.rotate(Point.make(1, 0), Math.PI / 2);
    expect(r.x).toBeCloseTo(0);
    expect(r.z).toBeCloseTo(1);
  });

  it('dreht um einen Ursprung ungleich (0,0)', () => {
    const r = Point.rotate(Point.make(2, 1), Math.PI / 2, Point.make(1, 1));
    expect(r.x).toBeCloseTo(1);
    expect(r.z).toBeCloseTo(2);
  });
});

describe('Point: Abstand, Gleichheit, Verschiebung', () => {
  it('distance 3-4-5', () => {
    expect(Point.distance(origin, Point.make(3, 4))).toBeCloseTo(5);
  });

  it('equals mit Toleranz', () => {
    expect(Point.equals(origin, Point.make(1e-12, 0))).toBe(true);
    expect(Point.equals(origin, Point.make(1e-6, 0))).toBe(false);
  });

  it('translate addiert komponentenweise', () => {
    expect(Point.translate(Point.make(1, 2), Vector.make(3, 4))).toEqual({
      x: 4,
      z: 6,
    });
  });
});

describe('Point.mirror', () => {
  it('spiegelt an der x-Achse', () => {
    const m = Point.mirror(Point.make(2, 3), origin, Point.make(1, 0));
    expect(m.x).toBeCloseTo(2);
    expect(m.z).toBeCloseTo(-3);
  });
});
