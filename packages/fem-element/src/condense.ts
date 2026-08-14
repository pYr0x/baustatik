/**
 * Statische Kondensation der freigesetzten Freiheitsgrade — und ihre Umkehrung.
 *
 * WARUM HIER UND NICHT IM SOLVER: die MECHANIK gehoert zur Formulierung, die
 * ORCHESTRIERUNG (welche Freiheitsgrade freigesetzt sind) zum Solver. Der Solver
 * reicht `ElementReleases` durch und bekommt eine Steifigkeit, einen Lastvektor
 * und — nach dem Loesen — die zurueckgerechneten Endverformungen. Nur so liegen
 * Hin- und Rueckweg in EINER Hand: die Rueckrechnung greift auf Zeilen und
 * Lastwerte zu, wie sie unmittelbar VOR der jeweiligen Kondensation standen,
 * und die kennt niemand ausser demjenigen, der kondensiert hat
 * ([ADR 0018](../../../docs/adr/0018-section-forces-from-equilibrium.md)).
 *
 * REIHENFOLGE: `prepare` kondensiert in aufsteigender DOF-Nummer, `evaluate`
 * rechnet in UMGEKEHRTER Reihenfolge zurueck. Der Grund steht an
 * `recoverEndDisplacements`.
 */

import { UnrestrainedElementError } from './errors';
import type { ElementReleases, Matrix6, Vector6 } from './types';

/** Die lokalen Freiheitsgrade in fester Reihenfolge: u1 w1 t1 u2 w2 t2. */
const DOF_COUNT = 6;

/**
 * Die sechs Freiheitsgrade unter den Namen aus ADR 0017 — dieselben Woerter,
 * die `Beam['releases']` in `@baustatik/fem` benutzt, damit eine Fehlermeldung
 * aus diesem Package im Modell wiederzufinden ist.
 */
const DOF_NAMES = [
  'start.u',
  'start.w',
  'start.theta',
  'end.u',
  'end.w',
  'end.theta',
] as const;

/**
 * Wie weit ein Pivot gegenueber seinem UNKONDENSIERTEN Wert einbrechen darf,
 * bevor der Freiheitsgrad als ungehalten gilt.
 *
 * Relativ und nicht `=== 0`, weil das exakte Ausloeschen nur im Lehrbuch exakt
 * ist: `12EI/L^3 - (12EI/L^3)^2/(12EI/L^3)` ergibt fuer krumme Zahlen einen
 * Rest in der Groessenordnung der Maschinengenauigkeit mal Pivot. Der wuerde
 * `> 0` bestehen und danach eine Division durch fast nichts ausloesen — genau
 * die stille, plausibel aussehende Zahl, die dieses Package verhindern soll.
 *
 * Die Schranke ist grosszuegig: eine ZULAESSIGE Kondensation senkt das Pivot um
 * einen Faktor der Groessenordnung 1 (beim Pendelstab `4EI/L -> 3EI/L`, bei
 * `w`+`theta` am selben Ende `4EI/L -> EI/L`). Zwischen `1/4` und `1e-9` liegen
 * neun Groessenordnungen Luft, in denen nichts Legitimes wohnt.
 */
const PIVOT_FLOOR = 1e-9;

/**
 * Die freigesetzten Freiheitsgrade als aufsteigende Indexliste.
 *
 * Die Reihenfolge `u, w, theta` je Ende ist dieselbe wie in `d_e`, in
 * `BeamEndReleases` (ADR 0017) und in `DOF_NAMES` — es gibt genau eine.
 */
export function releasedIndices(releases?: ElementReleases): number[] {
  const { start, end } = releases ?? {};
  const flags = [start?.u, start?.w, start?.theta, end?.u, end?.w, end?.theta];
  return flags.flatMap((flag, index) => (flag === true ? [index] : []));
}

