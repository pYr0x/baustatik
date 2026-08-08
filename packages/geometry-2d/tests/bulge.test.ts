import { describe, expect, it } from 'vitest';
import { Arc } from '../src/arc';
import { Bulge } from '../src/bulge';
import { DEFAULT_ARC_TOLERANCE } from '../src/constants';
import {
  FullCircleBulgeError,
  InvalidArcError,
  StraightBulgeError,
} from '../src/errors';
import { Point } from '../src/point';

/** Der Abstand eines Punktes von der Sehne — unabhängig gerechnet. */
function distanceToChord(p: Point, p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return (
    Math.abs(dy * (p.x - p1.x) - dx * (p.y - p1.y)) / Math.hypot(dx, dy)
  );
}

describe('Bulge.sweep und Bulge.fromArc kodieren denselben Öffnungswinkel', () => {
  it('Δ = 90° entspricht bulge = tan(22,5°) = 0,414214', () => {
    expect(Bulge.sweep(Math.SQRT2 - 1)).toBeCloseTo(Math.PI / 2, 12);
    expect(
      Bulge.fromArc(Arc.make(Point.make(0, 0), 1, 0, Math.PI / 2)),
    ).toBeCloseTo(Math.SQRT2 - 1, 12);
  });

  it('Δ = 180° entspricht bulge = 1', () => {
    expect(Bulge.sweep(1)).toBeCloseTo(Math.PI, 12);
    expect(Bulge.fromArc(Arc.make(Point.make(0, 0), 1, 0, Math.PI))).toBeCloseTo(
      1,
      12,
    );
  });

  it('das Vorzeichen trägt durch: Δ = −180° entspricht bulge = −1', () => {
    expect(Bulge.sweep(-1)).toBeCloseTo(-Math.PI, 12);
    expect(
      Bulge.fromArc(Arc.make(Point.make(0, 0), 1, 0, -Math.PI)),
    ).toBeCloseTo(-1, 12);
  });

  it('die Gerade ist bulge = 0', () => {
    expect(Bulge.sweep(0)).toBe(0);
  });
});

describe('Der Rundlauf Arc → bulge → Arc erhält den Bogen', () => {
  const sweeps = [
    Math.PI / 6,
    Math.PI / 2,
    (2 * Math.PI) / 3,
    Math.PI,
    (5 * Math.PI) / 4,
    (11 * Math.PI) / 6,
    -Math.PI / 6,
    -Math.PI / 2,
    -Math.PI,
    -(5 * Math.PI) / 4,
    -(11 * Math.PI) / 6,
  ];

  for (const sweep of sweeps) {
    it(`Sweep ${((sweep * 180) / Math.PI).toFixed(0)}° kehrt unverändert zurück`, () => {
      const arc = Arc.make(Point.make(3, -2), 7, 0.7, sweep);
      const bulge = Bulge.fromArc(arc);
      const back = Bulge.toArc(
        Arc.startPoint(arc),
        Arc.endPoint(arc),
        bulge,
        DEFAULT_ARC_TOLERANCE,
      );

      expect(back.center.x).toBeCloseTo(arc.center.x, 9);
      expect(back.center.y).toBeCloseTo(arc.center.y, 9);
      expect(back.radius).toBeCloseTo(arc.radius, 9);
      expect(back.startAngle).toBeCloseTo(arc.startAngle, 9);
      expect(back.sweep).toBeCloseTo(arc.sweep, 9);
    });
  }
});

