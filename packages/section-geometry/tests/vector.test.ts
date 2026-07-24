import { Vector as GeometryVector } from '@baustatik/geometry-2d';
import { describe, expect, it } from 'vitest';
import { DegenerateVectorError, Point, Vector } from '../src';
import { toXYVector } from '../src/convert';

describe('Vector basic operations', () => {
  it('creates and derives vectors', () => {
    expect(Vector.make(1, 2)).toEqual({ dy: 1, dz: 2 });
    expect(Vector.fromPoints(Point.make(1, 1), Point.make(4, 5))).toEqual({
      dy: 3,
      dz: 4,
    });
  });

  it('normalizes and throws for zero vector', () => {
    const normalized = Vector.normalize(Vector.make(3, 4));
    expect(Vector.length(normalized)).toBeCloseTo(1);
    expect(() => Vector.normalize(Vector.make(0, 0))).toThrow(
      DegenerateVectorError,
    );
  });

  it('supports component arithmetic', () => {
    expect(Vector.add(Vector.make(1, 2), Vector.make(3, 4))).toEqual({
      dy: 4,
      dz: 6,
    });
    expect(Vector.subtract(Vector.make(3, 4), Vector.make(1, 2))).toEqual({
      dy: 2,
      dz: 2,
    });
    expect(Vector.scale(Vector.make(1, 2), 3)).toEqual({ dy: 3, dz: 6 });
    expect(Vector.negate(Vector.make(1, -2))).toEqual({ dy: -1, dz: 2 });
  });
});

describe('Vector orientation and angles', () => {
  it('uses oriented cross product convention', () => {
    expect(Vector.cross(Vector.make(1, 0), Vector.make(0, 1))).toBe(1);
  });

  it('keeps dot product invariant under mapping', () => {
    const a = Vector.make(2, -3);
    const b = Vector.make(-4, 5);
    expect(Vector.dot(a, b)).toBeCloseTo(
      GeometryVector.dot(toXYVector(a), toXYVector(b)),
    );
  });

  it('returns angle in [0, 2pi), measured from +y towards +z', () => {
    // (dy=1, dz=0) points along +y → angle 0
    expect(Vector.angle(Vector.make(1, 0))).toBeCloseTo(0);
    // (dy=0, dz=1) points along +z (downward) → angle π/2
    const angle = Vector.angle(Vector.make(0, 1));
    expect(angle).toBeGreaterThanOrEqual(0);
    expect(angle).toBeLessThan(2 * Math.PI);
    expect(angle).toBeCloseTo(Math.PI / 2);
    // (dy=0, dz=-1) points against +z (upward) → angle 3π/2
    expect(Vector.angle(Vector.make(0, -1))).toBeCloseTo((3 * Math.PI) / 2);
  });

  // Der Drehsinn von `angle` muss zu `cross` passen: beide zaehlen +y → +z.
  // Frueher liefen sie gegeneinander, weil `cross` nativ und `angle` delegiert
  // gerechnet wurde und `convert.ts` spiegelte.
  it('cross agrees with the rotation sense of angle', () => {
    const right = Vector.make(1, 0);
    expect(Vector.cross(right, Vector.rotate(right, Math.PI / 2))).toBeCloseTo(
      1,
    );
  });

  it('rotates and computes perpendicular vector', () => {
    // +90° führt +y auf +z, im Bild also nach unten.
    const rotated = Vector.rotate(Vector.make(1, 0), Math.PI / 2);
    expect(rotated.dy).toBeCloseTo(0);
    expect(rotated.dz).toBeCloseTo(1);

    // perpendicular normalisiert nicht, die Länge bleibt erhalten.
    const perpendicular = Vector.perpendicular(Vector.make(2, 0));
    expect(perpendicular.dy).toBeCloseTo(0);
    expect(perpendicular.dz).toBeCloseTo(2);
    expect(Vector.dot(perpendicular, Vector.make(2, 0))).toBeCloseTo(0);
  });
});
