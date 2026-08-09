/**
 * Die Verlauf-API am ERGEBNIS.
 *
 * Die Zahlen selbst sind in `fem-element` verankert; hier geht es um das, was
 * nur dieses Package leisten kann: dass die Transformation lokal<->global den
 * Verlauf am SCHRAEGEN Stab nicht verdreht, dass mehrere Staebe auseinander
 * gehalten werden, dass `solveAll` jeden Fall mit eigenen Zustaenden ablegt —
 * und dass die Auswertung `config` nicht mehr anfasst.
 */

import { describe, expect, it } from 'vitest';
import { UnknownBeamError } from '../src/errors';
import { internalForcesAlong, internalForcesAt } from '../src/internal-forces';
import { createAnalysisPolicy } from '../src/policy';
import { solveAll, solve as solveCase } from '../src/solve';
import {
  beam,
  configOver,
  node,
  type Store,
  support,
  TEST_LOAD_CASE_ID,
} from './support';

/** Kragarm der Laenge L mit Einzellast P nach unten am freien Ende. */
function cantilever(L = 2, P = 10): Store {
  return {
    nodes: [node('n1', 0, 0), node('n2', L, 0)],
    beams: [beam('b1', 'n1', 'n2')],
    supports: [support('s1', 'n1')],
    loads: [{ id: 'l1', target: 'node', nodeIds: ['n2'], fz: P }],
  };
}

/** Ohne Schub, damit die Handrechnungen die reinen Lehrbuchformeln treffen. */
function solve(store: Store) {
  return solveCase(configOver(store), TEST_LOAD_CASE_ID);
}

describe('internalForcesAt', () => {
  it('trifft am Kragarm die Handrechnung: M laeuft von -P*L auf 0', async () => {
    // Der Prueftstein aus `apps/demo/fem/fem-cantilever.ts`, jetzt als Verlauf.
    const L = 2;
    const P = 10;
    const result = await solve(cantilever(L, P));

    expect(internalForcesAt(result, 'b1', 0).M).toBeCloseTo(-P * L, 9);
    expect(internalForcesAt(result, 'b1', L).M).toBeCloseTo(0, 9);
    expect(internalForcesAt(result, 'b1', L / 2).M).toBeCloseTo(-(P * L) / 2, 9);
    for (const x of [0, 0.5, 1, L]) {
      expect(internalForcesAt(result, 'b1', x).V).toBeCloseTo(P, 9);
    }
  });

  it('trifft die Stabendkraft-Identitaet an beiden Raendern', async () => {
    const result = await solve(cantilever());
    const e = result.beamStates.get('b1')?.endForces as readonly number[];

    const left = internalForcesAt(result, 'b1', 0, 'left');
    expect(left.N).toBeCloseTo(-e[0], 12);
    expect(left.V).toBeCloseTo(-e[1], 12);
    expect(left.M).toBeCloseTo(e[2], 12);
  });

  it('rechnet am SCHRAEGEN Stab dieselben Schnittgroessen wie am geraden', async () => {
    // Die Transformation ist das Einzige, was dieses Package zur Auswertung
    // beitraegt. Derselbe Kragarm, um 3-4-5 gekippt und mit der Last entlang
    // der gedrehten Richtungen — die LOKALEN Schnittgroessen muessen gleich
    // sein, sonst dreht `toLocalVector` etwas falsch herum.
    const L = 5;
    const P = 10;
    const straight = await solve(cantilever(L, P));

    // Lastkomponenten so, dass die Kraft quer zum schraegen Stab steht:
    // Stabrichtung (3,4)/5, quer dazu (-4,3)/5 — mal P.
    const slanted = await solve({
      nodes: [node('n1', 0, 0), node('n2', 3, 4)],
      beams: [beam('b1', 'n1', 'n2')],
      supports: [support('s1', 'n1')],
      loads: [
        {
          id: 'l1',
          target: 'node',
          nodeIds: ['n2'],
          fx: (-4 / 5) * P,
          fz: (3 / 5) * P,
        },
      ],
    });

    for (const x of [0, 1.7, L]) {
      expect(internalForcesAt(slanted, 'b1', x).M).toBeCloseTo(
        internalForcesAt(straight, 'b1', x).M,
        8,
      );
      expect(internalForcesAt(slanted, 'b1', x).V).toBeCloseTo(
        internalForcesAt(straight, 'b1', x).V,
        8,
      );
    }
  });

  it('haelt die Staebe eines Zweifeldtraegers auseinander', async () => {
    // Zwei gleiche Felder, Gleichlast: das Handbuch sagt Stuetzmoment
    // -qL^2/8 und Feldmoment +9qL^2/128 bei x = 3L/8.
    const L = 4;
    const q = 6;
    const result = await solve({
      nodes: [node('n1', 0, 0), node('n2', L, 0), node('n3', 2 * L, 0)],
      beams: [beam('b1', 'n1', 'n2'), beam('b2', 'n2', 'n3')],
      supports: [
        support('s1', 'n1', 'fixed', 'fixed', 'free'),
        support('s2', 'n2', 'free', 'fixed', 'free'),
        support('s3', 'n3', 'free', 'fixed', 'free'),
      ],
      loads: [
        {
          id: 'l1',
          target: 'beam',
          beamIds: ['b1', 'b2'],
          kind: 'force',
          distribution: 'constant',
          frame: 'global',
          axis: 'z',
          referenceLength: 'trueLength',
          q,
        },
      ],
    });

    expect(internalForcesAt(result, 'b1', L).M).toBeCloseTo(
      -(q * L * L) / 8,
      6,
    );
    expect(internalForcesAt(result, 'b1', (3 * L) / 8).M).toBeCloseTo(
      (9 * q * L * L) / 128,
      6,
    );
    // Spiegelbildlich im zweiten Feld — und die beiden Zustaende sind wirklich
    // verschiedene Objekte, kein versehentlich geteilter.
    expect(internalForcesAt(result, 'b2', 0).M).toBeCloseTo(
      -(q * L * L) / 8,
      6,
    );
    expect(result.beamStates.get('b1')).not.toBe(result.beamStates.get('b2'));
  });

  it('wirft benannt bei unbekannter beamId', async () => {
    const result = await solve(cantilever());

    expect(() => internalForcesAt(result, 'gibtsnicht', 0)).toThrow(
      UnknownBeamError,
    );
  });
});

