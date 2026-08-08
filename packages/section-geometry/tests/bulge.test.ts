import { describe, expect, it } from 'vitest';
import {
  Arc,
  Bulge,
  DEFAULT_ARC_TOLERANCE,
  FullCircleBulgeError,
  Point,
  StraightBulgeError,
} from '../src';

/** Der Abstand eines Punktes von der Sehne — unabhängig gerechnet, in y/z. */
function distanceToChord(
  p: { y: number; z: number },
  p1: { y: number; z: number },
  p2: { y: number; z: number },
): number {
  const dy = p2.y - p1.y;
  const dz = p2.z - p1.z;
  return Math.abs(dz * (p.y - p1.y) - dy * (p.z - p1.z)) / Math.hypot(dy, dz);
}

describe('Bulge kodiert den Öffnungswinkel in beide Richtungen', () => {
  it('Δ = 90° entspricht bulge = 0,414214', () => {
    expect(Bulge.sweep(Math.SQRT2 - 1)).toBeCloseTo(Math.PI / 2, 12);
    expect(
      Bulge.fromArc(Arc.make(Point.make(0, 0), 1, 0, Math.PI / 2)),
    ).toBeCloseTo(Math.SQRT2 - 1, 12);
  });

  it('Δ = 180° entspricht bulge = 1, Δ = −180° entspricht bulge = −1', () => {
    expect(Bulge.sweep(1)).toBeCloseTo(Math.PI, 12);
    expect(Bulge.sweep(-1)).toBeCloseTo(-Math.PI, 12);
    expect(Bulge.fromArc(Arc.make(Point.make(0, 0), 1, 0, Math.PI))).toBeCloseTo(
      1,
      12,
    );
    expect(
      Bulge.fromArc(Arc.make(Point.make(0, 0), 1, 0, -Math.PI)),
    ).toBeCloseTo(-1, 12);
  });
});

describe('Der Drehsinn trägt ohne Vorzeichenwechsel durch die Durchreiche', () => {
  // convert.ts ist orientierungstreu: positiv dreht in y/z von +y nach +z, im
  // Bild (y rechts, z runter) also rechtsdrehend. Die Sehne läuft hier nach
  // +y; der Bogen weicht damit nach −z aus, weil ein Umlauf, der am linken
  // Scheitel beginnt und positiv dreht, ZUERST auf die −z-Seite geht.
  it('ein positiver bulge legt den Halbkreis auf die −z-Seite der +y-Sehne', () => {
    const arc = Bulge.toArc(
      Point.make(0, 0),
      Point.make(100, 0),
      1,
      DEFAULT_ARC_TOLERANCE,
    );

    expect(arc.center.y).toBeCloseTo(50, 9);
    expect(arc.center.z).toBeCloseTo(0, 9);
    expect(arc.sweep).toBeCloseTo(Math.PI, 9);
    expect(Arc.midpoint(arc).z).toBeCloseTo(-50, 9);
  });

  it('ein negativer bulge spiegelt ihn auf die +z-Seite', () => {
    const arc = Bulge.toArc(
      Point.make(0, 0),
      Point.make(100, 0),
      -1,
      DEFAULT_ARC_TOLERANCE,
    );

    expect(arc.sweep).toBeCloseTo(-Math.PI, 9);
    expect(Arc.midpoint(arc).z).toBeCloseTo(50, 9);
  });
});

describe('Der Rundlauf Arc → bulge → Arc erhält den Bogen', () => {
  for (const sweep of [
    Math.PI / 2,
    Math.PI,
    (5 * Math.PI) / 4,
    -Math.PI / 2,
    -Math.PI,
    -(5 * Math.PI) / 4,
  ]) {
    it(`Sweep ${((sweep * 180) / Math.PI).toFixed(0)}° kehrt unverändert zurück`, () => {
      const arc = Arc.make(Point.make(30, -20), 70, 0.7, sweep);
      const back = Bulge.toArc(
        Arc.startPoint(arc),
        Arc.endPoint(arc),
        Bulge.fromArc(arc),
        DEFAULT_ARC_TOLERANCE,
      );

      expect(back.center.y).toBeCloseTo(arc.center.y, 8);
      expect(back.center.z).toBeCloseTo(arc.center.z, 8);
      expect(back.radius).toBeCloseTo(arc.radius, 8);
      expect(back.startAngle).toBeCloseTo(arc.startAngle, 8);
      expect(back.sweep).toBeCloseTo(arc.sweep, 8);
    });
  }
});

