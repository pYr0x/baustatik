import { describe, expect, it } from 'vitest';
import { Line } from '../src/line';
import { Point } from '../src/point';
import { Vector } from '../src/vector';

const s = Math.SQRT1_2;

const origin = Point.make(0, 0);
// x/z mit z abwärts: p2 = (1, 1) fällt nach rechts unten (alpha = +45°),
// p2 = (1, -1) steigt nach rechts oben (alpha = -45°).
const horizontal = Line.make(origin, Point.make(3, 0));
const down45 = Line.make(origin, Point.make(1, 1));
const up45 = Line.make(origin, Point.make(1, -1));

describe('Line.frame', () => {
  it('waagrechter Stab: ex = +x, ez = +z (abwärts)', () => {
    const { ex, ez } = Line.frame(horizontal);
    expect(ex.dx).toBeCloseTo(1);
    expect(ex.dz).toBeCloseTo(0);
    expect(ez.dx).toBeCloseTo(0);
    expect(ez.dz).toBeCloseTo(1);
  });

  it('45°-Stab: ez = (−sinα, cosα)', () => {
    const { ex, ez } = Line.frame(down45);
    expect(ex.dx).toBeCloseTo(s);
    expect(ex.dz).toBeCloseTo(s);
    expect(ez.dx).toBeCloseTo(-s);
    expect(ez.dz).toBeCloseTo(s);
  });

  // Tripwire für die Orientierung von convert.ts: `frame` rechnet nativ in
  // x/z, `normalVector` delegiert an geometry-2d. Nur solange die Abbildung
  // orientierungstreu ist (y := z ohne Minus), stimmen beide überein. Eine
  // wieder eingeführte Spiegelung kippt allein die rechte Seite.
  it('ez stimmt mit dem delegierten normalVector überein', () => {
    for (const line of [horizontal, down45, up45]) {
      const { ez } = Line.frame(line);
      const n = Line.normalVector(line);
      expect(ez.dx).toBeCloseTo(n.dx);
      expect(ez.dz).toBeCloseTo(n.dz);
    }
  });

  it('waagrechter Stab: normalVector zeigt nach unten (+z)', () => {
    expect(Line.normalVector(horizontal).dz).toBeCloseTo(1);
  });

  it('ex und ez stehen senkrecht und sind normiert', () => {
    const { ex, ez } = Line.frame(Line.make(origin, Point.make(3, 4)));
    expect(Vector.dot(ex, ez)).toBeCloseTo(0);
    expect(Vector.length(ex)).toBeCloseTo(1);
    expect(Vector.length(ez)).toBeCloseTo(1);
  });

  it('vertauschte Knoten spiegeln beide Achsen', () => {
    const { ex, ez } = Line.frame(down45);
    const reversed = Line.frame(Line.make(down45.p2, down45.p1));
    expect(reversed.ex.dx).toBeCloseTo(-ex.dx);
    expect(reversed.ex.dz).toBeCloseTo(-ex.dz);
    expect(reversed.ez.dx).toBeCloseTo(-ez.dx);
    expect(reversed.ez.dz).toBeCloseTo(-ez.dz);
  });
});

describe('Line.toLocal', () => {
  it('waagrechter Stab: global bleibt lokal', () => {
    const local = Line.toLocal(horizontal, Vector.make(2, 5));
    expect(local.dx).toBeCloseTo(2);
    expect(local.dz).toBeCloseTo(5);
  });

  it('45°-Stab, Last nach unten: qx = qz = q·√2/2', () => {
    const local = Line.toLocal(down45, Vector.make(0, 1));
    expect(local.dx).toBeCloseTo(s);
    expect(local.dz).toBeCloseTo(s);
  });

  it('−45°-Stab, Last nach unten: qx und qz haben verschiedene Vorzeichen', () => {
    const local = Line.toLocal(up45, Vector.make(0, 1));
    expect(local.dx).toBeCloseTo(-s);
    expect(local.dz).toBeCloseTo(s);
  });

  it('45°-Stab, Last in +x: qx = q·cosα, qz = −q·sinα', () => {
    const local = Line.toLocal(down45, Vector.make(1, 0));
    expect(local.dx).toBeCloseTo(s);
    expect(local.dz).toBeCloseTo(-s);
  });

  it('erhält die Länge', () => {
    expect(Vector.length(Line.toLocal(down45, Vector.make(3, 4)))).toBeCloseTo(
      5,
    );
  });
});

describe('Line.toGlobal', () => {
  it('ist die Umkehrung von toLocal', () => {
    const v = Vector.make(2, -5);
    const back = Line.toGlobal(down45, Line.toLocal(down45, v));
    expect(back.dx).toBeCloseTo(v.dx);
    expect(back.dz).toBeCloseTo(v.dz);
  });

  it('lokale Querlast am 45°-Stab zeigt global nach links unten', () => {
    const global = Line.toGlobal(down45, Vector.make(0, 1));
    expect(global.dx).toBeCloseTo(-s);
    expect(global.dz).toBeCloseTo(s);
  });
});

describe('Line.parallel', () => {
  // Erbt den Drehsinn von normalVector, deshalb hier mitgeprüft.
  it('positiver Abstand verschiebt nach unten (+z)', () => {
    const offset = Line.parallel(horizontal, 2);
    expect(offset.p1.z).toBeCloseTo(2);
    expect(offset.p2.z).toBeCloseTo(2);
  });
});

describe('Line.direction / length', () => {
  it('zeigt vom Anfangs- zum Endknoten', () => {
    const d = Line.direction(down45);
    expect(d.dx).toBeCloseTo(s);
    expect(d.dz).toBeCloseTo(s);
  });

  it('3-4-5', () => {
    expect(Line.length(Line.make(origin, Point.make(3, 4)))).toBeCloseTo(5);
  });
});
