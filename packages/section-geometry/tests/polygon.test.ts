import { describe, expect, it } from 'vitest';
import {
  DiscontinuousLinesError,
  InvalidPolygonError,
  Line,
  Point,
  Polygon,
  Vector,
} from '../src';

const rect = [
  Point.make(0, 0),
  Point.make(4, 0),
  Point.make(4, 3),
  Point.make(0, 3),
];

describe('Polygon.make and signedArea', () => {
  it('throws for fewer than 3 points', () => {
    expect(() => Polygon.make([Point.make(0, 0), Point.make(1, 0)])).toThrow(
      InvalidPolygonError,
    );
  });

  // ADR 0034: der positive Drehsinn (+y → +z) IST counter-clockwise, in beiden
  // Packages dasselbe Wort. `isClockwise` ist deshalb `true` genau für
  // `signedArea < 0` — dasselbe Beispiel wie in geometry-2d/tests/polygon.test.ts.
  it('nennt signedArea > 0 counter-clockwise, wie geometry-2d', () => {
    const counterClockwise = [
      Point.make(0, 0),
      Point.make(1, 0),
      Point.make(1, 1),
      Point.make(0, 1),
    ];
    const clockwise = [...counterClockwise].reverse();
    expect(Polygon.signedArea(counterClockwise)).toBeGreaterThan(0);
    expect(Polygon.signedArea(clockwise)).toBeLessThan(0);
    expect(Polygon.isClockwise({ points: counterClockwise })).toBe(false);
    expect(Polygon.isClockwise({ points: clockwise })).toBe(true);
  });

  // ADR 0034: die Fabrik prüft, sie dreht nicht — sonst wäre ein Lochring
  // (`signedArea < 0`) gar nicht baubar.
  it('gibt die Punkte unverändert zurück, in beiden Windungen', () => {
    const clockwise = [
      Point.make(0, 1),
      Point.make(1, 1),
      Point.make(1, 0),
      Point.make(0, 0),
    ];
    const snapshot = [...clockwise];
    const polygon = Polygon.make(clockwise);
    expect(polygon.points).toEqual(clockwise);
    expect(Polygon.signedArea(polygon.points)).toBeLessThan(0);
    expect(clockwise).toEqual(snapshot);

    const counterClockwise = [...clockwise].reverse();
    expect(Polygon.make(counterClockwise).points).toEqual(counterClockwise);
  });
});

describe('Polygon.moments trägt die Flächenmomente unter den Symbolen der Norm', () => {
  // Rechteck 4x3, Ecke im Ursprung, y nach rechts und z nach unten:
  // A = 12, Sy = ∫y dA = 12·2 = 24, Sz = 12·1,5 = 18,
  // Iy = ∫z² dA = 4·3³/3 = 36, Iz = ∫y² dA = 3·4³/3 = 64,
  // Iyz = ∫y·z dA = (4²/2)·(3²/2) = 36.
  it('rechnet sie roh um den Ursprung, mit `Iyz = +∫y·z dA` und ohne Negation', () => {
    const m = Polygon.moments(rect);
    expect(m.A).toBeCloseTo(12);
    expect(m.Sy).toBeCloseTo(24);
    expect(m.Sz).toBeCloseTo(18);
    expect(m.Iy).toBeCloseTo(36);
    expect(m.Iz).toBeCloseTo(64);
    expect(m.Iyz).toBeCloseTo(36);
  });

  it('kehrt mit der Windung alle Vorzeichen um — das Loch trägt sich selbst bei', () => {
    const material = Polygon.moments(rect);
    const hole = Polygon.moments([...rect].reverse());
    expect(hole.A).toBeCloseTo(-material.A);
    expect(hole.Iy).toBeCloseTo(-material.Iy);
    expect(hole.Iyz).toBeCloseTo(-material.Iyz);
  });

  it('stimmt in A mit signedArea überein', () => {
    expect(Polygon.moments(rect).A).toBeCloseTo(Polygon.signedArea(rect));
  });
});

describe('Polygon scalar and point operations', () => {
  it('computes area, centroid and perimeter', () => {
    const polygon = Polygon.make(rect);
    expect(Polygon.area(polygon)).toBeCloseTo(12);
    expect(Polygon.area(polygon)).toBeGreaterThanOrEqual(0);
    const centroid = Polygon.centroid(polygon);
    expect(centroid.y).toBeCloseTo(2);
    expect(centroid.z).toBeCloseTo(1.5);
    expect(Polygon.perimeter(polygon)).toBeCloseTo(14);
  });

  it('checks containment', () => {
    const polygon = Polygon.make(rect);
    expect(Polygon.contains(polygon, Point.make(2, 1.5))).toBe(true);
    expect(Polygon.contains(polygon, Point.make(5, 5))).toBe(false);
  });
});

describe('Polygon winding helpers', () => {
  it('toClockwise and toCounterClockwise behave as expected', () => {
    const poly = Polygon.make([
      Point.make(0, 0),
      Point.make(0, 3),
      Point.make(4, 3),
      Point.make(4, 0),
    ]);
    const clockwise = Polygon.toClockwise(poly);
    expect(Polygon.isClockwise(clockwise)).toBe(true);

    const counterClockwise = Polygon.toCounterClockwise(clockwise);
    expect(Polygon.isClockwise(counterClockwise)).toBe(false);
  });
});

