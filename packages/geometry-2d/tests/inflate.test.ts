/**
 * `Polygon.inflate` — die Tür, hinter der Clipper2 steht.
 *
 * Was die BIBLIOTHEK zusagt, prüft `clipper2.test.ts`. Hier steht, was DIESES
 * Package darüber hinaus zusagt: eine Ringmenge mit Löchern, deren Umlaufsinn
 * GESETZT und deren Reihenfolge SORTIERT ist (ADR 0037).
 */

import { describe, expect, it } from 'vitest';
import { Point } from '../src/point';
import { Polygon } from '../src/polygon';

type XY = readonly [number, number];

const line = (points: readonly XY[]) => ({
  points: points.map(([x, y]) => Point.make(x, y)),
});

const open = (points: readonly XY[], delta: number) => ({
  polyline: line(points),
  delta,
  endType: 'butt' as const,
});

const closed = (points: readonly XY[], delta: number) => ({
  polyline: line(points),
  delta,
  endType: 'joined' as const,
});

const signedAreas = (rings: readonly Polygon[]) =>
  rings.map((ring) => Polygon.moments(ring.points).A);

describe('Polygon.inflate weitet offene Züge auf', () => {
  it('macht aus einer 100 langen Wand mit delta 5 einen Materialring von 1000', () => {
    const [ring, ...rest] = Polygon.inflate([open([[0, 0], [100, 0]], 5)]);

    expect(rest).toHaveLength(0);
    expect(ring).toBeDefined();
    expect(Polygon.moments(ring?.points ?? []).A).toBeCloseTo(1000, 9);
  });

  it('vereinigt zwei Züge verschiedener Dicke in EINEM Aufruf', () => {
    // Ein T aus zwei Zügen: der Gurt 100 lang mit t = 10, der Steg 50 lang mit
    // t = 6, beide über denselben Punkt. Clipper2 nimmt nur EIN delta je
    // Aufruf (ADR 0037) — die Vereinigung leistet diese Tür.
    const rings = Polygon.inflate([
      open([[-50, 0], [50, 0]], 5),
      open([[0, 0], [0, 50]], 3),
    ]);

    expect(rings).toHaveLength(1);
    // Gurt 100 x 10, Steg 6 x 45 oberhalb des Gurtes — sie ueberlappen sich
    // im Gurt und werden nicht doppelt gezaehlt.
    expect(signedAreas(rings)[0]).toBeCloseTo(1000 + 6 * 45, 9);
  });

  it('gibt für eine leere Eingabe eine leere Ringmenge zurück', () => {
    expect(Polygon.inflate([])).toEqual([]);
  });
});

describe('Polygon.inflate weitet einen geschlossenen Zug zum Ring mit Loch auf', () => {
  const loop: readonly XY[] = [[0, 0], [100, 0], [100, 200], [0, 200], [0, 0]];

  it('liefert Aussenring und Loch — der Aussenring positiv, das Loch negativ', () => {
    const rings = Polygon.inflate([closed(loop, 3)]);

    expect(rings).toHaveLength(2);
    const [outer, hole] = signedAreas(rings);
    expect(outer).toBeCloseTo(106 * 206, 9);
    expect(hole).toBeCloseTo(-(94 * 194), 9);
  });

  it('stellt das Loch UNMITTELBAR hinter seinen Aussenring', () => {
    // Zwei getrennte Kaesten, der kleinere zuerst hineingegeben: sortiert
    // wird nach |A| absteigend, und das Loch folgt seinem eigenen Ring — nicht
    // dem groesseren.
    const small: readonly XY[] = [[0, 0], [40, 0], [40, 40], [0, 40], [0, 0]];
    const large: readonly XY[] = [
      [200, 0],
      [400, 0],
      [400, 300],
      [200, 300],
      [200, 0],
    ];
    const rings = Polygon.inflate([closed(small, 2), closed(large, 2)]);

    expect(signedAreas(rings).map((A) => Math.sign(A))).toEqual([1, -1, 1, -1]);
    expect(signedAreas(rings)[0]).toBeCloseTo(204 * 304, 9);
    expect(signedAreas(rings)[1]).toBeCloseTo(-(196 * 296), 9);
    expect(signedAreas(rings)[2]).toBeCloseTo(44 * 44, 9);
    expect(signedAreas(rings)[3]).toBeCloseTo(-(36 * 36), 9);
  });
});

describe('Polygon.inflate setzt den Umlaufsinn, statt ihn durchzureichen', () => {
  it('liefert zwei getrennte Vollflächen beide positiv und nach |A| absteigend', () => {
    const rings = Polygon.inflate([
      open([[0, 0], [10, 0]], 1),
      open([[100, 0], [200, 0]], 5),
    ]);

    expect(signedAreas(rings)).toHaveLength(2);
    expect(signedAreas(rings)[0]).toBeCloseTo(1000, 9);
    expect(signedAreas(rings)[1]).toBeCloseTo(20, 9);
  });

  it('antwortet auf den umgekehrt gezeichneten Zug identisch', () => {
    // Der Umlaufsinn der EINGABE trägt hier keine Bedeutung: aufgeweitet wird
    // beidseitig um `delta`, und was Material ist, entscheidet die
    // Verschachtelung — nicht das Vorzeichen, das Clipper2 zurückgibt.
    const forward = Polygon.inflate([closed([[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]], 5)]);
    const backward = Polygon.inflate([closed([[0, 0], [0, 100], [100, 100], [100, 0], [0, 0]], 5)]);

    expect(signedAreas(forward)[0]).toBeCloseTo(signedAreas(backward)[0] ?? 0, 9);
    expect(signedAreas(forward)[1]).toBeCloseTo(signedAreas(backward)[1] ?? 0, 9);
    expect(signedAreas(forward)[0]).toBeGreaterThan(0);
    expect(signedAreas(forward)[1]).toBeLessThan(0);
  });
});

describe('Polygon.inflate liest die Optionen', () => {
  it('kappt den spitzen Stoss, sobald das miterLimit unterschritten wird', () => {
    // Zwei Waende unter 20°: mit grosszuegigem Limit steht die Spitze, mit dem
    // Vorgabewert 2 ist sie gekappt und die Flaeche damit kleiner.
    const spike: readonly XY[] = [[0, 0], [100, 0], [0, 35]];
    const sharp = Polygon.inflate([open(spike, 4)], { miterLimit: 100 });
    const capped = Polygon.inflate([open(spike, 4)], { miterLimit: 2 });

    expect(signedAreas(sharp)[0]).toBeGreaterThan(signedAreas(capped)[0] ?? 0);
  });
});
