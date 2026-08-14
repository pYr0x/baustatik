/**
 * Die Rechnung — REIN UND SYNCHRON, der Loeser kommt als Funktion herein.
 *
 * ZWEI RANDWERTPROBLEME, ZWEI ZERLEGUNGEN, und mehr wird es auch mit Loechern
 * nicht:
 *
 * ```text
 * Torsion:  ∇²ω = 0, Neumann          1 rechte Seite   (ein Knoten gehalten)
 * Schub:    ∇²Φ = −m·y/Iy, Dirichlet  4 + h rechte Seiten
 * ```
 *
 * DIE VIER SCHUB-SEITEN SIND NICHT ZWEIMAL ZWEI. `K` ist drehinvariant, also
 * teilen sich BEIDE Lastrichtungen eine Matrix und eine Zerlegung: je Richtung
 * das Randdatum und der Lastanteil, und die `h` Lochfelder gelten fuer beide.
 * Zwei Faktorisierungen daraus zu machen kostete das Doppelte und aenderte
 * keine Zahl.
 *
 * DIE HAUPTACHSEN SIND PFLICHT, NICHT KOSMETIK. `σ_x = M·z/Iy` gilt nur dort;
 * eine Figur mit `Iyz != 0` wird deshalb gedreht gerechnet und ihr
 * Schubmittelpunkt hinterher exakt zurueckgedreht. `inverseKappaY`/
 * `inverseKappaZ` gehoeren damit den HAUPTACHSEN — bei `alpha = 0`, dem
 * Regelfall, den das Gate mit `NotPrincipalAxesWarning` absichert, sind das
 * `y` und `z`.
 */

import { atOrThrow } from '@baustatik/core';
import {
  assembleShearStiffness,
  assembleTorsionStiffness,
  closureHolds,
  createFrame,
  type Frame,
  holeFlux,
  principalRotation,
  type StiffnessSystem,
} from './assemble';
import { evaluateShear, type ShearEvaluation } from './evaluate';
import type { FESection } from './prepare';
import { torsionLoad } from './torsion';

/**
 * Der Loeser als Funktion: `K d = F` mit `k` rechten Seiten, `F` und `d`
 * spaltenweise flach.
 *
 * WIRFT, wenn die Matrix nicht positiv definit ist. Das ist hier anders als im
 * Stabwerk: dort ist `unfixed` ein Befund ueber das MODELL, hier ueber die
 * Assemblierung — ein Netz, das in Teile zerfaellt, faengt `mesh.ts` vorher ab.
 */
export type SparseSolve = (
  n: number,
  rows: Uint32Array,
  cols: Uint32Array,
  values: Float64Array,
  rhsColumns: number,
  f: Float64Array,
) => Float64Array;

/** Was der Randschluss traegt: κ und der Schubmittelpunkt, oder nichts. */
export type ShearResult = {
  readonly inverseKappaY: readonly [number, number];
  readonly inverseKappaZ: readonly [number, number];
  /** Im EINGABESYSTEM des Netzes, nicht schwerpunktsbezogen. */
  readonly yM: number;
  readonly zM: number;
};

/** Was aus der Rechnung faellt, in den Einheiten des Netzes. */
export type FEResult = {
  /** `undefined` heisst: der Randschluss traegt nicht (ADR 0045). */
  readonly shear: ShearResult | undefined;
  /** Immer da — die Torsion ist von der Lochbedingung unberuehrt. */
  readonly It: number;
  readonly diagnostics: FEDiagnostics;
};

/**
 * Die Selbstpruefungen. KEINE davon deckt den Netzfehler ab — dafuer sind die
 * Orakel da (ADR 0045).
 */
export type FEDiagnostics = {
  /** Drehwinkel in die Hauptachsen [rad]. */
  readonly theta: number;
  /** Der groesste Randschluss je Lastrichtung, bezogen auf die Spannweite. */
  readonly closureZ: number;
  readonly closureY: number;
  /** `∮(z·n_y − y·n_z) ds` — die Vertraeglichkeitsbedingung der Torsion. */
  readonly compatibility: number;
  /** `∫τ_z dA` bei `m = 0`; muss `1` sein. */
  readonly equilibriumZ: number;
  readonly equilibriumY: number;
  /** `d₁/d₀` je Richtung — beweisbar null. */
  readonly d1RatioZ: number;
  readonly d1RatioY: number;
  /**
   * Die groesste Unsymmetrie der Kopplungsmatrix, bezogen auf ihre Diagonale.
   * `0`, wenn es kein Loch gibt.
   */
  readonly capacitanceAsymmetry: number;
  readonly holeCount: number;
};

