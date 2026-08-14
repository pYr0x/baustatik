/**
 * Das zweite Randwertproblem: die Verwoelbung `ω`.
 *
 * `∇²ω = 0` mit `∂ω/∂n = z·n_y − y·n_z` — NEUMANN, nicht Prandtl. Die
 * Prandtl-Spannungsfunktion braeuchte auf jedem Innenrand wieder eine
 * Konstante; `ω` ist eine physische Verschiebung und auf jedem Gebiet
 * eindeutig. Deshalb ist `It` von der Lochbedingung des Schubproblems
 * unberuehrt (ADR 0045).
 *
 * `ω` IST DREHINVARIANT. `z·n_y − y·n_z` ist das Kreuzprodukt `n × r` und
 * aendert sich unter einer Drehung des Bezugssystems nicht — das Feld wird
 * deshalb EINMAL geloest und in beiden Lastrichtungen ausgewertet.
 *
 * DER RANDUMLAUF GEHT UEBER ALLE SCHLEIFEN, auch die der Loecher. Wer nur den
 * Aussenrand nimmt, bekommt fuer den Kreisring ein `It`, das keine Formel
 * bestaetigt.
 */

import { atOrThrow } from '@baustatik/core';
import type { StiffnessSystem } from './assemble';
import type { FESection } from './prepare';
import { edgeShape, edgeShapeDerivatives, GAUSS_3 } from './tri6';

export type TorsionLoad = {
  /** Die rechte Seite auf den freien Knoten. */
  readonly rhs: Float64Array;
  /**
   * `∮(z·n_y − y·n_z) ds` ueber alle Schleifen.
   *
   * DIE VERTRAEGLICHKEITSBEDINGUNG: bei `∇²ω = 0` muss `∫f dA + ∮g ds = 0`
   * gelten, und `f` ist null. Was hier stehen bleibt, ist der schaerfste
   * Hinweis darauf, dass Randterm und Umlaufsinn zueinander passen.
   */
  readonly compatibility: number;
};

/**
 * Der Neumann-Randterm `∮(z·n_y − y·n_z)·N_i ds`.
 *
 * DREI-PUNKT-GAUSS JE RANDSEGMENT ueber die quadratische Kante: der Integrand
 * ist dort vom Grad 3.
 *
 * `n = (dz, −dy)/L` zeigt nach RECHTS und damit aus dem Material heraus, weil
 * `prepare.ts` den Aussenrand mathematisch positiv und jeden Innenrand negativ
 * orientiert. Die Laenge `L` kuerzt sich gegen `ds = L·dt` heraus — es wird
 * nirgends durch eine Kantenlaenge geteilt.
 */
export function torsionLoad(
  section: FESection,
  system: StiffnessSystem,
): TorsionLoad {
  const rhs = new Float64Array(system.free);
  let compatibility = 0;

  for (const loop of section.loops) {
    for (const [a, middle, b] of loop.edges) {
      const nodes: readonly [number, number, number] = [a, middle, b];
      for (const gauss of GAUSS_3) {
        const N = edgeShape(gauss.t);
        const dN = edgeShapeDerivatives(gauss.t);
        let yq = 0;
        let zq = 0;
        let dy = 0;
        let dz = 0;
        for (let i = 0; i < 3; i += 1) {
          const node = atOrThrow(nodes, i);
          const yi = atOrThrow(section.y, node);
          const zi = atOrThrow(section.z, node);
          yq += atOrThrow(N, i) * yi;
          zq += atOrThrow(N, i) * zi;
          dy += atOrThrow(dN, i) * yi;
          dz += atOrThrow(dN, i) * zi;
        }
        // `(z·n_y − y·n_z)·ds = z·dz + y·dy` — die Kantenlaenge kuerzt sich.
        const scaled = gauss.w * (zq * dz + yq * dy);
        compatibility += scaled;
        for (let i = 0; i < 3; i += 1) {
          const row = atOrThrow(system.freeIndex, atOrThrow(nodes, i));
          if (row < 0) continue;
          rhs[row] = atOrThrow(rhs, row) + scaled * atOrThrow(N, i);
        }
      }
    }
  }

  return { rhs, compatibility };
}
