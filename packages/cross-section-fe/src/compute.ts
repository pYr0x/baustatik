/**
 * Die Rechnung — REIN UND SYNCHRON, der Loeser kommt als Funktion herein.
 *
 * ZWEI RANDWERTPROBLEME, EINE ZERLEGUNG, und mehr wird es auch mit Loechern
 * nicht:
 *
 * ```text
 * Torsion:  ∇²ω  = 0, Neumann   1 rechte Seite
 * Schub:    ∇²ψ  = 0, Neumann   4 rechte Seiten  (ψ₀ und ψ₁ je Lastrichtung)
 * ```
 *
 * FUENF RECHTE SEITEN AUF EINER MATRIX. Seit ADR 0048 laeuft auch das
 * Schubproblem ueber eine VERSCHIEBUNG statt ueber eine Spannungsfunktion, und
 * damit sind beide Probleme reines Neumann. Sie teilen sich deshalb nicht nur
 * die Zerlegung ueber beide Lastrichtungen — sie teilen sich die MATRIX. Die
 * frueher zweite, Dirichlet-gebundene Matrix des Schubs gibt es nicht mehr.
 *
 * WAS DAMIT ERSATZLOS WEGFAELLT: die Verweigerung `hole-off-bending-axis` samt
 * ihrer Maschinerie — Randdatum je Schleife, Lochindikatoren, Kopplungsmatrix,
 * dichtes `h × h`-System. Eine Spannungsfunktion ist je Randschleife nur bis
 * auf eine Konstante bestimmt, und ihr Randdatum muss beim Umlauf schliessen;
 * eine Verschiebung ist auf jedem Gebiet eindeutig. `disconnected-areas` bleibt
 * — das ist eine Aussage ueber das Stabmodell, keine ueber die Formulierung.
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
  assembleNeumannStiffness,
  createFrame,
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

/** κ als ν-freies Koeffizientenpaar und der Schubmittelpunkt. */
export type ShearResult = {
  readonly inverseKappaY: readonly [number, number];
  readonly inverseKappaZ: readonly [number, number];
  /** Im EINGABESYSTEM des Netzes, nicht schwerpunktsbezogen. */
  readonly yM: number;
  readonly zM: number;
};

/**
 * Die geloesten Felder, TRANSIENT — alles, was `recoverStresses` braucht und
 * sonst niemand (ADR 0061).
 *
 * Sie gehoeren so wenig in den Satz wie das Netz (ADR 0039): ein Feld hat die
 * Groesse des Netzes, und der Satz ist serialisierbar und versioniert
 * (ADR 0049). Sie fallen heute schon an; `torque` und `torqueSlope` standen bis
 * hierhin in `ShearEvaluation` und wurden verworfen.
 *
 * `FESection` REIST GANZ MIT, obwohl σ und τ `loops` und `isBoundary` nicht
 * brauchen: die Randdiagnosen brauchen beides, und eine zweite, engere
 * Sektionsform waere ein zweiter Typ fuer dieselbe Sache. Der Rand ist `O(√n)`.
 *
 * DER SCHUBMITTELPUNKT REIST NICHT MIT. Fuer das Momentengleichgewicht ist er
 * die falsche Zahl — dort zaehlt das rohe WEBER-Moment `torqueZ`/`torqueY` und
 * nicht die Trefftz-Projektion (ADR 0061).
 *
 * `prepareSection` LAEUFT NICHT ZWEIMAL. Nur die fuenf Vektoren
 * herauszugeben und in der Tuer neu vorzubereiten, gaebe einer reinen,
 * synchronen Funktion einen werfenden Pfad fuer etwas, das nachweislich schon
 * durchgelaufen ist.
 */
export type FEFields = {
  /** Das vorbereitete Netz — Koordinaten, `A`, `Iy`, `Iz`, `Iyz` und der Rand. */
  readonly section: FESection;
  /**
   * Drehwinkel in die Hauptachsen [rad] — VERTRAG, nicht Diagnose. Ohne ihn
   * sind `psi0Z` … `psi1Y` nicht interpretierbar.
   */
  readonly theta: number;
  /** Die Verwoelbung, DREHINVARIANT und im Eingabesystem. */
  readonly omega: Float64Array;
  /** Die vier Schubfelder, je Rahmen `ψ₀` und `ψ₁` (ADR 0048). */
  readonly psi0Z: Float64Array;
  readonly psi1Z: Float64Array;
  readonly psi0Y: Float64Array;
  readonly psi1Y: Float64Array;
  /** `It` [m4]. */
  readonly It: number;
  /**
   * `[torque, torqueSlope]` je Rahmen — das WEBER-Moment des EINHEITSFELDES,
   * `∫(y·τ_z − z·τ_y) dA`, affin in `m`.
   *
   * NICHT `yM`/`zM`: die tragen die Trefftz-Projektion ab und schliessen das
   * Momentengleichgewicht der Rueckrechnung um genau diesen Betrag falsch,
   * ohne dass etwas wirft (ADR 0061).
   */
  readonly torqueZ: readonly [number, number];
  readonly torqueY: readonly [number, number];
};

/** Was aus der Rechnung faellt, in den Einheiten des Netzes. */
export type FEResult = {
  /**
   * IMMER DA. Bis ADR 0048 konnte der Schub an einem Loch neben der Biegeachse
   * scheitern; die Verwoelbungsformulierung kennt diese Grenze nicht.
   */
  readonly shear: ShearResult;
  readonly It: number;
  readonly fields: FEFields;
  readonly diagnostics: FEDiagnostics;
};

