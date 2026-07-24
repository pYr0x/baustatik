/**
 * Gemeinsame Test-Helfer (test-only, nicht aus dem Package-Index exportiert).
 *
 * Urspruenglich lokal in `euler-bernoulli.test.ts`; hierher gezogen, damit die
 * Timoshenko-Tests dieselbe 6x6-Arithmetik und dieselben Toleranz-Zusicherungen
 * benutzen statt eigener Kopien.
 */

import { expect } from 'vitest';
import type { Matrix6 } from '../src/types';

/**
 * `m * v`. Nimmt sowohl die getupelte `Matrix6` als auch dichte `number[][]`
 * (etwa `T_REV`), damit fuer beide nur EIN Mat-Vec existiert.
 */
export function matVec(
  m: readonly (readonly number[])[],
  v: readonly number[],
): number[] {
  return m.map((row) => row.reduce((sum, k, j) => sum + k * v[j], 0));
}

/** Generisches Matrixprodukt ueber number[][]. */
export function matMul(a: number[][], b: number[][]): number[][] {
  return a.map((row) =>
    b[0].map((_, j) => row.reduce((sum, k, p) => sum + k * b[p][j], 0)),
  );
}

export function transpose(a: number[][]): number[][] {
  return a[0].map((_, j) => a.map((row) => row[j]));
}

export function toDense(m: Matrix6): number[][] {
  return m.map((row) => [...row]);
}

/** Skalarprodukt zweier gleich langer Vektoren. */
export function dot(a: readonly number[], b: readonly number[]): number {
  return a.reduce((sum, v, i) => sum + v * b[i], 0);
}

/** Loest [[a,b],[c,d]] * [x,y] = [e,f]. */
export function solve2(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
) {
  const det = a * d - b * c;
  return { x: (e * d - b * f) / det, y: (a * f - e * c) / det };
}

/**
 * Knotenvertauschung: die neuen DOF in den alten ausgedrueckt. Die Vorzeichen
 * folgen aus der Umkehr der lokalen x-Achse bei `theta = dw/dx` — `u` und
 * `theta` drehen sich um, `w` nicht.
 *
 * Lag urspruenglich doppelt in beiden Testdateien; eine Elementmatrix und ein
 * Lastvektor muessen unter DERSELBEN Transformation invariant sein, sonst
 * driften die DOF-Konventionen der beiden Dateien auseinander.
 */
export const T_REV: number[][] = [
  [0, 0, 0, -1, 0, 0],
  [0, 0, 0, 0, 1, 0],
  [0, 0, 0, 0, 0, -1],
  [-1, 0, 0, 0, 0, 0],
  [0, 1, 0, 0, 0, 0],
  [0, 0, -1, 0, 0, 0],
];

/** `T_REV * m * T_REV^T` — die Matrix aus Sicht der vertauschten Knoten. */
export function reverseNodes(m: number[][]): number[][] {
  return matMul(matMul(T_REV, m), transpose(T_REV));
}

/**
 * Eigenwerte einer symmetrischen Matrix, aufsteigend sortiert — zyklisches
 * Jacobi-Verfahren.
 *
 * Von Hand statt per Library: das Package ist ein bewusst abhaengigkeitsfreies
 * Blatt, und fuer eine 6x6 sind das 30 Zeilen. Gebraucht fuer den Rangtest
 * (genau drei Nulleigenwerte = genau drei Starrkoerpermoden); die Alternative
 * "K*r = 0 fuer drei bekannte r" bestuende auch eine Nullmatrix.
 */
export function eigenvaluesSymmetric(
  input: readonly (readonly number[])[],
): number[] {
  const n = input.length;
  const a = input.map((row) => [...row]);
  const frobenius = Math.hypot(...a.flat());

  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
    }
    // Quadratische Konvergenz: nach wenigen Sweeps steht hier die
    // Maschinengenauigkeit, weiter kommt das Verfahren nicht.
    if (Math.sqrt(off) <= 1e-15 * frobenius) break;

    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (a[p][q] === 0) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t =
          (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;

        // A <- J^T A J, spaltenweise dann zeilenweise.
        for (let k = 0; k < n; k++) {
          const kp = a[k][p];
          const kq = a[k][q];
          a[k][p] = c * kp - s * kq;
          a[k][q] = s * kp + c * kq;
        }
        for (let k = 0; k < n; k++) {
          const pk = a[p][k];
          const qk = a[q][k];
          a[p][k] = c * pk - s * qk;
          a[q][k] = s * pk + c * qk;
        }
      }
    }
  }

  return a.map((row, i) => row[i]).sort((x, y) => x - y);
}

/**
 * Der Rangtest aus `docs/Elementformulierung.md` (Punkt 6): eine ebene
 * Element-K muss GENAU drei Nulleigenwerte haben — drei Starrkoerpermoden, kein
 * weiterer Mechanismus — und darf keinen negativen haben.
 *
 * Die Schranken sind relativ zum groessten Eigenwert, weil `EA/L` und die
 * Biegeterme mehrere Groessenordnungen auseinanderliegen.
 */
export function expectThreeRigidBodyModes(m: number[][]) {
  const eig = eigenvaluesSymmetric(m);
  const scale = Math.abs(eig[eig.length - 1]);

  for (const lambda of eig) {
    expect(lambda).toBeGreaterThan(-1e-10 * scale); // positiv semidefinit
  }
  for (const lambda of eig.slice(0, 3)) {
    expect(Math.abs(lambda)).toBeLessThan(1e-10 * scale);
  }
  // Der viertkleinste ist deutlich weg von null: keine vierte Nullmode.
  expect(eig[3]).toBeGreaterThan(1e-6 * scale);
}

export function expectClose(got: number, exp: number, rel = 1e-9) {
  expect(Math.abs(got - exp)).toBeLessThanOrEqual(
    rel * Math.max(1, Math.abs(exp)),
  );
}

/**
 * Effektive Querschnittswerte eines Rechtecks b x h — nur fuer den
 * Locking-Sweep, wo die Schlankheit L/h eine echte Geometrie braucht.
 * kappa = 5/6 ist der Schubkorrekturfaktor des Rechtecks.
 */
export function rectangleProps(
  b: number,
  h: number,
  E: number,
  nu = 0.3,
  kappa = 5 / 6,
) {
  const G = E / (2 * (1 + nu));
  return { EA: E * b * h, EI: (E * b * h * h * h) / 12, GAs: kappa * G * b * h };
}
