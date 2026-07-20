// Characteristic structural steel properties — EN 1993-1-1:2005 Table 3.1
// (nominal yield fy and ultimate fu for hot-rolled structural steel).
// The `*40` values apply for nominal thickness 40 mm < t ≤ 80 mm.
// Cross-checked against pcachim/eurocodepy `eurocodes.json`.
// Units: strengths in MPa.

export interface StructuralSteelData {
  /** fyk — characteristic yield strength, t ≤ 40 mm [MPa]. */
  readonly fyk: number;
  /** fuk — characteristic ultimate strength, t ≤ 40 mm [MPa]. */
  readonly fuk: number;
  /** fyk for 40 mm < t ≤ 80 mm [MPa]. */
  readonly fyk40: number;
  /** fuk for 40 mm < t ≤ 80 mm [MPa]. */
  readonly fuk40: number;
  /** Es — modulus of elasticity [MPa]. */
  readonly Es: number;
}

export const STEEL_DATA = {
  S235: { fyk: 235, fuk: 360, fyk40: 215, fuk40: 360, Es: 210000 },
  S275: { fyk: 275, fuk: 430, fyk40: 255, fuk40: 410, Es: 210000 },
  S355: { fyk: 355, fuk: 490, fyk40: 335, fuk40: 470, Es: 210000 },
  S420: { fyk: 420, fuk: 520, fyk40: 390, fuk40: 520, Es: 210000 },
  S460: { fyk: 460, fuk: 540, fyk40: 430, fuk40: 540, Es: 210000 },
} satisfies Record<string, StructuralSteelData>;

export type SteelGrade = keyof typeof STEEL_DATA;

/** Unit weight (Wichte) of structural steel [kN/m³] — EN 1991-1-1 Table A.4. */
export const STEEL_UNIT_WEIGHT = 77;
/** Density of structural steel [kg/m³]. */
export const STEEL_DENSITY = 7850;
/** Poisson's ratio in the elastic range — EN 1993-1-1 §3.2.6. */
export const STEEL_POISSON = 0.3;
/** Coefficient of linear thermal expansion [1/K] — EN 1993-1-1 §3.2.6. */
export const STEEL_THERMAL = 1.2e-5;