describe('Der Halbkreis steht an BEIDEN Enden senkrecht auf der Sehne', () => {
  // Der Grund, warum Wellblech und Rohr ohne Knickwarnung durchgehen: bei
  // `Δ = ±180°` ist die Tangentialität am Stoss automatisch.
  it('bulge = 1 zwischen zwei Punkten', () => {
    const p1 = Point.make(-4, 1);
    const p2 = Point.make(2, 5);
    const arc = Bulge.toArc(p1, p2, 1, DEFAULT_ARC_TOLERANCE);
    const chord = { dx: p2.x - p1.x, dy: p2.y - p1.y };

    for (const angle of [arc.startAngle, arc.startAngle + arc.sweep]) {
      // Tangente = Radiusrichtung um +90° gedreht.
      const tangent = { dx: -Math.sin(angle), dy: Math.cos(angle) };
      expect(tangent.dx * chord.dx + tangent.dy * chord.dy).toBeCloseTo(0, 9);
    }
  });

  it('auch mit bulge = −1, nur andersherum gedreht', () => {
    const p1 = Point.make(-4, 1);
    const p2 = Point.make(2, 5);
    const arc = Bulge.toArc(p1, p2, -1, DEFAULT_ARC_TOLERANCE);
    const chord = { dx: p2.x - p1.x, dy: p2.y - p1.y };

    for (const angle of [arc.startAngle, arc.startAngle + arc.sweep]) {
      const tangent = { dx: -Math.sin(angle), dy: Math.cos(angle) };
      expect(tangent.dx * chord.dx + tangent.dy * chord.dy).toBeCloseTo(0, 9);
    }
  });
});

describe('Bulge.sagitta ist die Stichhöhe und nicht ihre Näherung', () => {
  for (const bulge of [0.1, Math.SQRT2 - 1, 0.9, 1, 1.7, -0.3, -1, -2.4]) {
    it(`bulge ${bulge} deckt sich mit dem Abstand des Bogenmittelpunkts von der Sehne`, () => {
      const p1 = Point.make(-4, 1);
      const p2 = Point.make(2, 5);
      const arc = Bulge.toArc(p1, p2, bulge, DEFAULT_ARC_TOLERANCE);

      expect(Bulge.sagitta(Point.distance(p1, p2), bulge)).toBeCloseTo(
        distanceToChord(Arc.midpoint(arc), p1, p2),
        9,
      );
    });
  }

  it('sie ist immer positiv — die Seite steht im Vorzeichen von bulge', () => {
    expect(Bulge.sagitta(10, -0.5)).toBe(2.5);
    expect(Bulge.sagitta(10, 0.5)).toBe(2.5);
  });
});

describe('Bulge.isStraight misst die Stichhöhe gegen die Toleranz, nicht bulge gegen ein Epsilon', () => {
  it('derselbe bulge ist auf kurzer Sehne gerade und auf langer krumm', () => {
    expect(Bulge.isStraight(5, 0.001, DEFAULT_ARC_TOLERANCE)).toBe(true);
    expect(Bulge.isStraight(2000, 0.001, DEFAULT_ARC_TOLERANCE)).toBe(false);
  });

  it('genau auf der Schranke gilt als gerade', () => {
    // h = (10/2)·0,01 = 0,05 = DEFAULT_ARC_TOLERANCE
    expect(Bulge.isStraight(10, 0.01, DEFAULT_ARC_TOLERANCE)).toBe(true);
  });
});

describe('Bulge.toPolyline ist TOTAL und bedient die Gerade mit', () => {
  it('eine gerade Kante ergibt genau die beiden Endpunkte', () => {
    const p1 = Point.make(0, 0);
    const p2 = Point.make(10, 0);

    expect(Bulge.toPolyline(p1, p2, 0, DEFAULT_ARC_TOLERANCE).points).toEqual([
      p1,
      p2,
    ]);
    expect(
      Bulge.toPolyline(p1, p2, 0.001, DEFAULT_ARC_TOLERANCE).points,
    ).toEqual([p1, p2]);
  });

  it('eine Bogenkante liefert dieselben Punkte wie Arc.toPolyline bei gleicher Toleranz', () => {
    const p1 = Point.make(-4, 1);
    const p2 = Point.make(2, 5);
    const bulge = 0.6;
    const arc = Bulge.toArc(p1, p2, bulge, DEFAULT_ARC_TOLERANCE);

    expect(
      Bulge.toPolyline(p1, p2, bulge, DEFAULT_ARC_TOLERANCE).points,
    ).toEqual(Arc.toPolyline(arc, { tolerance: DEFAULT_ARC_TOLERANCE }).points);
  });

  it('beide Endpunkte sind enthalten — der Verketter lässt selbst fallen', () => {
    const p1 = Point.make(-4, 1);
    const p2 = Point.make(2, 5);
    const { points } = Bulge.toPolyline(p1, p2, 0.6, DEFAULT_ARC_TOLERANCE);
    const last = points[points.length - 1];

    expect(points[0]?.x).toBeCloseTo(p1.x, 9);
    expect(points[0]?.y).toBeCloseTo(p1.y, 9);
    expect(last?.x).toBeCloseTo(p2.x, 9);
    expect(last?.y).toBeCloseTo(p2.y, 9);
  });
});