/**
 * Die Selbstpruefungen. KEINE davon deckt den Netzfehler ab — dafuer sind die
 * Orakel da (ADR 0045).
 */
export type FEDiagnostics = {
  /** Drehwinkel in die Hauptachsen [rad]. */
  readonly theta: number;
  /** `∮(z·n_y − y·n_z) ds` — die Vertraeglichkeitsbedingung der Torsion. */
  readonly compatibility: number;
  /**
   * Der Rest von `∫f dA − ∮g ds` je rechter Seite des Schubs, bezogen auf die
   * Summe der Betraege.
   *
   * SCHAERFER ALS DER FRUEHERE RANDSCHLUSS: der war eine Eigenschaft der FIGUR
   * und brach an einem Loch neben der Biegeachse. Diese vier Zahlen sind
   * IDENTISCH null, und jeder Wert ueber Rauschniveau ist ein Fehler
   * (ADR 0048).
   */
  readonly compatibilityPsi0Z: number;
  readonly compatibilityPsi1Z: number;
  readonly compatibilityPsi0Y: number;
  readonly compatibilityPsi1Y: number;
  /** `∫τ_z dA` bei `m = 0`; muss `1` sein. */
  readonly equilibriumZ: number;
  readonly equilibriumY: number;
  /**
   * `d₁/d₀` je Richtung — beweisbar null, aber erst im Grenzwert.
   *
   * Seit ADR 0048 laeuft die Zahl gegen null statt identisch null zu sein
   * (rund `O(h³)`, siehe `evaluate.ts`). Sie prueft damit das FELD und nicht
   * mehr nur die Struktur der Formulierung.
   */
  readonly d1RatioZ: number;
  readonly d1RatioY: number;
  readonly holeCount: number;
};

/** Rechnet das vorbereitete Netz durch. Der Loeser wird EINMAL gerufen. */
export function computeFromMesh(
  section: FESection,
  solve: SparseSolve,
): FEResult {
  const system = assembleNeumannStiffness(section);
  const theta = principalRotation(section.Iy, section.Iz, section.Iyz);
  const frameZ = createFrame(section, system, theta);
  const frameY = createFrame(section, system, theta + Math.PI / 2);
  const torsion = torsionLoad(section, system);

  // `ω` IST DREHINVARIANT und steht deshalb neben den vier Schubfeldern statt
  // je Lastrichtung einmal: `z·n_y − y·n_z` ist das Kreuzprodukt `n × r` und
  // aendert sich unter einer Drehung des Bezugssystems nicht.
  const fields = [
    torsion.rhs,
    frameZ.rhsPsi0,
    frameZ.rhsPsi1,
    frameY.rhsPsi0,
    frameY.rhsPsi1,
  ];
  const rhs = new Float64Array(system.free * fields.length);
  for (let column = 0; column < fields.length; column += 1) {
    rhs.set(atOrThrow(fields, column), column * system.free);
  }

  const d = solve(
    system.free,
    system.rows,
    system.cols,
    system.values,
    fields.length,
    rhs,
  );
  const field = (column: number): Float64Array =>
    expand(
      section,
      system,
      d.subarray(column * system.free, (column + 1) * system.free),
    );

  const omega = field(0);
  const psi0Z = field(1);
  const psi1Z = field(2);
  const psi0Y = field(3);
  const psi1Y = field(4);
  const resultZ = evaluateShear(section, frameZ, psi0Z, psi1Z, omega);
  const resultY = evaluateShear(section, frameY, psi0Y, psi1Y, omega);

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
    fields: {
      section,
      theta,
      omega,
      psi0Z,
      psi1Z,
      psi0Y,
      psi1Y,
      It: resultZ.It,
      torqueZ: [resultZ.torque, resultZ.torqueSlope],
      torqueY: [resultY.torque, resultY.torqueSlope],
    },
    diagnostics: {
      theta,
      compatibility: torsion.compatibility,
      compatibilityPsi0Z: frameZ.compatibilityPsi0,
      compatibilityPsi1Z: frameZ.compatibilityPsi1,
      compatibilityPsi0Y: frameY.compatibilityPsi0,
      compatibilityPsi1Y: frameY.compatibilityPsi1,
      equilibriumZ: resultZ.Fz,
      equilibriumY: resultY.Fz,
      d1RatioZ: d1Ratio(resultZ),
      d1RatioY: d1Ratio(resultY),
      holeCount: section.holeLoops.length,
    },
  };
}

/**
 * Knotenwerte aus den freien Zeilen.
 *
 * Der eine gehaltene Knoten bekommt null. Das ist keine Randbedingung, sondern
 * die Eichung des reinen Neumann-Problems: `ψ` und `ω` sind bis auf eine
 * Konstante bestimmt, und weder `τ = ∇ψ + p` noch `It` sehen sie.
 */
function expand(
  section: FESection,
  system: StiffnessSystem,
  free: Float64Array,
): Float64Array {
  const field = new Float64Array(section.nodeCount);
  for (let node = 0; node < section.nodeCount; node += 1) {
    const row = atOrThrow(system.freeIndex, node);
    if (row >= 0) field[node] = atOrThrow(free, row);
  }
  return field;
}

function d1Ratio(result: ShearEvaluation): number {
  return result.E00 === 0 ? Number.NaN : (2 * result.E01) / result.E00;
}