/**
 * Was eine einzelne Kondensation fuer die Rueckrechnung hinterlaesst.
 *
 * Zeile UND Spalte, obwohl `K` symmetrisch ist: die integrierte Steifigkeit
 * (`gaussStiffness`) ist es nur bis auf Rundung, und eine Rueckrechnung, die
 * sich auf eine Symmetrie verlaesst, die numerisch nicht exakt gilt, ist eine
 * unnoetige Annahme fuer zwei gesparte Arrays.
 */
export type CondensationStep = {
  /** Welcher Freiheitsgrad. */
  index: number;
  /** `K[i][i]`, wie es VOR dieser Kondensation stand. */
  pivot: number;
  /** `K[i,:]`, wie sie VOR dieser Kondensation stand. */
  row: readonly number[];
  /** `K[:,i]`, wie sie VOR dieser Kondensation stand. */
  column: readonly number[];
};

/**
 * Rechnet die freigesetzten Freiheitsgrade aus `K` heraus.
 *
 *   K' = K - K[:,i] * K[i,:] / K[i,i]
 *
 * danach Zeile und Spalte `i` auf 0. Das Ergebnis ist die Steifigkeit des
 * Stabs, DER AN DIESER STELLE NICHTS UEBERTRAEGT — beim Biegemoment also ein
 * Gelenk.
 *
 * DAS PIVOT IST DAS TOR. Ein Pivot, das gegenueber seinem unkondensierten Wert
 * zusammengebrochen ist, heisst: der Block ist leergeraeumt, das Element hat
 * eine Starrkoerperbewegung IN SICH. `@baustatik/fem` beanstandet denselben
 * Befund als `UnrestrainedBeamError` schon am MODELL, aus der blossen
 * Freisetzungskombination; hier wird er GEMESSEN. Zwei Tore, wie bei
 * `check()`/`solve()`: dieses Package ist oeffentlich und darf sich nicht auf
 * einen fremden Pruefer verlassen (`error-handling-in-libraries.md`).
 *
 * `K` wird nicht veraendert; die Kopie geht als Ergebnis heraus.
 */
export function condenseStiffness(
  K0: Matrix6,
  indices: readonly number[],
): { K: Matrix6; steps: CondensationStep[] } {
  const K = K0.map((row) => [...row]);
  const steps: CondensationStep[] = [];

  for (const index of indices) {
    const pivot = K[index][index];
    if (!(pivot > PIVOT_FLOOR * K0[index][index])) {
      throw new UnrestrainedElementError(
        DOF_NAMES[index],
        pivot,
        K0[index][index],
      );
    }

    // Zeile UND Spalte werden vorher festgehalten: die Schleife schreibt auch
    // in Zeile `index` selbst, und wer dort waehrend des Laufs liest, rechnet
    // fuer alle spaeteren Zeilen mit einer bereits genullten Pivotzeile weiter.
    const row = [...K[index]];
    const column = K.map((r) => r[index]);

    for (let r = 0; r < DOF_COUNT; r += 1) {
      for (let c = 0; c < DOF_COUNT; c += 1) {
        K[r][c] -= (column[r] * row[c]) / pivot;
      }
    }
    for (let k = 0; k < DOF_COUNT; k += 1) {
      K[index][k] = 0;
      K[k][index] = 0;
    }

    steps.push({ index, pivot, row, column });
  }

  return { K: K as unknown as Matrix6, steps };
}

/**
 * Dasselbe fuer den Ersatzknotenvektor, entlang der bereits gelaufenen Schritte.
 *
 *   f' = f - K[:,i] * f[i] / K[i,i]
 *
 * `f` MUSS mitkondensiert werden. Wer nur `K` kondensiert, bekommt fuer eine
 * Gleichlast auf einem Gelenkstab falsche Ersatzknotenlasten: der Anteil, den
 * der freigesetzte Freiheitsgrad getragen haette, verteilt sich nicht auf die
 * uebrigen, sondern verschwindet. Das ergibt plausible, falsche Zahlen.
 *
 * ZURUECKGEGEBEN WIRD AUCH `pivotLoads` — `f[i]`, wie es unmittelbar vor der
 * Kondensation von `i` stand. Ohne diese Zahlen ist die Endverformung des
 * freigesetzten Freiheitsgrads nicht rekonstruierbar; sie ist der Grund, warum
 * die Last GEBUNDEN wird (`withLoad`) statt bei jedem Aufruf neu
 * hereinzukommen.
 */
