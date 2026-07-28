/**
 * Mini-Assembler fuer einen GERADEN Stabzug — ausschliesslich fuer Tests.
 *
 * WOZU: Ein paar Anker brauchen eine externe Wahrheit, gegen die sich ein
 * einzelnes Element vergleichen laesst. Der wichtigste ist die Gewichtung des
 * verteilten Moments (`Ntheta` statt `Nw'`): der phi=0-Vergleich, das
 * Kraeftegleichgewicht und die Partitionsinvarianz erfuellen BEIDE Varianten,
 * diskriminieren also nicht. Erst "ein Element === n Elemente" tut es.
 *
 * ABGRENZUNG ZU fem-solver: Hier liegen alle Elemente auf DERSELBEN lokalen
 * Achse, deshalb gibt es keine Transformation, keine globale Welt und keinen
 * Stabwinkel — Knoten `i` belegt einfach die Freiheitsgrade `[3i, 3i+1, 3i+2]`
 * und benachbarte Elemente ueberlappen um drei. Das nimmt `fem-solver` nichts
 * vorweg, sondern ist die kleinste Konstruktion, mit der sich Nachbarelemente
 * ueberhaupt vergleichen lassen.
 *
 * Bewusst NICHT aus dem Package-Index exportiert, wie `euler-bernoulli.ts`.
 */

import type {
  FrameElement2DFormulation,
  LocalElementLoad,
  SectionProperties,
} from '../../src/types';

export type Chain = {
  /** Assemblierte Steifigkeit, Dimension 3*(Elementanzahl+1). */
  K: number[][];
  /** Assemblierter Ersatzknotenvektor. */
  f: number[];
  ndof: number;
};

/**
 * Assembliert `lengths.length` Elemente in Reihe. `loads[i]` ist die auf
 * Element `i` bereits aufgeloeste Last (lokale Koordinaten, 0..lengths[i]).
 */
export function assembleChain(
  formulation: FrameElement2DFormulation,
  props: SectionProperties,
  lengths: number[],
  loads: LocalElementLoad[] = [],
): Chain {
  const ndof = 3 * (lengths.length + 1);
  const K: number[][] = Array.from({ length: ndof }, () =>
    new Array<number>(ndof).fill(0),
  );
  const f = new Array<number>(ndof).fill(0);

  lengths.forEach((Le, e) => {
    const el = formulation.prepare(props, Le);
    const ke = el.stiffness();
    const fe = el.withLoad(loads[e] ?? { segments: [], points: [] }).consistentLoad();
    const base = 3 * e;

    for (let i = 0; i < 6; i++) {
      f[base + i] += fe[i];
      for (let j = 0; j < 6; j++) {
        K[base + i][base + j] += ke[i][j];
      }
    }
  });

  return { K, f, ndof };
}

/** Gauss-Jordan mit Teilpivotisierung; nur fuer die kleinen Testsysteme. */
export function solveDense(A: number[][], b: number[]): number[] {
  const n = b.length;
  const m = A.map((row, i) => [...row, b[i]]);

  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) {
      if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r;
    }
    [m[c], m[piv]] = [m[piv], m[c]];

    const d = m[c][c];
    if (d === 0) throw new Error('Singulaeres Testsystem (fehlende Lagerung?).');
    for (let j = c; j <= n; j++) m[c][j] /= d;

    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const factor = m[r][c];
      if (factor === 0) continue;
      for (let j = c; j <= n; j++) m[r][j] -= factor * m[c][j];
    }
  }

  return m.map((row) => row[n]);
}

/**
 * Loest den Stabzug mit gesperrten Freiheitsgraden (`fixed`, Werte 0) und
 * optionalen zusaetzlichen Knotenlasten. Liefert den vollen Verschiebungsvektor.
 */
export function solveChain(
  chain: Chain,
  fixed: number[],
  nodalLoads: Record<number, number> = {},
): number[] {
  const blocked = new Set(fixed);
  const free = Array.from({ length: chain.ndof }, (_, i) => i).filter(
    (i) => !blocked.has(i),
  );

  const Kff = free.map((i) => free.map((j) => chain.K[i][j]));
  const ff = free.map((i) => chain.f[i] + (nodalLoads[i] ?? 0));
  const df = solveDense(Kff, ff);

  const d = new Array<number>(chain.ndof).fill(0);
  free.forEach((i, k) => {
    d[i] = df[k];
  });

  return d;
}

/** Residuum `K*d - f` (Knotenkraefte); an unbelasteten Knoten muss es 0 sein. */
export function chainResidual(chain: Chain, d: number[]): number[] {
  return chain.K.map(
    (row, i) => row.reduce((sum, k, j) => sum + k * d[j], 0) - chain.f[i],
  );
}

/** Streckenlast-Objekt fuer ein Element voller Laenge `Le`. */
export function fullSpanLoad(
  Le: number,
  values: Partial<{ qx: number; qz: number; my: number }>,
): LocalElementLoad {
  const { qx = 0, qz = 0, my = 0 } = values;
  return {
    segments: [
      {
        from: 0,
        to: Le,
        qx1: qx,
        qx2: qx,
        qz1: qz,
        qz2: qz,
        my1: my,
        my2: my,
      },
    ],
    points: [],
  };
}
