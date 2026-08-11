/**
 * Die beiden Fassungen der Steifigkeitsmatrix, gegeneinander gehalten.
 *
 * WAS HIER GEPRUEFT WIRD und was in `solve.test.ts`: dort laufen die
 * Handrechnungen ueber beide Wege und pruefen, dass am Ende dieselben Zahlen
 * stehen. Hier wird die NAHT selbst geprueft — was `dense.ts` und `sparse.ts`
 * einander schulden, unabhaengig von jedem Stabwerk. Ohne diese Datei faende
 * ein Fehler in `rowDot` sein Alibi in einem Vorzeichen der Assemblierung.
 */

import { describe, expect, it } from 'vitest';
import type { LinearSolveOutcome, SparseSolve } from '../src/config';
import { InvalidSolverConfigError } from '../src/errors';
import { LINEAR_SYSTEM_KINDS } from '../src/policy';
import {
  resolveSystemMatrixFactory,
  type SystemMatrix,
} from '../src/system-matrix';
import { fakeSparseSolve, gaussSolve } from './support';

const PORTS = {
  solveLinearSystem: gaussSolve,
  solveSparseSystem: fakeSparseSolve,
};

/**
 * Eine kleine, unsymmetrisch besetzte, aber symmetrische Matrix.
 *
 * Sie ist positiv definit (diagonaldominant) und hat in Zeile 2 eine Luecke —
 * genau dort unterscheiden sich die beiden Fassungen im Speicher und muessen
 * trotzdem dasselbe antworten.
 */
const ENTRIES: readonly (readonly [number, number, number])[] = [
  [0, 0, 4],
  [1, 1, 5],
  [2, 2, 6],
  [3, 3, 7],
  [0, 1, -1],
  [1, 0, -1],
  [1, 2, -2],
  [2, 1, -2],
  [0, 3, -1],
  [3, 0, -1],
];

const N = 4;

function filled(kind: (typeof LINEAR_SYSTEM_KINDS)[number]): SystemMatrix {
  const matrix = resolveSystemMatrixFactory(kind, PORTS)(N);
  for (const [row, col, value] of ENTRIES) {
    matrix.add(row, col, value);
  }
  return matrix;
}

describe('SystemMatrix — beide Fassungen antworten gleich', () => {
  it('liefert dieselbe Diagonale, auch an leeren Plaetzen', () => {
    const dense = filled('dense');
    const sparse = filled('sparse');

    for (let i = 0; i < N; i += 1) {
      expect(sparse.diagonal(i)).toBe(dense.diagonal(i));
    }

    // Die Stelle, an der die duennbesetzte Fassung gar keinen Eintrag hat —
    // `assertHeld` haengt genau daran.
    const leer = resolveSystemMatrixFactory('sparse', PORTS)(N);
    expect(leer.diagonal(2)).toBe(0);
  });

  it('liefert dasselbe Zeilenprodukt ueber die VOLLE Zeile', () => {
    const dense = filled('dense');
    const sparse = filled('sparse');
    const d = new Float64Array([1, -2, 3, -4]);

    for (let row = 0; row < N; row += 1) {
      expect(sparse.rowDot(row, d)).toBeCloseTo(dense.rowDot(row, d), 12);
    }

    // Von Hand: Zeile 0 ist [4, -1, 0, -1] mal [1, -2, 3, -4] = 4 + 2 + 4.
    expect(dense.rowDot(0, d)).toBeCloseTo(10, 12);
  });

  it('loest dasselbe reduzierte System, mit mehreren rechten Seiten', async () => {
    const free = [0, 2, 3];
    // Zwei rechte Seiten, spaltenweise flach ueber die drei freien Zeilen.
    const F = new Float64Array([1, 0, 0, 0, 1, 0]);

    const dense = await filled('dense').solve(free, F, 2);
    const sparse = await filled('sparse').solve(free, F, 2);

    expect(dense.kind).toBe('solved');
    expect(sparse.kind).toBe('solved');
    if (dense.kind !== 'solved' || sparse.kind !== 'solved') return;

    expect(sparse.d.length).toBe(free.length * 2);
    for (let i = 0; i < sparse.d.length; i += 1) {
      expect(sparse.d[i]).toBeCloseTo(dense.d[i], 12);
    }
  });

  it('meldet den Rangabfall auf beiden Wegen an derselben Zeile', async () => {
    // Zeile 1 als Vielfaches von Zeile 0 — und zwar im REDUZIERTEN System, das
    // hier alle vier Zeilen umfasst.
    const build = (kind: (typeof LINEAR_SYSTEM_KINDS)[number]): SystemMatrix => {
      const matrix = resolveSystemMatrixFactory(kind, PORTS)(2);
      matrix.add(0, 0, 1);
      matrix.add(0, 1, 1);
      matrix.add(1, 0, 1);
      matrix.add(1, 1, 1);
      return matrix;
    };
    const F = new Float64Array([1, 1]);

    const dense = await build('dense').solve([0, 1], F, 1);
    const sparse = await build('sparse').solve([0, 1], F, 1);

    expect(dense.kind).toBe('singular');
    expect(sparse).toEqual(dense);
  });
});

