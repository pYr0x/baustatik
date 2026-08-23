import {
  type CrossSection,
  type SectionProperties,
  sectionProperties,
  type StressPoint,
  stressPoints,
} from '@baustatik/cross-section';
import type { SectionForces } from '@baustatik/section-forces';
import { TorsionNotSupportedError } from './errors';
import { type BendingDenominator, field } from './field';
import type { StressAtPoint } from './types';
import { CM3_TO_MM3, KN_TO_N, KNM_TO_NMM, M2_TO_MM2, M4_TO_MM4 } from './units';

/**
 * Die Spannungen an einer Liste von Spannungspunkten.
 *
 * ```text
 * D  = Iy·Iz − Iyz²
 * σ  = N/A + cy·y + cz·z          mit (cy, cz)   = field(My, Mz)
 * q  = −(c'y·Sz + c'z·Sy)         mit (c'y, c'z) = field(Vz, −Vy)
 * τ  = q / t
 * σv = sqrt(σ² + 3τ²)
 * ```
 *
 * DIE GETRENNTEN ARGUMENTE SIND KEIN VERSEHEN. Zusammen kommen die beiden aus
 * `sectionStresses`; getrennt lassen sie sich mit erfundenen
 * `SectionProperties` und handgemachten Punkten aufrufen — und nur so ist der
 * `Iyz`-Zweig überhaupt prüfbar, weil jede Form, die heute Spannungspunkte
 * liefert, mindestens einfach symmetrisch ist.
 *
 * BEWUSST UNGESCHUETZT SIND `D === 0` UND `A === 0`. Für jedes
 * `SectionProperties`, das `@baustatik/cross-section` erzeugt, gilt `D > 0` und
 * `A > 0` — `sectionProperties()` ist das Gate, und ein zweites daneben wären
 * zwei Antworten auf „ist dieser Querschnitt brauchbar". Synthetische Eingabe
 * ist Sache des Aufrufers.
 *
 * @throws {TorsionNotSupportedError} wenn `Mt` gesetzt und nicht null ist.
 */
export function stressesAtPoints(
  properties: SectionProperties,
  points: readonly StressPoint[],
  forces: SectionForces,
): readonly StressAtPoint[] {
  if (forces.Mt !== undefined && forces.Mt !== 0) {
    throw new TorsionNotSupportedError(forces.Mt);
  }

  // DIE EINE EINGANGSSCHLEUSE, je Quelle eine Zeile. Ab hier ist alles mm und
  // N, und der Ausgang ist die Identität: `N/mm²` IST MPa.
  const A = properties.A * M2_TO_MM2;
  const denominator = bendingDenominator(properties);

  const N = (forces.N ?? 0) * KN_TO_N;
  const bending = field(
    denominator,
    (forces.My ?? 0) * KNM_TO_NMM,
    (forces.Mz ?? 0) * KNM_TO_NMM,
  );
  // `Vz` steht an der Stelle von `My`, `−Vy` an der von `Mz` — der Schubfluss
  // ist σ mit genau dieser Ersetzung (ADR 0058/0060).
  const shear = field(
    denominator,
    (forces.Vz ?? 0) * KN_TO_N,
    -(forces.Vy ?? 0) * KN_TO_N,
  );

  return Object.freeze(
    points.map((p) => {
      const sigma = N / A + bending.cy * p.y + bending.cz * p.z;
      const q = -(shear.cy * p.Sz * CM3_TO_MM3 + shear.cz * p.Sy * CM3_TO_MM3);
      const tau = q / p.t;

      return Object.freeze({
        nr: p.nr,
        wall: p.wall,
        y: p.y,
        z: p.z,
        // `+ 0` macht aus `-0` eine Null — dieselbe Massnahme wie in
        // `stressPoint()` nebenan: gerechnete Vorzeichen liefern an den
        // Nullstellen `-0`, eine Zahl, die sich wie null verhält, sich aber
        // „-0" druckt und an `Object.is` scheitert.
        sigma: sigma + 0,
        tau: tau + 0,
        sigmaV: Math.sqrt(sigma * sigma + 3 * tau * tau),
        ty: p.ty,
        tz: p.tz,
      });
    }),
  );
}

/**
 * Die Spannungen eines Querschnitts — der Weg über beide Türen von
 * `@baustatik/cross-section` in einem Aufruf.
 *
 * `undefined` IST GEERBT, NICHT ERFUNDEN, und es hat drei Gründe: die
 * gezeichnete Geometrie (keine Vorlage), die parametrische Vollfigur (kein
 * Schnittmodell, ADR 0057) und ungültige Abmessungen. Alle drei enden bei
 * `stressPoints()` beziehungsweise `sectionProperties()`; dieses Package
 * unterscheidet sie nicht und stopft keinen der drei Fälle.
 *
 * @throws {TorsionNotSupportedError} wenn `Mt` gesetzt und nicht null ist.
 */
export function sectionStresses(
  cs: CrossSection,
  forces: SectionForces,
): readonly StressAtPoint[] | undefined {
  const points = stressPoints(cs);
  if (points === undefined) return undefined;

  const properties = sectionProperties(cs);
  if (properties === undefined) return undefined;

  return stressesAtPoints(properties, points, forces);
}

/** Der Nenner beider Formeln, aus SI-Metern in die mm-Rechnung geholt. */
function bendingDenominator(p: SectionProperties): BendingDenominator {
  const Iy = p.Iy * M4_TO_MM4;
  const Iz = p.Iz * M4_TO_MM4;
  const Iyz = p.Iyz * M4_TO_MM4;

  return { Iy, Iz, Iyz, D: Iy * Iz - Iyz * Iyz };
}
