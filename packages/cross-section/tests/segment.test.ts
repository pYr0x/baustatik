import { describe, expect, it } from 'vitest';
import { DEFAULT_SECTION_POLICY } from '../src/index';
import {
  scaleSegments,
  segments,
} from '../src/calculation/wall-path/segments';
import { wallMoments } from '../src/calculation/wall-path/wall-moments';
import { iGraph, node, wall } from './helpers';

/**
 * Das POSITIONIERTE Wegstück (ADR 0040) — Startpunkt, Richtung, Länge, `t`.
 *
 * Der Typ trägt KEIN `S`: `Sy` und `Sz` sind zwei verschieden parametrisierte
 * Läufe über dieselbe Geometrie, und eine Figur soll dafür EINE Liste haben
 * und nicht zwei. Was hier geprüft wird, ist deshalb Geometrie und nichts
 * sonst.
 */

const POLICY = DEFAULT_SECTION_POLICY;

describe('segments legt die Läufe lagerichtig hin', () => {
  it('eine gerade Wand ergibt EIN Stück, vom ersten zum letzten Knoten', () => {
    const runs = segments(
      [node('a', 0, 0), node('b', 300, 400)],
      [wall('w', 'a', 'b', 10)],
      POLICY,
    );

    expect(runs).toHaveLength(1);
    expect(runs[0]?.segments).toEqual([
      {
        y: 0,
        z: 0,
        dy: 0.6,
        dz: 0.8,
        length: 500,
        t: 10,
        wallId: 'w',
      },
    ]);
  });

  it('dreht eine Wand um, die GEGEN ihre Richtung durchlaufen wird', () => {
    // `branches` läuft von den freien Enden; hier hängt das freie Ende am
    // ENDknoten der Wand.
    const runs = segments(
      [node('a', 0, 0), node('b', 100, 0), node('c', 100, 100)],
      // `w2` zeigt auf `b` zurück, wird aber von `b` aus durchlaufen.
      [wall('w1', 'b', 'a'), wall('w2', 'c', 'b')],
      POLICY,
    );

    const all = runs.flatMap((run) => [...run.segments]);
    // Der Lauf beginnt an einem freien Ende und ist durchgehend gerichtet:
    // das Ende eines Stücks ist der Anfang des nächsten.
    for (let i = 0; i + 1 < all.length; i++) {
      const from = all[i];
      const to = all[i + 1];
      expect((from?.y ?? 0) + (from?.dy ?? 0) * (from?.length ?? 0)).toBeCloseTo(
        to?.y ?? 0,
        9,
      );
      expect((from?.z ?? 0) + (from?.dz ?? 0) * (from?.length ?? 0)).toBeCloseTo(
        to?.z ?? 0,
        9,
      );
    }
  });

  it('löst eine Bogenwand unter `discretisationTolerance` in gerade Stücke auf', () => {
    // Ein Halbkreis (`bulge = 1`, also `Δ = π`) über einer Sehne von 200 mm:
    // Radius 100, Bogenlänge `π·100`.
    const runs = segments(
      [node('a', -100, 0), node('b', 100, 0)],
      [wall('bogen', 'a', 'b', 6, 1)],
      POLICY,
    );

    const pieces = runs.flatMap((run) => [...run.segments]);
    expect(pieces.length).toBeGreaterThan(2);
    // Jedes Stück ist gerade und der Sehnenzug bleibt knapp unter dem Bogen.
    const length = pieces.reduce((sum, piece) => sum + piece.length, 0);
    expect(length).toBeGreaterThan(Math.PI * 100 * 0.999);
    expect(length).toBeLessThan(Math.PI * 100);
    for (const piece of pieces) {
      expect(Math.hypot(piece.dy, piece.dz)).toBeCloseTo(1, 12);
      expect(piece.t).toBe(6);
      expect(piece.wallId).toBe('bogen');
    }
  });

  it('bleibt total: hängende Verweise und Nulllängenwände fallen weg', () => {
    const runs = segments(
      [node('a', 0, 0), node('b', 100, 0), node('c', 100, 0)],
      [
        wall('gut', 'a', 'b'),
        wall('haengt', 'b', 'gibt-es-nicht'),
        wall('null-lang', 'b', 'c'),
      ],
      POLICY,
    );

    expect(runs.flatMap((run) => run.segments.map((it) => it.wallId))).toEqual([
      'gut',
    ]);
  });
});

