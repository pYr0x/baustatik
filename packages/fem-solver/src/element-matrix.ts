/**
 * Was mit der lokalen 6x6 geschieht, bevor sie in die globale Matrix wandert:
 * ins globale System drehen.
 *
 * DAS IST THEORIEFREI. Hier steht keine Balkentheorie, sondern Matrixalgebra
 * auf dem, was `PreparedElement.stiffness()` liefert. Das ist die Grenze aus
 * `fem-element/src/types.ts`: „der Solver kennt nur dieses Interface und NIE
 * die Balkentheorie". Traete Euler-Bernoulli neben Timoshenko, aenderte sich an
 * dieser Datei nichts.
 *
 * DIE KONDENSATION STAND FRUEHER HIER und ist nach `@baustatik/fem-element`
 * gezogen ([ADR 0018](../../../docs/adr/0018-section-forces-from-equilibrium.md)):
 * ihre Umkehrung — die Endverformung eines freigesetzten Freiheitsgrads
 * zurueckrechnen — braucht die Zeilen und Lastwerte, wie sie unmittelbar vor
 * der jeweiligen Kondensation standen. Hin- und Rueckweg gehoeren damit in EINE
 * Hand. Was hier blieb, ist die ORCHESTRIERUNG: welcher Stab welche
 * Freisetzungen hat, reicht `prepareBeam` als Argument durch.
 *
 * Was blieb, kommt ausserdem NACH der Kondensation: das Gelenk ist am LOKALEN
 * Freiheitsgrad definiert (`releases.start.theta` meint die Verdrehung am
 * Stabanfang, `releases.start.u` das Gleiten laengs der STABachse), und nach
 * der Drehung gibt es diese Freiheitsgrade als eigene Zeilen nicht mehr.
 */

import type { Vector6 } from '@baustatik/fem-element';

/** Die lokalen Freiheitsgrade in fester Reihenfolge: u1 w1 t1 u2 w2 t2. */
export const DOF_PER_ELEMENT = 6;

/** Eine 6x6 als beschreibbares Array — die Rechenform von `Matrix6`. */
export type Mutable6x6 = number[][];

export function toMutable(rows: readonly (readonly number[])[]): Mutable6x6 {
  return rows.map((row) => [...row]);
}

/**
 * Die 6x6-Transformation lokal -> global, als zwei gleiche 3x3-Bloecke:
 *
 *   [[ cos, sin,  0],
 *    [-sin, cos,  0],
 *    [   0,   0, -1]]
 *
 * DAS MINUS IN DER DRITTEN ZEILE ist die eine Haelfte von `phiY = -theta`
 * (ADR 0005): am Knoten zeigt das globale y aus der Zeichenebene, `theta` in
 * `fem-element` zaehlt dagegen von +x nach +z. Die andere Haelfte sitzt in
 * `fem-load-resolve` (`my_e = -m`); beide zusammen heben sich auf, sodass global
 * wieder ankommt, was der Anwender eingegeben hat.
 *
 * Der Block hat `det = -1`, ist aber orthogonal — `T^-1 = T^T` gilt weiter, und
 * damit bleibt `T^T K T` gueltig.
 *
 * `cos`/`sin` sind Richtungskosinus der Stabachse, nicht aus einem Winkel
 * gerechnet: `atan2` und zurueck waere ein Umweg mit Rundungsverlust.
 */
export function transformationMatrix(cos: number, sin: number): Mutable6x6 {
  const T: Mutable6x6 = Array.from({ length: DOF_PER_ELEMENT }, () =>
    Array.from({ length: DOF_PER_ELEMENT }, () => 0),
  );
  for (const offset of [0, 3]) {
    T[offset + 0][offset + 0] = cos;
    T[offset + 0][offset + 1] = sin;
    T[offset + 1][offset + 0] = -sin;
    T[offset + 1][offset + 1] = cos;
    T[offset + 2][offset + 2] = -1;
  }
  return T;
}

/** `T^T K T` — die lokale Steifigkeit im globalen System. */
export function rotateStiffness(K: Mutable6x6, T: Mutable6x6): Mutable6x6 {
  const KT: Mutable6x6 = Array.from({ length: DOF_PER_ELEMENT }, () =>
    Array.from({ length: DOF_PER_ELEMENT }, () => 0),
  );
  for (let r = 0; r < DOF_PER_ELEMENT; r += 1) {
    for (let c = 0; c < DOF_PER_ELEMENT; c += 1) {
      let sum = 0;
      for (let k = 0; k < DOF_PER_ELEMENT; k += 1) {
        sum += K[r][k] * T[k][c];
      }
      KT[r][c] = sum;
    }
  }

  const result: Mutable6x6 = Array.from({ length: DOF_PER_ELEMENT }, () =>
    Array.from({ length: DOF_PER_ELEMENT }, () => 0),
  );
  for (let r = 0; r < DOF_PER_ELEMENT; r += 1) {
    for (let c = 0; c < DOF_PER_ELEMENT; c += 1) {
      let sum = 0;
      for (let k = 0; k < DOF_PER_ELEMENT; k += 1) {
        sum += T[k][r] * KT[k][c];
      }
      result[r][c] = sum;
    }
  }
  return result;
}

/** `T^T f` — der lokale Vektor im globalen System. */
export function rotateVector(f: readonly number[], T: Mutable6x6): number[] {
  const result = Array.from({ length: DOF_PER_ELEMENT }, () => 0);
  for (let r = 0; r < DOF_PER_ELEMENT; r += 1) {
    let sum = 0;
    for (let k = 0; k < DOF_PER_ELEMENT; k += 1) {
      sum += T[k][r] * f[k];
    }
    result[r] = sum;
  }
  return result;
}

/** `T d` — ein globaler Knotenvektor in lokalen Stabkomponenten. */
export function toLocalVector(d: readonly number[], T: Mutable6x6): Vector6 {
  const result = Array.from({ length: DOF_PER_ELEMENT }, () => 0);
  for (let r = 0; r < DOF_PER_ELEMENT; r += 1) {
    let sum = 0;
    for (let k = 0; k < DOF_PER_ELEMENT; k += 1) {
      sum += T[r][k] * d[k];
    }
    result[r] = sum;
  }
  return result as unknown as Vector6;
}