describe('internalForcesAlong', () => {
  it('mischt Raster und Stuetzstellen und bleibt aufsteigend', async () => {
    const L = 4;
    const result = await solve({
      nodes: [node('n1', 0, 0), node('n2', L, 0)],
      beams: [beam('b1', 'n1', 'n2')],
      supports: [
        support('s1', 'n1', 'fixed', 'fixed', 'free'),
        support('s2', 'n2', 'free', 'fixed', 'free'),
      ],
      loads: [
        {
          id: 'l1',
          target: 'beam',
          beamIds: ['b1'],
          kind: 'force',
          distribution: 'trapezoidal',
          frame: 'global',
          axis: 'z',
          referenceLength: 'trueLength',
          q1: 6,
          q2: 6,
          from: 1,
          to: 3,
        },
      ],
    });

    const along = internalForcesAlong(result, 'b1', { subdivisions: 8 });

    expect(along.map((p) => p.x)).toEqual(
      [...along.map((p) => p.x)].sort((a, b) => a - b),
    );
    expect(along[0].x).toBe(0);
    expect(along[along.length - 1].x).toBeCloseTo(L, 12);
    // Die Lastgrenzen stehen drin, obwohl sie auf keiner Rasterstelle liegen
    // (L/8 = 0.5, also 1 und 3 liegen zufaellig doch drauf — deshalb ein
    // Raster, das sie NICHT trifft).
    const odd = internalForcesAlong(result, 'b1', { subdivisions: 7 });
    for (const x of [1, 3]) {
      expect(odd.some((p) => Math.abs(p.x - x) < 1e-9)).toBe(true);
    }
  });

  it('liefert an einer Einzellast zwei Eintraege, erst links dann rechts', async () => {
    const L = 4;
    const P = 12;
    const result = await solve({
      nodes: [node('n1', 0, 0), node('n2', L, 0)],
      beams: [beam('b1', 'n1', 'n2')],
      supports: [
        support('s1', 'n1', 'fixed', 'fixed', 'free'),
        support('s2', 'n2', 'free', 'fixed', 'free'),
      ],
      loads: [
        {
          id: 'l1',
          target: 'beam',
          beamIds: ['b1'],
          kind: 'force',
          distribution: 'point',
          frame: 'global',
          axis: 'z',
          p: P,
          distanceFromStart: L / 2,
        },
      ],
    });

    const along = internalForcesAlong(result, 'b1', { subdivisions: 4 });
    const atMiddle = along.filter((p) => Math.abs(p.x - L / 2) < 1e-9);

    expect(atMiddle).toHaveLength(2);
    expect(atMiddle[0].V).toBeCloseTo(P / 2, 8);
    expect(atMiddle[1].V).toBeCloseTo(-P / 2, 8);
    // `M` ist an einer Einzelkraft stetig und hier maximal.
    expect(atMiddle[0].M).toBeCloseTo((P * L) / 4, 8);
    expect(atMiddle[1].M).toBeCloseTo((P * L) / 4, 8);
    expect(Math.max(...along.map((p) => p.M))).toBeCloseTo((P * L) / 4, 8);
  });
});