describe('Polygon construction and boolean ops', () => {
  it('creates polygon from line loop and validates input', () => {
    const lines = [
      Line.make(Point.make(0, 0), Point.make(4, 0)),
      Line.make(Point.make(4, 0), Point.make(4, 3)),
      Line.make(Point.make(4, 3), Point.make(0, 3)),
      Line.make(Point.make(0, 3), Point.make(0, 0)),
    ];
    const polygon = Polygon.fromLines(lines);
    expect(Polygon.area(polygon)).toBeCloseTo(12);

    expect(() => Polygon.fromLines(lines.slice(0, 2))).toThrow(InvalidPolygonError);

    const disconnected = [
      Line.make(Point.make(0, 0), Point.make(1, 0)),
      Line.make(Point.make(5, 0), Point.make(5, 1)),
      Line.make(Point.make(5, 1), Point.make(0, 0)),
    ];
    expect(() => Polygon.fromLines(disconnected)).toThrow(DiscontinuousLinesError);
  });

  it('supports intersect/union/subtract and normalizes outputs to YZ-counter-clockwise', () => {
    const a = Polygon.make([
      Point.make(0, 0),
      Point.make(4, 0),
      Point.make(4, 4),
      Point.make(0, 4),
    ]);
    const b = Polygon.make([
      Point.make(2, 0),
      Point.make(6, 0),
      Point.make(6, 4),
      Point.make(2, 4),
    ]);

    // Die Zusage hängt seit ADR 0034 nicht mehr an `Polygon.make`, sondern an
    // der martinez-Grenze in geometry-2d — sie gilt trotzdem weiter.
    const positivelyWound = (polygon: { points: Point[] }) =>
      Polygon.signedArea(polygon.points) >= 0;

    const intersection = Polygon.intersect(a, b);
    expect(intersection.length).toBeGreaterThan(0);
    expect(intersection.every(positivelyWound)).toBe(true);

    const union = Polygon.union(a, b);
    expect(union.length).toBeGreaterThan(0);
    expect(union.every(positivelyWound)).toBe(true);

    const subtraction = Polygon.subtract(a, b);
    expect(subtraction.length).toBeGreaterThan(0);
    expect(subtraction.every(positivelyWound)).toBe(true);

    expect(Polygon.intersect(a, Polygon.translate(b, Vector.make(100, 0)))).toEqual([]);
    expect(Polygon.subtract(a, a)).toEqual([]);
  });
});

describe('Polygon transforms and bounding box', () => {
  it('computes bounding box with ordered min/max', () => {
    const boundingBox = Polygon.boundingBox(Polygon.make(rect));
    expect(boundingBox.min.y).toBe(0);
    expect(boundingBox.min.z).toBe(0);
    expect(boundingBox.max.y).toBe(4);
    expect(boundingBox.max.z).toBe(3);
  });

  it('translates, rotates and mirrors while preserving winding policy', () => {
    const polygon = Polygon.make(rect);
    // Ueber die Bounding-Box geprueft statt ueber points[0]: welche Ecke der
    // Ring zuerst nennt, haengt an der Normalisierung und ist keine Zusage.
    const translated = Polygon.translate(polygon, Vector.make(1, 1));
    const box = Polygon.boundingBox(translated);
    expect(box.min).toEqual({ y: 1, z: 1 });
    expect(box.max).toEqual({ y: 5, z: 4 });

    const rotated = Polygon.rotate(polygon, Math.PI / 2, Point.make(0, 0));
    expect(Polygon.area(rotated)).toBeCloseTo(12); // area is rotation-invariant

    // Spiegeln KEHRT die Windung UM (ADR 0034) — nichts dreht sie zurück.
    const mirrored = Polygon.mirror(polygon, Point.make(0, 0), Point.make(1, 0));
    expect(Polygon.signedArea(polygon.points)).toBeGreaterThan(0);
    expect(Polygon.signedArea(mirrored.points)).toBeLessThan(0);
    expect(Polygon.area(mirrored)).toBeCloseTo(12);
  });
});

describe('Polygon.inflate reicht die Aufweitung nach y/z durch', () => {
  it('macht aus einer Wand der Laenge 100 mit delta 5 einen Materialring', () => {
    const [ring, ...rest] = Polygon.inflate([
      {
        polyline: { points: [Point.make(0, 0), Point.make(100, 0)] },
        delta: 5,
        endType: 'butt',
      },
    ]);

    expect(rest).toHaveLength(0);
    expect(ring).toBeDefined();
    // Die Windungsregel reist unveraendert mit: Material laeuft positiv
    // (ADR 0034, fortgeschrieben in ADR 0037).
    expect(Polygon.signedArea(ring?.points ?? [])).toBeCloseTo(1000, 9);
    const box = Polygon.boundingBox(Polygon.make(ring?.points ?? []));
    expect(box.min).toEqual({ y: 0, z: -5 });
    expect(box.max).toEqual({ y: 100, z: 5 });
  });

  it('liefert am geschlossenen Zug das Loch mit — negativ und hinter seinem Ring', () => {
    const rings = Polygon.inflate([
      {
        polyline: {
          points: [
            Point.make(0, 0),
            Point.make(100, 0),
            Point.make(100, 200),
            Point.make(0, 200),
            Point.make(0, 0),
          ],
        },
        delta: 3,
        endType: 'joined',
      },
    ]);

    expect(rings).toHaveLength(2);
    expect(Polygon.signedArea(rings[0]?.points ?? [])).toBeCloseTo(106 * 206, 9);
    expect(Polygon.signedArea(rings[1]?.points ?? [])).toBeCloseTo(-(94 * 194), 9);
  });
});
