/**
 * Die DICHTE Fassung: `n x n` Zahlen, wie die Rechnung sie bis P5 aufgebaut
 * hat.
 *
 * Sie bleibt, obwohl die dünnbesetzte die Voreinstellung ist. Ein zweiter Weg
 * mit denselben Zahlen ist die einzige Probe, die ein Rechenkern gegen sich
 * selbst hat — und die Tests laufen über beide (ADR 0043).
 */

import { atOrThrow } from '@baustatik/core';
import type { LinearSolve, LinearSolveOutcome } from '../config';
import type { SystemMatrix } from './types';

class DenseSystemMatrix implements SystemMatrix {
  private readonly rows: number[][];

  constructor(
    private readonly n: number,
    private readonly port: LinearSolve,
  ) {
    this.rows = Array.from({ length: n }, () =>
      Array.from({ length: n }, () => 0),
    );
  }

  add(row: number, col: number, value: number): void {
    const values = atOrThrow(this.rows, row);
    values[col] = atOrThrow(values, col) + value;
  }

  diagonal(index: number): number {
    return atOrThrow(atOrThrow(this.rows, index), index);
  }

  rowDot(row: number, d: Float64Array): number {
    const values = atOrThrow(this.rows, row);
    let sum = 0;
    for (let c = 0; c < this.n; c += 1) {
      sum += atOrThrow(values, c) * d[c];
    }
    return sum;
  }

  async solve(
    free: readonly number[],
    F: Float64Array,
    rhsColumns: number,
  ): Promise<LinearSolveOutcome> {
    const size = free.length;
    // ZEILENWEISE flach, so erwartet es die Rust-Seite von
    // `@baustatik/linear-solver-wasm`.
    const reduced = new Float64Array(size * size);
    for (let r = 0; r < size; r += 1) {
      const values = atOrThrow(this.rows, atOrThrow(free, r));
      for (let c = 0; c < size; c += 1) {
        reduced[r * size + c] = atOrThrow(values, atOrThrow(free, c));
      }
    }
    return this.port(size, reduced, rhsColumns, F);
  }
}

export function createDenseSystemMatrix(
  n: number,
  port: LinearSolve,
): SystemMatrix {
  return new DenseSystemMatrix(n, port);
}