describe('das Ergebnis liest nichts nach', () => {
  it('beantwortet Schnittgroessen aus einem geklonten Ergebnis', async () => {
    // DIE Eigenschaft, wegen der der Zustand reine Daten ist (ADR 0019): das
    // Ergebnis ueberlebt `structuredClone`, also auch den Weg durch einen
    // Worker oder in einen Speicher. Eine Methode am Ergebnis taete das nicht.
    const result = await solve(cantilever(2, 10));
    const clone = structuredClone(result);

    expect(internalForcesAt(clone, 'b1', 0).M).toBeCloseTo(-20, 9);
    expect(internalForcesAt(clone, 'b1', 1).M).toBeCloseTo(-10, 9);
  });

  it('legt fuer jeden Lastfall eigene Zustaende ab', async () => {
    const store = cantilever(2, 10);
    const config = configOver(store, {
      getLoadCases: () => [
        { id: 'lf1', name: 'einfach', loads: store.loads },
        { id: 'lf2', name: 'doppelt', loads: store.loads, factor: 2 },
      ],
    });

    const [single, doubled] = await solveAll(config);

    expect(internalForcesAt(doubled, 'b1', 0).M).toBeCloseTo(
      2 * internalForcesAt(single, 'b1', 0).M,
      9,
    );
    expect(single.loadCaseId).toBe('lf1');
    expect(doubled.loadCaseId).toBe('lf2');
  });

  it('bleibt unter Schub bei denselben Schnittgroessen', async () => {
    // Die Rekonstruktion ist theoriefrei — der Schub steckt in den
    // Stabendkraeften. Die Verformung unterscheidet sich sehr wohl.
    const store = cantilever(2, 10);
    const stiff = await solve(store);
    const soft = await solveCase(
      configOver(store, {
        analysisPolicy: createAnalysisPolicy({ shearDeformation: true }),
      }),
      TEST_LOAD_CASE_ID,
    );

    expect(internalForcesAt(soft, 'b1', 0).M).toBeCloseTo(
      internalForcesAt(stiff, 'b1', 0).M,
      8,
    );
    expect(internalForcesAt(soft, 'b1', 1).V).toBeCloseTo(
      internalForcesAt(stiff, 'b1', 1).V,
      8,
    );
    // Die VERFORMUNG unterscheidet sich sehr wohl — sonst waere der Anker
    // wertlos, weil beide Rechnungen dieselbe waeren.
    expect(soft.displacements.get('n2')?.uz).not.toBeCloseTo(
      stiff.displacements.get('n2')?.uz as number,
      12,
    );
  });
});
