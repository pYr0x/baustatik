/**
 * Die ZUSAGEN AN DIE ABHÄNGIGKEIT — nicht an unsere Tür.
 *
 * Sie rufen `clipper2-ts` UNMITTELBAR auf und stehen deshalb neben
 * `inflate.test.ts`, das `Polygon.inflate` prüft. Der Grund ist ADR 0037: die
 * Umrisse des Querschnitts hängen an dem, was diese Bibliothek liefert, und die
 * Version ist EXAKT gepinnt. Ein Defekt oder eine geänderte Voreinstellung soll
 * damit in CI auffallen und nicht in einem Scratchpad, der die Sitzung nicht
 * überlebt.
 *
 * Der wichtigste Satz steht unten: dass ein geschlossener Zug unter
 * `EndType.Joined` den INNENRING mitliefert. Auf ihm steht der hohle Kasten.
 */

import { Clipper, ClipType, EndType, FillRule, JoinType, PolyTreeD } from 'clipper2-ts';
import { describe, expect, it } from 'vitest';
import { OFFSET_PRECISION } from '../src/constants';

type XY = readonly [number, number];

const path = (points: readonly XY[]) => points.map(([x, y]) => ({ x, y }));

const inflate = (
  paths: { x: number; y: number }[][],
  delta: number,
  endType: EndType,
  arcTolerance = 0.05,
  joinType = JoinType.Miter,
) =>
  Clipper.inflatePathsD(
    paths,
    delta,
    joinType,
    endType,
    2,
    OFFSET_PRECISION,
    arcTolerance,
  );

const areas = (paths: { x: number; y: number }[][]) =>
  paths.map((p) => Clipper.areaD(p));

const total = (paths: { x: number; y: number }[][]) =>
  areas(paths).reduce((sum, a) => sum + a, 0);

describe('clipper2-ts weitet einen offenen Zug beidseitig auf', () => {
  it('macht aus einer 100 langen Wand mit delta 5 ein Rechteck 100 x 10', () => {
    const result = inflate([path([[0, 0], [100, 0]])], 5, EndType.Butt);

    expect(result).toHaveLength(1);
    expect(total(result)).toBeCloseTo(1000, 9);
    const bounds = Clipper.getBoundsPathsD(result);
    expect(bounds.left).toBeCloseTo(0, 9);
    expect(bounds.right).toBeCloseTo(100, 9);
    expect(bounds.top).toBeCloseTo(-5, 9);
    expect(bounds.bottom).toBeCloseTo(5, 9);
  });

  it('setzt am rechtwinkligen Stoß die Miter-Ecke — sechs Punkte, A = 1600', () => {
    // Der Winkel der Demo: zwei Wände t = 8 über einen Grad-2-Knoten, als EIN
    // Zug hineingegeben. Genau darum weitet ADR 0037 den ZUG auf und nicht die
    // Wand: einzeln aufgeweitet und danach vereinigt bliebe hier eine Kerbe.
    const result = inflate([path([[0, 0], [100, 0], [100, -100]])], 4, EndType.Butt);

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(6);
    expect(total(result)).toBeCloseTo(1600, 9);
  });
});

describe('clipper2-ts weitet einen geschlossenen Ring nach außen und nach innen auf', () => {
  const square = path([[0, 0], [100, 0], [100, 100], [0, 100]]);

  it('vergrößert das Quadrat 100 mit delta +10 auf A = 14400', () => {
    const result = inflate([square], 10, EndType.Polygon);
    expect(total(result)).toBeCloseTo(14400, 9);
    const bounds = Clipper.getBoundsPathsD(result);
    expect([bounds.left, bounds.top, bounds.right, bounds.bottom]).toEqual([
      -10, -10, 110, 110,
    ]);
  });

  it('verkleinert es mit delta −10 auf A = 6400', () => {
    const result = inflate([square], -10, EndType.Polygon);
    expect(total(result)).toBeCloseTo(6400, 9);
    const bounds = Clipper.getBoundsPathsD(result);
    expect([bounds.left, bounds.top, bounds.right, bounds.bottom]).toEqual([
      10, 10, 90, 90,
    ]);
  });

  it('liefert bei umgekehrtem Umlaufsinn dieselben Beträge — nur negativ', () => {
    // Genau deshalb setzt `Polygon.inflate` den Umlaufsinn selbst, statt ihn
    // durchzureichen (ADR 0034, fortgeschrieben in ADR 0037).
    const reversed = [...square].reverse();
    expect(total(inflate([reversed], 10, EndType.Polygon))).toBeCloseTo(-14400, 9);
    expect(total(inflate([reversed], -10, EndType.Polygon))).toBeCloseTo(-6400, 9);
  });
});

describe('clipper2-ts liest die arcTolerance als Sehnenabweichung', () => {
  const square = path([[0, 0], [100, 0], [100, 100], [0, 100]]);

  // Die Reihe pinnt, dass eine ZEHNTELUNG der Toleranz die Punktzahl erhöht,
  // und mit welcher Konstante. `JoinType.Round` ist hier nur das Messmittel —
  // der Querschnitt selbst rundet nach ADR 0037 NIE eine Ecke ab.
  it.each([
    [0.5, 16],
    [0.05, 36],
    [0.005, 104],
  ])('zerlegt die vier Ecken bei arcTolerance %f in %i Punkte', (tol, points) => {
    const result = inflate([square], 10, EndType.Polygon, tol, JoinType.Round);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(points);
  });
});

describe('clipper2-ts liefert am geschlossenen Zug den Innenring mit', () => {
  // DER MESSPOSTEN aus ADR 0037. Fällt er, trägt die ganze Ableitung des
  // hohlen Kastens nicht mehr: dann müsste zweimal mit `EndType.Polygon`
  // aufgeweitet und subtrahiert werden.
  const loop = path([[0, 0], [100, 0], [100, 200], [0, 200], [0, 0]]);

  it('macht aus dem Rechteckumlauf 100 x 200 mit delta 3 einen Ringstreifen', () => {
    const result = inflate([loop], 3, EndType.Joined);

    expect(result).toHaveLength(2);
    // Außen 106 x 206, innen 94 x 194 — die Restfläche ist der Streifen.
    expect(total(result)).toBeCloseTo(106 * 206 - 94 * 194, 9);
    expect(Math.max(...areas(result))).toBeCloseTo(106 * 206, 9);
    expect(Math.min(...areas(result))).toBeCloseTo(-(94 * 194), 9);
  });

  it('meldet die Verschachtelung im PolyTreeD statt sie im Vorzeichen zu verstecken', () => {
    const tree = new PolyTreeD();
    Clipper.booleanOpDWithPolyTree(
      ClipType.Union,
      inflate([loop], 3, EndType.Joined),
      null,
      tree,
      FillRule.NonZero,
      OFFSET_PRECISION,
    );

    expect(tree.count).toBe(1);
    const outer = tree.child(0);
    expect(outer.isHole).toBe(false);
    expect(outer.count).toBe(1);
    expect(outer.child(0).isHole).toBe(true);
  });
});
