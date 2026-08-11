/**
 * Die DUENNBESETZTE Fassung: nur die Plaetze, an denen etwas steht.
 *
 * WARUM SIE DIE VOREINSTELLUNG IST, und zwar aus Speicher- und nicht aus
 * Geschwindigkeitsgruenden: 2 000 Knoten sind 6 000 Freiheitsgrade und damit
 * `36e6` Zahlen — 288 MB allein fuer `K`. Ein Stabwerk hat je Zeile etwa zwoelf
 * Eintraege; alles andere ist eine sehr grosse, sehr genaue Null (ADR 0043).
 *
 * SIE HAELT DIE VOLLE, SYMMETRISCHE MATRIX und summiert Duplikate schon beim
 * `add`. Zwei Gruende, und beide zaehlen:
 *
 *   - `diagonal` und `rowDot` beantworten beide Fassungen damit GLEICH. `rowDot`
 *     braucht die volle Zeile einschliesslich der Spalten gesperrter
 *     Freiheitsgrade; nur das untere Dreieck zu halten hiesse, sie beim Lesen
 *     wieder zu spiegeln — an einer Stelle, an der ein Vorzeichenfehler nur in
 *     den Auflagerkraeften auffiele.
 *   - Wir haengen nicht an faers ungeschriebener Duplikat-Semantik. Die
 *     Invarianten von `@baustatik/sparse-solver-wasm` sagen dazu nichts; was
 *     nicht zugesichert ist, wird nicht vorausgesetzt.
 *
 * Gefiltert wird erst beim Uebergeben an den Port: dort faellt das obere
 * Dreieck weg, und dort geschieht die Umnummerierung `global -> reduziert`.
 */

import type { LinearSolveOutcome, SparseSolve } from '../config';
import type { SystemMatrix } from './types';

class SparseSystemMatrix implements SystemMatrix {
  /** Je Zeile die besetzten Spalten. Voll und symmetrisch. */
  private readonly rows = new Map<number, Map<number, number>>();

  constructor(
    private readonly n: number,
    private readonly port: SparseSolve,
  ) {}

  add(row: number, col: number, value: number): void {
    let columns = this.rows.get(row);
    if (columns === undefined) {
      columns = new Map<number, number>();
      this.rows.set(row, columns);
    }
    columns.set(col, (columns.get(col) ?? 0) + value);
  }

  diagonal(index: number): number {
    return this.rows.get(index)?.get(index) ?? 0;
  }

  rowDot(row: number, d: Float64Array): number {
    const columns = this.rows.get(row);
    if (columns === undefined) return 0;
    let sum = 0;
    for (const [col, value] of columns) {
      sum += value * d[col];
    }
    return sum;
  }

  async solve(
    free: readonly number[],
    F: Float64Array,
    rhsColumns: number,
  ): Promise<LinearSolveOutcome> {
    const size = free.length;

    // `-1` heisst „gesperrt": diese Zeile und diese Spalte fallen weg. `free`
    // ist aufsteigend, die reduzierte Nummerierung erhaelt also die
    // Reihenfolge — und damit bleibt „unteres Dreieck" dieselbe Aussage wie
    // global.
    const reducedOf = new Int32Array(this.n).fill(-1);
    for (let i = 0; i < size; i += 1) {
      reducedOf[free[i]] = i;
    }

    // Zaehlen, dann fuellen: die typisierten Arrays gehen so ohne
    // Zwischenkopie an den Port.
    let count = 0;
    for (let i = 0; i < size; i += 1) {
      const columns = this.rows.get(free[i]);
      if (columns === undefined) continue;
      for (const col of columns.keys()) {
        const reducedCol = reducedOf[col];
        if (reducedCol >= 0 && reducedCol <= i) count += 1;
      }
    }

    const rows = new Uint32Array(count);
    const cols = new Uint32Array(count);
    const values = new Float64Array(count);
    let at = 0;
    for (let i = 0; i < size; i += 1) {
      const columns = this.rows.get(free[i]);
      if (columns === undefined) continue;
      for (const [col, value] of columns) {
        const reducedCol = reducedOf[col];
        if (reducedCol < 0 || reducedCol > i) continue;
        rows[at] = i;
        cols[at] = reducedCol;
        values[at] = value;
        at += 1;
      }
    }

    return this.port(size, rows, cols, values, rhsColumns, F);
  }
}

export function createSparseSystemMatrix(
  n: number,
  port: SparseSolve,
): SystemMatrix {
  return new SparseSystemMatrix(n, port);
}
