/**
 * Die beiden Steifigkeits-Bauer des Timoshenko-Elements.
 *
 * Sie sind austauschbar: `timoshenko.ts` injiziert einen von beiden und baut
 * daraus `Timoshenko2D` (geschlossen, Default) bzw. `Timoshenko2DIntegrated`
 * (per Gauss integriert). Alles andere — phi-Normalisierung, Ansatzfunktionen,
 * konsistenter Lastvektor — ist bei beiden identisch; sie unterscheiden sich in
 * GENAU dieser einen Funktion. Begruendung in
 * `docs/adr/0004-timoshenko-closed-and-integrated-stiffness.md`.
 */

import { gauss3 } from './gauss';
import { shapeFunctionsAt } from './shape-functions';
import type { Matrix6, Vector6 } from './types';

/** Bereits normalisierte Eingaben eines gebundenen Elements. */
export type StiffnessInput = {
  /** Dehnsteifigkeit E*A [kN]. */
  EA: number;
  /** Biegesteifigkeit E*I [kNm^2]. */
  EI: number;
  /**
   * Effektive Schubsteifigkeit kappa*G*A [kN] als Zahl; `Infinity` fuer
   * schubstarr. Wird ausschliesslich vom integrierten Bauer und dort nur im
   * Zweig `phi !== 0` gelesen, wo sie garantiert endlich ist.
   */
  GAs: number;
  /** Elementlaenge [m]. */
  L: number;
  /** Schubparameter, 0 = schubstarr. */
  phi: number;
};

/** Signatur, ueber die `timoshenko.ts` den Bauer injiziert. */
export type StiffnessBuilder = (input: StiffnessInput) => Matrix6;

function toMatrix6(k: number[][]): Matrix6 {
  const row = (r: number[]): Vector6 => [r[0], r[1], r[2], r[3], r[4], r[5]];

  return [row(k[0]), row(k[1]), row(k[2]), row(k[3]), row(k[4]), row(k[5])];
}

/**
 * Geschlossene Timoshenko-Steifigkeit (Produktiv-Default).
 *
 * `GAs` taucht hier NICHT auf — nur phi, und das ist an genau einer Stelle
 * normalisiert. Deshalb ist der schubstarre Fall exakt und nicht bloss
 * naeherungsweise: bei phi = 0 ist `1 + phi` exakt 1 und `(4 + phi)` exakt 4,
 * sodass jede Zahl elementweise identisch zur geschlossenen
 * Euler-Bernoulli-Referenz herauskommt (`tests/references/euler-bernoulli.ts`).
 * Die Klammerung ist bewusst dieselbe wie dort — andere Assoziativitaet wuerde
 * die FP-Exaktheit im letzten Bit brechen.
 */
export function closedStiffness({ EA, EI, L, phi }: StiffnessInput): Matrix6 {
  const ka = EA / L;
  const kb = EI / (L * L * L * (1 + phi));
  const L2 = L * L;
  const a = (4 + phi) * L2 * kb;
  const b = (2 - phi) * L2 * kb;

  return [
    [ka, 0, 0, -ka, 0, 0],
    [0, 12 * kb, 6 * L * kb, 0, -12 * kb, 6 * L * kb],
    [0, 6 * L * kb, a, 0, -6 * L * kb, b],
    [-ka, 0, 0, ka, 0, 0],
    [0, -12 * kb, -6 * L * kb, 0, 12 * kb, -6 * L * kb],
    [0, 6 * L * kb, b, 0, -6 * L * kb, a],
  ];
}

/**
 * Steifigkeit durch numerische Integration aus den Ansatzfunktionen:
 *
 *   K = int(EA * Ba^T Ba) + int(EI * Bb^T Bb) + int(GAs * Bs^T Bs)
 *
 * mit `Ba = dNu` (Dehnung), `Bb = dNtheta` (Kruemmung) und
 * `Bs = dNw - Ntheta` (Schubverzerrung gamma). Hoechster Integrandgrad ist 2,
 * also ist 3-Punkt-Gauss exakt.
 *
 * DER phi=0-ZWEIG: hier — und nur hier — steht `GAs` als roher Faktor. Fuer den
 * schubstarren Fall ist das analytisch harmlos, weil `gamma` proportional zu phi
 * ist und der Schubanteil `GAs * gamma^2 ~ EI * phi / L^2` fuer phi -> 0 exakt
 * gegen 0 geht. IEEE-754 kann diese hebbare Singularitaet aber nicht kuerzen:
 * numerisch stuende dort `Infinity * 0 = NaN`. Der Term wird deshalb bei
 * phi === 0 uebersprungen, was genau der analytische Grenzwert ist. Der Test
 * auf exakte Null traegt, weil `prepare()` 'rigid'/Infinity auf exakt 0
 * abbildet — kein Epsilon noetig.
 */
export function gaussStiffness({
  EA,
  EI,
  GAs,
  L,
  phi,
}: StiffnessInput): Matrix6 {
  const k: number[][] = Array.from({ length: 6 }, () =>
    Array.from({ length: 6 }, () => 0),
  );

  for (const gp of gauss3(0, L)) {
    const n = shapeFunctionsAt(gp.x, L, phi);
    const shear = phi === 0 ? undefined : n.dNw.map((v, i) => v - n.Ntheta[i]);

    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        const axial = EA * n.dNu[i] * n.dNu[j];
        const bending = EI * n.dNtheta[i] * n.dNtheta[j];
        const s = shear ? GAs * shear[i] * shear[j] : 0;
        k[i][j] += gp.w * (axial + bending + s);
      }
    }
  }

  return toMatrix6(k);
}