describe('Der Halbkreis steht an BEIDEN Enden senkrecht auf der Sehne', () => {
  for (const bulge of [1, -1]) {
    it(`bulge = ${bulge} — der Grund, warum Rohr und Wellblech ohne Knickwarnung durchgehen`, () => {
      const p1 = Point.make(-40, 10);
      const p2 = Point.make(20, 50);
      const arc = Bulge.toArc(p1, p2, bulge, DEFAULT_ARC_TOLERANCE);
      const chord = { dy: p2.y - p1.y, dz: p2.z - p1.z };

      for (const angle of [arc.startAngle, arc.startAngle + arc.sweep]) {
        const tangent = { dy: -Math.sin(angle), dz: Math.cos(angle) };
        expect(tangent.dy * chord.dy + tangent.dz * chord.dz).toBeCloseTo(0, 8);
      }
    });
  }
});

describe('Bulge.sagitta ist die Stichhöhe und nicht ihre Näherung', () => {
  for (const bulge of [0.1, Math.SQRT2 - 1, 1, 1.7, -0.3, -2.4]) {
    it(`bulge ${bulge} deckt sich mit dem Abstand des Bogenmittelpunkts von der Sehne`, () => {
      const p1 = Point.make(-40, 10);
      const p2 = Point.make(20, 50);
      const arc = Bulge.toArc(p1, p2, bulge, DEFAULT_ARC_TOLERANCE);

      expect(Bulge.sagitta(Point.distance(p1, p2), bulge)).toBeCloseTo(
        distanceToChord(Arc.midpoint(arc), p1, p2),
        8,
      );
    });
  }
});

describe('Bulge.isStraight misst die Stichhöhe gegen die Toleranz', () => {
  it('derselbe bulge ist auf kurzer Sehne gerade und auf langer krumm', () => {
    expect(Bulge.isStraight(5, 0.001, DEFAULT_ARC_TOLERANCE)).toBe(true);
    expect(Bulge.isStraight(2000, 0.001, DEFAULT_ARC_TOLERANCE)).toBe(false);
  });
});

describe('Bulge.toPolyline ist TOTAL und führt beide Endpunkte', () => {
  it('eine gerade Kante ergibt genau die beiden Endpunkte', () => {
    const p1 = Point.make(0, 0);
    const p2 = Point.make(100, 0);
    expect(Bulge.toPolyline(p1, p2, 0, DEFAULT_ARC_TOLERANCE).points).toEqual([
      p1,
      p2,
    ]);
  });

  it('eine Bogenkante liefert dieselben Punkte wie Arc.toPolyline', () => {
    const p1 = Point.make(-40, 10);
    const p2 = Point.make(20, 50);
    const arc = Bulge.toArc(p1, p2, 0.6, DEFAULT_ARC_TOLERANCE);

    expect(Bulge.toPolyline(p1, p2, 0.6, DEFAULT_ARC_TOLERANCE).points).toEqual(
      Arc.toPolyline(arc, { tolerance: DEFAULT_ARC_TOLERANCE }).points,
    );
  });
});

describe('Die beiden Fehlerklassen reisen mit durch die Durchreiche', () => {
  it('StraightBulgeError trägt bulge, Sehnenlänge und Toleranz', () => {
    try {
      Bulge.toArc(
        Point.make(0, 0),
        Point.make(10, 0),
        0.009,
        DEFAULT_ARC_TOLERANCE,
      );
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(StraightBulgeError);
      const straight = error as StraightBulgeError;
      expect(straight.bulge).toBe(0.009);
      expect(straight.chordLength).toBeCloseTo(10, 12);
      expect(straight.tolerance).toBe(DEFAULT_ARC_TOLERANCE);
    }
  });

  it('FullCircleBulgeError trägt den sweep', () => {
    try {
      Bulge.fromArc(Arc.make(Point.make(0, 0), 1, 0, 2 * Math.PI));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(FullCircleBulgeError);
      expect((error as FullCircleBulgeError).sweep).toBe(2 * Math.PI);
    }
  });
});
