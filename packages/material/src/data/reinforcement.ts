// Characteristic reinforcing steel (Betonstahl) properties — EN 1992-1-1:2004
// §3.2 and Annex C (Table C.1). ftk derived from the ductility class ratio
// k = (ft/fy)k: class A ≥ 1.05, B ≥ 1.08, C ≥ 1.15.
// NOTE: the eurocodepy seed has erroneous ftk values for some A/C grades
// (e.g. B500A = 805); these are corrected here from Annex C.
// Units: strengths in MPa; εuk in % (characteristic strain at maximum force).

import type { Kgm3, KNm3, MPa, Percent } from '../quantity';

export type DuctilityClass = 'A' | 'B' | 'C';

export interface ReinforcementData {
  /** Ductility class (EN 1992-1-1 Annex C). */
  readonly ductility: DuctilityClass;
  /** fyk — characteristic yield strength [MPa]. */
  readonly fyk: MPa;
  /** ftk — characteristic tensile strength [MPa]. */
  readonly ftk: MPa;
  /** εuk — characteristic strain at maximum force [%]. */
  readonly epsuk: Percent;
  /** Es — modulus of elasticity [MPa]. */
  readonly Es: MPa;
}

export const REINFORCEMENT_DATA = {
  B420A: { ductility: 'A', fyk: 420, ftk: 441, epsuk: 2.5, Es: 200000 },
  B420B: { ductility: 'B', fyk: 420, ftk: 453.6, epsuk: 5.0, Es: 200000 },
  B500A: { ductility: 'A', fyk: 500, ftk: 525, epsuk: 2.5, Es: 200000 },
  B500B: { ductility: 'B', fyk: 500, ftk: 540, epsuk: 5.0, Es: 200000 },
  B500C: { ductility: 'C', fyk: 500, ftk: 575, epsuk: 7.5, Es: 200000 },
  B550A: { ductility: 'A', fyk: 550, ftk: 577.5, epsuk: 2.5, Es: 200000 },
  B550B: { ductility: 'B', fyk: 550, ftk: 594, epsuk: 5.0, Es: 200000 },
} satisfies Record<string, ReinforcementData>;

export type ReinforcementGrade = keyof typeof REINFORCEMENT_DATA;

/** Unit weight (Wichte) of reinforcing steel [kN/m³] — EN 1991-1-1 Table A.4. */
export const REINFORCEMENT_UNIT_WEIGHT: KNm3 = 77;
/** Density of reinforcing steel [kg/m³]. */
export const REINFORCEMENT_DENSITY: Kgm3 = 7850;