/** Rechnet das vorbereitete Netz durch. Der Loeser wird zweimal gerufen. */
export function computeFromMesh(
  section: FESection,
  solve: SparseSolve,
): FEResult {
  const shear = assembleShearStiffness(section);
  const theta = principalRotation(section.Iy, section.Iz, section.Iyz);
  const frameZ = createFrame(section, shear, theta);
  const frameY = createFrame(section, shear, theta + Math.PI / 2);

  const torsion = solveTorsion(section, solve);
  const holeCount = section.holeLoops.length;

  if (!closureHolds(frameZ) || !closureHolds(frameY)) {
    // `It` bleibt unberuehrt: `ω` ist eine physische Verschiebung und auf jedem
    // Gebiet eindeutig. Der Durchlauf mit einem Nullfeld liefert genau das —
    // eine zweite Integrationsschleife nur fuer `It` waere ein zweiter Weg zur
    // selben Zahl.
    const empty = new Float64Array(section.nodeCount);
    const only = evaluateShear(section, frameZ, empty, empty, torsion.omega);
    return {
      shear: undefined,
      It: only.It,
      diagnostics: {
        theta,
        closureZ: frameZ.closure,
        closureY: frameY.closure,
        compatibility: torsion.compatibility,
        equilibriumZ: Number.NaN,
        equilibriumY: Number.NaN,
        d1RatioZ: Number.NaN,
        d1RatioY: Number.NaN,
        capacitanceAsymmetry: 0,
        holeCount,
      },
    };
  }

  const fields = solveShearFields(section, shear, frameZ, frameY, solve);
  const resultZ = evaluateShear(
    section,
    frameZ,
    fields.z.phiA,
    fields.z.phiB,
    torsion.omega,
  );
  const resultY = evaluateShear(
    section,
    frameY,
    fields.y.phiA,
    fields.y.phiB,
    torsion.omega,
  );

  // Der Schubmittelpunkt faellt in den gedrehten Systemen als je EINE
  // Koordinate an und wird hier exakt zurueckgedreht.
  const uM = resultZ.torque - resultZ.projection;
  const vM = resultY.torque - resultY.projection;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  return {
    shear: {
      inverseKappaZ: [section.A * resultZ.E00, section.A * resultZ.E11],
      inverseKappaY: [section.A * resultY.E00, section.A * resultY.E11],
      yM: section.ys + (uM * cos - vM * sin),
      zM: section.zs + (uM * sin + vM * cos),
    },
    It: resultZ.It,
    diagnostics: {
      theta,
      closureZ: frameZ.closure,
      closureY: frameY.closure,
      compatibility: torsion.compatibility,
      equilibriumZ: resultZ.Fz,
      equilibriumY: resultY.Fz,
      d1RatioZ: d1Ratio(resultZ),
      d1RatioY: d1Ratio(resultY),
      capacitanceAsymmetry: fields.capacitanceAsymmetry,
      holeCount,
    },
  };
}

function solveTorsion(
  section: FESection,
  solve: SparseSolve,
): { readonly omega: Float64Array; readonly compatibility: number } {
  const system = assembleTorsionStiffness(section);
  const load = torsionLoad(section, system);
  const d = solve(
    system.free,
    system.rows,
    system.cols,
    system.values,
    1,
    load.rhs,
  );
  return {
    omega: expand(section, system, d, new Float64Array(section.nodeCount)),
    compatibility: load.compatibility,
  };
}

type FrameFields = {
  readonly phiA: Float64Array;
  readonly phiB: Float64Array;
};