describe('SystemMatrix — die Betriebsart braucht ihren Port', () => {
  it('nennt den fehlenden Port beim Namen, je Betriebsart', () => {
    const dense = () => resolveSystemMatrixFactory('dense', {});
    expect(dense).toThrow(InvalidSolverConfigError);
    expect(dense).toThrow(/solveLinearSystem/);

    const sparse = () => resolveSystemMatrixFactory('sparse', {});
    expect(sparse).toThrow(InvalidSolverConfigError);
    expect(sparse).toThrow(/solveSparseSystem/);
  });

  it('traegt Betriebsart und Portnamen als Felder, nicht nur im Satz', () => {
    const failure = (() => {
      try {
        resolveSystemMatrixFactory('sparse', { solveLinearSystem: gaussSolve });
        return undefined;
      } catch (error: unknown) {
        return error as InvalidSolverConfigError;
      }
    })();

    expect(failure?.linearSystem).toBe('sparse');
    expect(failure?.port).toBe('solveSparseSystem');
  });

  it('nimmt den EINEN Port an, der zur Betriebsart gehoert', () => {
    // Der andere darf fehlen — genau darum sind beide optional: wer einen Weg
    // rechnet, laedt ein Artefakt.
    expect(() =>
      resolveSystemMatrixFactory('sparse', { solveSparseSystem: fakeSparseSolve }),
    ).not.toThrow();
    expect(() =>
      resolveSystemMatrixFactory('dense', { solveLinearSystem: gaussSolve }),
    ).not.toThrow();
  });
});

describe('SystemMatrix — was die duennbesetzte Fassung dem Port gibt', () => {
  /** Ein Port, der nur aufschreibt, was bei ihm ankommt. */
  function recording(): {
    port: SparseSolve;
    seen: { rows: number[]; cols: number[]; values: number[] };
  } {
    const seen = { rows: [] as number[], cols: [] as number[], values: [] as number[] };
    const port: SparseSolve = (
      _n,
      rows,
      cols,
      values,
      _rhsColumns,
      _F,
    ): LinearSolveOutcome => {
      seen.rows = [...rows];
      seen.cols = [...cols];
      seen.values = [...values];
      // Was zurueckkommt, interessiert hier nicht — gefragt ist, was HINEINGEHT.
      return { kind: 'solved', d: new Float64Array(0) };
    };
    return { port, seen };
  }

  it('gibt nur das untere Dreieck heraus', async () => {
    const { port, seen } = recording();
    const matrix = resolveSystemMatrixFactory('sparse', { solveSparseSystem: port })(N);
    for (const [row, col, value] of ENTRIES) {
      matrix.add(row, col, value);
    }

    await matrix.solve([0, 1, 2, 3], new Float64Array(N), 1);

    expect(seen.rows.length).toBeGreaterThan(0);
    for (let i = 0; i < seen.rows.length; i += 1) {
      expect(seen.rows[i]).toBeGreaterThanOrEqual(seen.cols[i]);
    }
    // Die volle, symmetrische Matrix hat zehn Eintraege; ihr unteres Dreieck
    // hat sieben.
    expect(seen.rows.length).toBe(7);
  });

  it('nummeriert global auf reduziert um und laesst gesperrte Zeilen weg', async () => {
    const { port, seen } = recording();
    const matrix = resolveSystemMatrixFactory('sparse', { solveSparseSystem: port })(N);
    for (const [row, col, value] of ENTRIES) {
      matrix.add(row, col, value);
    }

    // Frei sind die globalen Zeilen 1 und 3; reduziert heissen sie 0 und 1.
    await matrix.solve([1, 3], new Float64Array(2), 1);

    // Uebrig bleiben die Diagonalen 5 und 7 — die Kopplung (1, 2) faellt weg,
    // weil Zeile 2 gesperrt ist, und (0, 3) ebenso.
    expect(seen.rows).toEqual([0, 1]);
    expect(seen.cols).toEqual([0, 1]);
    expect(seen.values).toEqual([5, 7]);
  });

  it('summiert doppelte Eintraege schon beim add', async () => {
    const { port, seen } = recording();
    const matrix = resolveSystemMatrixFactory('sparse', { solveSparseSystem: port })(1);
    // Genau das tut die Assemblierung: jeder angrenzende Stab traegt auf
    // denselben Platz ein.
    matrix.add(0, 0, 1);
    matrix.add(0, 0, 2);
    matrix.add(0, 0, 4);

    expect(matrix.diagonal(0)).toBe(7);

    await matrix.solve([0], new Float64Array(1), 1);
    expect(seen.values).toEqual([7]);
  });
});
