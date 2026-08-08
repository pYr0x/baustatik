import { describe, expect, it } from 'vitest';
import { Arc, Point, Polygon, Vector } from '../src';

// Diese Datei nagelt den Drehsinn des Packages fest: **eine positive Drehung
// fuehrt +y auf +z**. Im Bild (y rechts, z abwaerts) ist das rechtsdrehend.
//
// Alle rotationsbehafteten Operationen delegieren an geometry-2d und stimmen
// nur, solange `src/convert.ts` orientierungstreu abbildet (x := y, y := z,
// ohne Vorzeichenwechsel). Eine Spiegelung dort konjugiert jede Drehung in ihre
// Umkehrung (M·P·M = P⁻¹) und dreht jede einzelne Erwartung hier um — genau das
// war der fruehere Stand, und er stand im Widerspruch zu den nativ in y/z
// gerechneten `Vector.cross` und `Polygon.signedArea`.
describe('Drehsinn: positive Drehung fuehrt +y auf +z', () => {
  const right = Vector.make(1, 0);

  it('Arc mit positivem Sweep laeuft von +y nach +z', () => {
    const arc = Arc.fromCenter(Point.make(0, 0), 1, 0, Math.PI / 2);
    expect(Arc.startPoint(arc).y).toBeCloseTo(1);
    expect(Arc.midpoint(arc).z).toBeGreaterThan(0);
    expect(Arc.endPoint(arc).z).toBeCloseTo(1);
  });

  it('rotate, perpendicular und angle stimmen ueberein', () => {
    expect(Vector.rotate(right, Math.PI / 2).dz).toBeCloseTo(1);
    expect(Vector.perpendicular(right).dz).toBeCloseTo(1);
    expect(Vector.angle(Vector.make(0, 1))).toBeCloseTo(Math.PI / 2);
  });

  it('cross ist positiv fuer eine positive Drehung', () => {
    expect(Vector.cross(right, Vector.rotate(right, Math.PI / 2))).toBeCloseTo(
      1,
    );
  });

  // signedArea wird nativ in y/z gerechnet und ist von der Abbildung gar nicht
  // betroffen — der Test steht hier, weil er zeigt, dass die Windungsregel mit
  // dem Drehsinn oben zusammenpasst statt ihm zu widersprechen.
  it('signedArea ist positiv fuer einen Umlauf im positiven Drehsinn', () => {
    const inPositiveSense = [
      Point.make(1, 0),
      Point.make(0, 1),
      Point.make(-1, 0),
      Point.make(0, -1),
    ];
    expect(Polygon.signedArea(inPositiveSense)).toBeGreaterThan(0);
    expect(Polygon.signedArea([...inPositiveSense].reverse())).toBeLessThan(0);
  });

  // Der Ring läuft +y → +z → −y → −z, also im positiven Drehsinn. Seit ADR
  // 0034 dreht `Polygon.make` nichts mehr zurecht — beide Windungen kommen
  // unverändert heraus, und `isClockwise` nennt den positiven Sinn
  // counter-clockwise, genau wie geometry-2d.
  it('Polygon.make lässt beide Windungen stehen, isClockwise liest sie mathematisch', () => {
    const inPositiveSense = [
      Point.make(1, 0),
      Point.make(0, 1),
      Point.make(-1, 0),
      Point.make(0, -1),
    ];
    const reversed = [...inPositiveSense].reverse();

    expect(Polygon.make(inPositiveSense).points).toEqual(inPositiveSense);
    expect(Polygon.make(reversed).points).toEqual(reversed);

    expect(Polygon.isClockwise(Polygon.make(inPositiveSense))).toBe(false);
    expect(Polygon.isClockwise(Polygon.make(reversed))).toBe(true);
  });
});