/**
 * Die Grundfelder beider Lastrichtungen auf EINER Zerlegung.
 *
 * Spaltenordnung: `[g_z, load_z, g_y, load_y, hole_0 … hole_{h−1}]`. Die
 * Lochfelder gelten fuer beide Richtungen — ihre Dirichlet-Daten sind
 * Indikatoren und kennen keine Lastrichtung.
 */
function solveShearFields(
  section: FESection,
  system: StiffnessSystem,
  frameZ: Frame,
  frameY: Frame,
  solve: SparseSolve,
): {
  readonly z: FrameFields;
  readonly y: FrameFields;
  readonly capacitanceAsymmetry: number;
} {
  const holeCount = section.holeLoops.length;
  const columns = 4 + holeCount;
  const rhs = new Float64Array(system.free * columns);
  rhs.set(frameZ.rhsDirichlet, 0);
  rhs.set(frameZ.rhsLoad, system.free);
  rhs.set(frameY.rhsDirichlet, 2 * system.free);
  rhs.set(frameY.rhsLoad, 3 * system.free);
  for (let hole = 0; hole < holeCount; hole += 1) {
    rhs.set(atOrThrow(frameZ.rhsHole, hole), (4 + hole) * system.free);
  }

  const d = solve(
    system.free,
    system.rows,
    system.cols,
    system.values,
    columns,
    rhs,
  );
  const column = (index: number): Float64Array =>
    d.subarray(index * system.free, (index + 1) * system.free);

  const phiHole: Float64Array[] = [];
  for (let hole = 0; hole < holeCount; hole += 1) {
    phiHole.push(
      expand(
        section,
        system,
        column(4 + hole),
        atOrThrow(frameZ.holeIndicator, hole),
      ),
    );
  }

  // Die Kopplungsmatrix ist die Schur-Ergaenzung von `K` auf die Innenraender:
  // symmetrisch, m-frei, EINMAL je Figur. Sie GANZ aufzustellen und nicht nur
  // ihre Diagonale kostet 27,2 % an κ bei zwei Loechern (ADR 0045).
  const matrix = capacitance(section, system, frameZ, phiHole);

  return {
    z: combine(section, system, frameZ, column(0), column(1), phiHole, matrix),
    y: combine(section, system, frameY, column(2), column(3), phiHole, matrix),
    capacitanceAsymmetry: asymmetry(matrix),
  };
}

/**
 * `Φ = Φ_g + m·Φ_load + Σ c_k·Φ_k`, zerlegt in `Φ_a + m·Φ_b`.
 *
 * DIE KONSTANTEN SIND SELBST AFFIN IN `m`: die Zusatzbedingung ist linear, also
 * zerfaellt sie in einen `m⁰`- und einen `m¹`-Teil auf DERSELBEN
 * Kopplungsmatrix. Nur deshalb bleibt `Φ` insgesamt affin — und nur deshalb ist
 * `1/κ` exakt quadratisch statt naeherungsweise.
 */
function combine(
  section: FESection,
  system: StiffnessSystem,
  frame: Frame,
  freeG: Float64Array,
  freeLoad: Float64Array,
  phiHole: readonly Float64Array[],
  matrix: readonly Float64Array[],
): FrameFields {
  const phiG = expand(section, system, freeG, frame.boundaryValues);
  const phiLoad = expand(
    section,
    system,
    freeLoad,
    new Float64Array(section.nodeCount),
  );
  const holeCount = phiHole.length;
  if (holeCount === 0) return { phiA: phiG, phiB: phiLoad };

  const cA = solveDense(
    matrix,
    negate(holeFlux(section, system, frame, phiG, 0)),
  );
  const cB = solveDense(
    matrix,
    negate(holeFlux(section, system, frame, phiLoad, 1)),
  );

  const phiA = new Float64Array(phiG);
  const phiB = new Float64Array(phiLoad);
  for (let hole = 0; hole < holeCount; hole += 1) {
    const field = atOrThrow(phiHole, hole);
    const a = atOrThrow(cA, hole);
    const b = atOrThrow(cB, hole);
    for (let node = 0; node < section.nodeCount; node += 1) {
      phiA[node] = atOrThrow(phiA, node) + a * atOrThrow(field, node);
      phiB[node] = atOrThrow(phiB, node) + b * atOrThrow(field, node);
    }
  }
  return { phiA, phiB };
}

