import { describe, expect, it } from 'vitest';
import { normalizeAngleYZ } from '../src/convert';
import { Point } from '../src/point';
import { Vector } from '../src/vector';

const ex = Vector.make(1, 0);
const down = Vector.make(0, 1);
const up = Vector.make(0, -1);
const s = Math.SQRT1_2;

// Diese Datei nagelt den Drehsinn fest. Alle Operationen hier delegieren an
// geometry-2d; sie stimmen nur, solange `convert.ts` orientierungstreu bleibt
// (y := z ohne Vorzeichenwechsel). Eine wieder eingeführte Spiegelung dreht
// jede einzelne dieser Erwartungen um — das ist der Zweck der Datei.
describe('Drehsinn: positive Drehung führt +x nach +z', () => {
  it('perpendicular(+x) = +z', () => {
    const p = Vector.perpendicular(ex);
    expect(p.dx).toBeCloseTo(0);
    expect(p.dz).toBeCloseTo(1);
  });

  it('rotate(+x, +90°) = +z', () => {
    const r = Vector.rotate(ex, Math.PI / 2);
    expect(r.dx).toBeCloseTo(0);
    expect(r.dz).toBeCloseTo(1);
  });

  it('rotate(+x, +45°) fällt nach rechts unten', () => {
    const r = Vector.rotate(ex, Math.PI / 4);
    expect(r.dx).toBeCloseTo(s);
    expect(r.dz).toBeCloseTo(s);
  });

  it('cross(+x, +z) ist positiv und stimmt mit rotate überein', () => {
    expect(Vector.cross(ex, down)).toBeCloseTo(1);
    expect(Vector.cross(ex, Vector.rotate(ex, Math.PI / 2))).toBeCloseTo(1);
  });
});

describe('Vector.angle', () => {
  // alpha = atan2(dz, dx) — genau die Konvention aus fem-element/fem-loads:
  // cos(alpha) = dx/L, sin(alpha) = dz/L.
  it('misst von +x nach +z', () => {
    expect(Vector.angle(ex)).toBeCloseTo(0);
    expect(Vector.angle(down)).toBeCloseTo(Math.PI / 2);
    expect(Vector.angle(up)).toBeCloseTo((3 * Math.PI) / 2);
  });

  it('ein nach rechts unten fallender Stab hat alpha = +45°', () => {
    const axis = Vector.fromPoints(Point.make(0, 0), Point.make(1, 1));
    expect(Vector.angle(axis)).toBeCloseTo(Math.PI / 4);
    expect(Math.sin(Vector.angle(axis))).toBeCloseTo(s);
  });

  it('normalizeAngleYZ bildet auf [0, 2*PI) ab', () => {
    expect(normalizeAngleYZ(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2);
    expect(normalizeAngleYZ(3 * Math.PI)).toBeCloseTo(Math.PI);
  });
});

describe('Vector: Grundrechenarten', () => {
  it('fromPoints zeigt von a nach b', () => {
    const v = Vector.fromPoints(Point.make(1, 2), Point.make(4, 6));
    expect(v).toEqual({ dx: 3, dz: 4 });
  });

  it('length und normalize', () => {
    const v = Vector.make(3, 4);
    expect(Vector.length(v)).toBeCloseTo(5);
    const n = Vector.normalize(v);
    expect(n.dx).toBeCloseTo(0.6);
    expect(n.dz).toBeCloseTo(0.8);
  });

  it('add / subtract / scale / negate', () => {
    const a = Vector.make(1, 2);
    const b = Vector.make(3, -1);
    expect(Vector.add(a, b)).toEqual({ dx: 4, dz: 1 });
    expect(Vector.subtract(a, b)).toEqual({ dx: -2, dz: 3 });
    expect(Vector.scale(a, 2)).toEqual({ dx: 2, dz: 4 });
    expect(Vector.negate(a)).toEqual({ dx: -1, dz: -2 });
  });

  it('dot ist orientierungsfrei und damit unempfindlich gegen die Abbildung', () => {
    expect(Vector.dot(ex, down)).toBeCloseTo(0);
    expect(Vector.dot(Vector.make(1, 2), Vector.make(3, 4))).toBeCloseTo(11);
  });
});