describe('Der Grenzfall Gerade WIRFT, statt undefined zu liefern', () => {
  it('StraightBulgeError trägt bulge, Sehnenlänge und Toleranz als Felder', () => {
    const p1 = Point.make(0, 0);
    const p2 = Point.make(10, 0);
    // h = 5·0,009 = 0,045 < 0,05
    expect(() => Bulge.toArc(p1, p2, 0.009, DEFAULT_ARC_TOLERANCE)).toThrow(
      StraightBulgeError,
    );

    try {
      Bulge.toArc(p1, p2, 0.009, DEFAULT_ARC_TOLERANCE);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(StraightBulgeError);
      const straight = error as StraightBulgeError;
      expect(straight.bulge).toBe(0.009);
      expect(straight.chordLength).toBeCloseTo(10, 12);
      expect(straight.tolerance).toBe(DEFAULT_ARC_TOLERANCE);
    }
  });

  it('knapp ÜBER der Schranke entsteht ein Bogen', () => {
    // h = 5·0,011 = 0,055 > 0,05
    expect(() =>
      Bulge.toArc(
        Point.make(0, 0),
        Point.make(10, 0),
        0.011,
        DEFAULT_ARC_TOLERANCE,
      ),
    ).not.toThrow();
  });

  it('eine Wand der Länge 0 ist ebenfalls keine Bogenkante', () => {
    expect(() =>
      Bulge.toArc(
        Point.make(3, 3),
        Point.make(3, 3),
        1,
        DEFAULT_ARC_TOLERANCE,
      ),
    ).toThrow(StraightBulgeError);
  });

  it('ein nicht endlicher bulge ist ein kaputter Satz, keine Gerade', () => {
    expect(() =>
      Bulge.toArc(
        Point.make(0, 0),
        Point.make(10, 0),
        Number.POSITIVE_INFINITY,
        DEFAULT_ARC_TOLERANCE,
      ),
    ).toThrow(InvalidArcError);
  });
});

describe('Der Vollkreis hat keine Wölbung', () => {
  it('|sweep| = 2π wirft FullCircleBulgeError mit dem sweep als Feld', () => {
    const arc = Arc.make(Point.make(0, 0), 1, 0, 2 * Math.PI);

    expect(() => Bulge.fromArc(arc)).toThrow(FullCircleBulgeError);
    try {
      Bulge.fromArc(arc);
      expect.unreachable();
    } catch (error) {
      expect((error as FullCircleBulgeError).sweep).toBe(2 * Math.PI);
    }
  });

  it('ein Rohr ist deshalb ZWEI Halbkreiswände und kein Vollkreis', () => {
    // Δ = ±180°, bulge = ±1 — beide Kanten bleiben im offenen Wertebereich.
    expect(
      Bulge.fromArc(Arc.make(Point.make(0, 0), 50, 0, Math.PI)),
    ).toBeCloseTo(1, 12);
    expect(
      Bulge.fromArc(Arc.make(Point.make(0, 0), 50, Math.PI, Math.PI)),
    ).toBeCloseTo(1, 12);
  });

  it('knapp unter dem Vollkreis geht durch', () => {
    expect(() =>
      Bulge.fromArc(Arc.make(Point.make(0, 0), 1, 0, 2 * Math.PI - 1e-9)),
    ).not.toThrow();
  });
});