describe('Was das Package verlässt, ist eingefroren', () => {
  it('Liste, Lauf und Stück — nach `segments` wie nach `scaleSegments`', () => {
    const runs = segments(
      [node('a', 0, 0), node('b', 100, 0)],
      [wall('w', 'a', 'b', 8)],
      POLICY,
    );

    for (const set of [runs, scaleSegments(runs, 0.1)]) {
      expect(Object.isFrozen(set)).toBe(true);
      expect(Object.isFrozen(set[0])).toBe(true);
      expect(Object.isFrozen(set[0]?.branch)).toBe(true);
      expect(Object.isFrozen(set[0]?.segments)).toBe(true);
      expect(Object.isFrozen(set[0]?.segments[0])).toBe(true);
    }
  });
});

describe('scaleSegments wechselt den Massstab an EINER Stelle', () => {
  it('skaliert Punkt, Länge und Dicke — die Richtung bleibt', () => {
    const runs = segments(
      [node('a', 0, 0), node('b', 100, 0)],
      [wall('w', 'a', 'b', 8)],
      POLICY,
    );
    const scaled = scaleSegments(runs, 0.1);

    expect(scaled[0]?.segments[0]).toEqual({
      y: 0,
      z: 0,
      dy: 1,
      dz: 0,
      length: 10,
      t: 0.8,
      wallId: 'w',
    });
  });
});

describe('wallMoments ist die Figur, die der Schubfluss sieht', () => {
  it('eine gerade Wand: `A = l·t`, und um ihre eigene Achse trägt sie nichts', () => {
    // OHNE `t³/12` — der Eigenanteil des Linienelements ist genau der Anteil,
    // den die dünnwandige Theorie fallen lässt.
    const runs = segments(
      [node('a', -50, 20), node('b', 50, 20)],
      [wall('w', 'a', 'b', 8)],
      POLICY,
    );
    const moments = wallMoments(runs.flatMap((run) => [...run.segments]));

    expect(moments?.A).toBeCloseTo(100 * 8, 9);
    expect(moments?.ys).toBeCloseTo(0, 9);
    expect(moments?.zs).toBeCloseTo(20, 9);
    expect(moments?.Iy).toBeCloseTo(0, 9);
    expect(moments?.Iz).toBeCloseTo((8 * 100 ** 3) / 12, 6);
    expect(moments?.Iyz).toBeCloseTo(0, 9);
  });

  it('das I-Wandmodell trifft die Handrechnung', () => {
    const [h, b, tw, tf] = [300, 150, 7.1, 10.7];
    // Der halbe Gurtabstand — im Wandmodell ist der Steg genau so lang.
    const zf = (h - tf) / 2;
    const { nodes, walls } = iGraph(h, b, tw, tf);
    const runs = segments(nodes, walls, POLICY);
    const moments = wallMoments(runs.flatMap((run) => [...run.segments]));

    expect(moments?.A).toBeCloseTo(2 * b * tf + 2 * zf * tw, 9);
    // `z = 0` liegt an der Oberkante, der Schwerpunkt also auf halber Höhe.
    expect(moments?.zs).toBeCloseTo(h / 2, 9);
    expect(moments?.Iy).toBeCloseTo(
      2 * b * tf * zf * zf + (tw * (2 * zf) ** 3) / 12,
      6,
    );
    expect(moments?.Iz).toBeCloseTo((2 * tf * b ** 3) / 12, 6);
  });

  it('ohne Fläche gibt es keine Figur', () => {
    expect(wallMoments([])).toBeUndefined();
  });
});