function capacitance(
  section: FESection,
  system: StiffnessSystem,
  frame: Frame,
  phiHole: readonly Float64Array[],
): readonly Float64Array[] {
  const holeCount = phiHole.length;
  const matrix = Array.from(
    { length: holeCount },
    () => new Float64Array(holeCount),
  );
  for (let j = 0; j < holeCount; j += 1) {
    const flux = holeFlux(section, system, frame, atOrThrow(phiHole, j), 0);
    for (let k = 0; k < holeCount; k += 1) {
      atOrThrow(matrix, k)[j] = atOrThrow(flux, k);
    }
  }
  return matrix;
}

/**
 * Die groesste Unsymmetrie der Kopplungsmatrix.
 *
 * EINE KOSTENLOSE SELBSTPRUEFUNG: `M_kj` und `M_jk` entstehen aus
 * VERSCHIEDENEN Loesungen und verschiedenen Summen, muessen aber gleich sein —
 * die Matrix ist eine Schur-Ergaenzung.
 */
function asymmetry(matrix: readonly Float64Array[]): number {
  let worst = 0;
  let scale = 0;
  for (let k = 0; k < matrix.length; k += 1) {
    const row = atOrThrow(matrix, k);
    scale = Math.max(scale, Math.abs(atOrThrow(row, k)));
    for (let j = 0; j < matrix.length; j += 1) {
      worst = Math.max(
        worst,
        Math.abs(atOrThrow(row, j) - atOrThrow(atOrThrow(matrix, j), k)),
      );
    }
  }
  return scale > 0 ? worst / scale : 0;
}

function negate(values: Float64Array): Float64Array {
  const out = new Float64Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    out[index] = -atOrThrow(values, index);
  }
  return out;
}

/** Knotenwerte aus den freien Knoten plus vorgegebenen Randwerten. */
function expand(
  section: FESection,
  system: StiffnessSystem,
  free: Float64Array,
  boundary: Float64Array,
): Float64Array {
  const phi = new Float64Array(section.nodeCount);
  for (let node = 0; node < section.nodeCount; node += 1) {
    const row = atOrThrow(system.freeIndex, node);
    phi[node] = row < 0 ? atOrThrow(boundary, node) : atOrThrow(free, row);
  }
  return phi;
}

/**
 * Dichtes `h × h`-System mit Spaltenpivotierung.
 *
 * `h` ist die Zahl der Loecher und damit einstellig; ein duenn besetzter Loeser
 * waere hier mehr Verwaltung als Rechnung.
 */
function solveDense(
  matrix: readonly Float64Array[],
  rhs: Float64Array,
): Float64Array {
  const n = rhs.length;
  const work = Array.from({ length: n }, (_, row) => {
    const line = new Float64Array(n + 1);
    line.set(atOrThrow(matrix, row), 0);
    line[n] = atOrThrow(rhs, row);
    return line;
  });
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (
        Math.abs(atOrThrow(atOrThrow(work, row), col)) >
        Math.abs(atOrThrow(atOrThrow(work, pivot), col))
      ) {
        pivot = row;
      }
    }
    const swap = atOrThrow(work, col);
    work[col] = atOrThrow(work, pivot);
    work[pivot] = swap;
    const pivotRow = atOrThrow(work, col);
    const pivotValue = atOrThrow(pivotRow, col);
    if (pivotValue === 0) {
      throw new Error('Die Kopplungsmatrix der Loecher ist singulaer.');
    }
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const line = atOrThrow(work, row);
      const factor = atOrThrow(line, col) / pivotValue;
      for (let k = col; k <= n; k += 1) {
        line[k] = atOrThrow(line, k) - factor * atOrThrow(pivotRow, k);
      }
    }
  }
  const x = new Float64Array(n);
  for (let row = 0; row < n; row += 1) {
    const line = atOrThrow(work, row);
    x[row] = atOrThrow(line, n) / atOrThrow(line, row);
  }
  return x;
}

function d1Ratio(result: ShearEvaluation): number {
  return result.E00 === 0 ? Number.NaN : (2 * result.E01) / result.E00;
}
