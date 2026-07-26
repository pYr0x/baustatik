import { Line, Point, Vector } from '@baustatik/fem-geometry';
import type { LoadAxis, LoadFrame } from '@baustatik/fem-loads';
import { describe, expect, it } from 'vitest';
import { loadDirection, loadStation } from '../src/load-geometry';
import { toLocalComponents } from '../src/resolve';

// z zeigt abwaerts, `down45` faellt nach rechts. Am schraegen Stab
// unterscheiden sich global und lokal ueberhaupt erst.
const DOWN45 = Line.make(Point.make(0, 0), Point.make(1, 1));
const S = Math.SQRT1_2;

describe('loadStation()', () => {
  it('passes an absolute distance through unchanged', () => {
    expect(loadStation(1.5, false, 4)).toBe(1.5);
  });

  it('reads a relative distance as PERCENT of the beam length', () => {
    // 25 heisst 25 %, nicht 25 % von 100 und auch nicht der Faktor 25.
    expect(loadStation(25, true, 4)).toBe(1);
    expect(loadStation(100, true, 4)).toBe(4);
  });

  it('clamps below zero and above the beam length', () => {
    expect(loadStation(-1, false, 4)).toBe(0);
    expect(loadStation(9, false, 4)).toBe(4);
    expect(loadStation(150, true, 4)).toBe(4);
  });
});

describe('loadDirection()', () => {
  it('returns the plain global unit vectors for frame global', () => {
    expect(loadDirection('global', 'x', DOWN45)).toEqual(Vector.make(1, 0));
    expect(loadDirection('global', 'z', DOWN45)).toEqual(Vector.make(0, 1));
  });

  it('rotates the local axes into global coordinates', () => {
    const ex = loadDirection('local', 'x', DOWN45);
    const ez = loadDirection('local', 'z', DOWN45);

    expect(ex.dx).toBeCloseTo(S, 12);
    expect(ex.dz).toBeCloseTo(S, 12);
    // ez entsteht aus ex durch die Drehung (dx, dz) -> (-dz, dx).
    expect(ez.dx).toBeCloseTo(-S, 12);
    expect(ez.dz).toBeCloseTo(S, 12);
  });

  it('always returns a unit vector', () => {
    for (const frame of ['global', 'local'] as const) {
      for (const axis of ['x', 'z'] as const) {
        expect(Vector.length(loadDirection(frame, axis, DOWN45))).toBeCloseTo(
          1,
          12,
        );
      }
    }
  });
});

describe('loadDirection() und toLocalComponents() bleiben gekoppelt', () => {
  // `toLocalComponents` bleibt bewusst NICHT ueber `loadDirection` gebaut: im
  // lokalen Fall entstuende ein toGlobal-nach-toLocal-Rundlauf, der dem
  // Solverpfad Fliesskommarauschen zufuegt. Diese Kopplung sichert deshalb der
  // Test statt der Code.
  const frames: LoadFrame[] = ['global', 'local'];
  const axes: LoadAxis[] = ['x', 'z'];

  for (const frame of frames) {
    for (const axis of axes) {
      it(`agrees for frame ${frame} and axis ${axis} on a skewed beam`, () => {
        const viaDirection = Line.toLocal(
          DOWN45,
          loadDirection(frame, axis, DOWN45),
        );
        const direct = toLocalComponents(frame, axis, 1, DOWN45);

        expect(viaDirection.dx).toBeCloseTo(direct.dx, 12);
        expect(viaDirection.dz).toBeCloseTo(direct.dz, 12);
      });
    }
  }
});