export function condenseLoad(
  f0: Vector6,
  steps: readonly CondensationStep[],
): { f: Vector6; pivotLoads: number[] } {
  const f = [...f0];
  const pivotLoads: number[] = [];

  for (const { index, pivot, column } of steps) {
    const value = f[index];
    pivotLoads.push(value);
    const share = value / pivot;
    for (let r = 0; r < DOF_COUNT; r += 1) {
      f[r] -= column[r] * share;
    }
    f[index] = 0;
  }

  return { f: f as unknown as Vector6, pivotLoads };
}

/**
 * Die Umkehrung: die Endverformung der freigesetzten Freiheitsgrade aus den
 * uebrigen zurueckrechnen.
 *
 *   d_i = (f[i] - sum_{j != i} K[i,j] * d_j) / K[i,i]
 *
 * — mit `K[i,:]`, `f[i]` und `K[i,i]` GENAU SO, wie sie vor der Kondensation
 * von `i` standen. Das ist die Zeile, die beim Kondensieren als „traegt nichts
 * mehr bei" weggeworfen wurde; sie sagt weiterhin, wohin sich das Stabende
 * bewegt, denn eine freigesetzte Richtung ist kraeftefrei, nicht bewegungsfrei.
 *
 * IN UMGEKEHRTER KONDENSATIONSREIHENFOLGE, und das ist mehr als „die Pivotzeile
 * aufheben": bei `start.u` und `start.theta` steht in der aufgehobenen Zeile 2
 * bereits eine Null in Spalte 0 (die Kondensation von `u1` hat sie genullt),
 * aber die Originalzeile 0 traegt sehr wohl noch einen Eintrag in Spalte 2.
 * Also erst `theta1`, dann `u1` — vorwaerts gerechnet fehlte im ersten Schritt
 * ein Wert.
 *
 * `dLocal` traegt an den freigesetzten Stellen den Wert des KNOTENS. Der ist
 * dort bedeutungslos (das Element ist von ihm abgekoppelt) und wird ueberschrieben.
 */
export function recoverEndDisplacements(
  dLocal: Vector6,
  steps: readonly CondensationStep[],
  pivotLoads: readonly number[],
): Vector6 {
  const d = [...dLocal];

  for (let k = steps.length - 1; k >= 0; k -= 1) {
    const { index, pivot, row } = steps[k];
    let sum = pivotLoads[k];
    for (let j = 0; j < DOF_COUNT; j += 1) {
      if (j !== index) sum -= row[j] * d[j];
    }
    d[index] = sum / pivot;
  }

  return d as unknown as Vector6;
}

/**
 * `K d - f`, beides KONDENSIERT — die Stabendkraefte in DOF-Richtung.
 *
 * Kondensiert und nicht original: das ist die Matrix, mit der assembliert und
 * geloest wurde, und nur so faellt an einem freigesetzten Freiheitsgrad EXAKT 0
 * heraus (Zeile und `f` sind dort null) statt „fast 0 aus der Rueckrechnung".
 * Mit der Originalmatrix und den zurueckgerechneten Endverformungen kaeme
 * dasselbe heraus — bis auf Rundung, und das ist der Unterschied.
 */
export function endForces(K: Matrix6, d: Vector6, f: Vector6): Vector6 {
  const result: number[] = [];
  for (let r = 0; r < DOF_COUNT; r += 1) {
    let sum = 0;
    for (let c = 0; c < DOF_COUNT; c += 1) {
      sum += K[r][c] * d[c];
    }
    result.push(sum - f[r]);
  }
  return result as unknown as Vector6;
}
