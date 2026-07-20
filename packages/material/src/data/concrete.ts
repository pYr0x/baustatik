// Characteristic concrete properties — EN 1992-1-1:2004 Table 3.1.
// Cross-checked against pcachim/eurocodepy `eurocodes.json` (verified seed);
// C12/15 and C16/20 added from EN 1992-1-1 Table 3.1.
// Units: strengths & moduli in MPa; strains εc2/εcu2 in ‰ (per mille).

export interface ConcreteData {
  /** fck — characteristic cylinder compressive strength [MPa]. */
  readonly fck: number;
  /** fcm — mean compressive strength [MPa]. */
  readonly fcm: number;
  /** fctm — mean axial tensile strength [MPa]. */
  readonly fctm: number;
  /** fctk,0.05 — 5% fractile tensile strength [MPa]. */
  readonly fctk05: number;
  /** Ecm — secant modulus of elasticity [MPa]. */
  readonly Ecm: number;
  /** εc2 — strain at reaching maximum strength [‰]. */
  readonly epsc2: number;
  /** εcu2 — ultimate strain [‰]. */
  readonly epscu2: number;
  /** n — exponent of the parabola-rectangle diagram. */
  readonly n: number;
}

export const CONCRETE_DATA = {
  'C12/15': {
    fck: 12,
    fcm: 20,
    fctm: 1.6,
    fctk05: 1.1,
    Ecm: 27000,
    epsc2: 2.0,
    epscu2: 3.5,
    n: 2.0,
  },
  'C16/20': {
    fck: 16,
    fcm: 24,
    fctm: 1.9,
    fctk05: 1.3,
    Ecm: 29000,
    epsc2: 2.0,
    epscu2: 3.5,
    n: 2.0,
  },
  'C20/25': {
    fck: 20,
    fcm: 28,
    fctm: 2.2,
    fctk05: 1.5,
    Ecm: 30000,
    epsc2: 2.0,
    epscu2: 3.5,
    n: 2.0,
  },
  'C25/30': {
    fck: 25,
    fcm: 33,
    fctm: 2.6,
    fctk05: 1.8,
    Ecm: 31000,
    epsc2: 2.0,
    epscu2: 3.5,
    n: 2.0,
  },
  'C30/37': {
    fck: 30,
    fcm: 38,
    fctm: 2.9,
    fctk05: 2.0,
    Ecm: 33000,
    epsc2: 2.0,
    epscu2: 3.5,
    n: 2.0,
  },
  'C35/45': {
    fck: 35,
    fcm: 43,
    fctm: 3.2,
    fctk05: 2.2,
    Ecm: 34000,
    epsc2: 2.0,
    epscu2: 3.5,
    n: 2.0,
  },
  'C40/50': {
    fck: 40,
    fcm: 48,
    fctm: 3.5,
    fctk05: 2.5,
    Ecm: 35000,
    epsc2: 2.0,
    epscu2: 3.5,
    n: 2.0,
  },
  'C45/55': {
    fck: 45,
    fcm: 53,
    fctm: 3.8,
    fctk05: 2.7,
    Ecm: 36000,
    epsc2: 2.0,
    epscu2: 3.5,
    n: 2.0,
  },
  'C50/60': {
    fck: 50,
    fcm: 58,
    fctm: 4.1,
    fctk05: 2.9,
    Ecm: 37000,
    epsc2: 2.0,
    epscu2: 3.5,
    n: 2.0,
  },
  'C55/67': {
    fck: 55,
    fcm: 63,
    fctm: 4.2,
    fctk05: 3.0,
    Ecm: 38000,
    epsc2: 2.2,
    epscu2: 3.1,
    n: 1.75,
  },
  'C60/75': {
    fck: 60,
    fcm: 68,
    fctm: 4.4,
    fctk05: 3.1,
    Ecm: 39000,
    epsc2: 2.3,
    epscu2: 2.9,
    n: 1.6,
  },
  'C70/85': {
    fck: 70,
    fcm: 78,
    fctm: 4.6,
    fctk05: 3.2,
    Ecm: 41000,
    epsc2: 2.4,
    epscu2: 2.7,
    n: 1.45,
  },
  'C80/95': {
    fck: 80,
    fcm: 88,
    fctm: 4.8,
    fctk05: 3.4,
    Ecm: 42000,
    epsc2: 2.5,
    epscu2: 2.6,
    n: 1.4,
  },
  'C90/105': {
    fck: 90,
    fcm: 98,
    fctm: 5.0,
    fctk05: 3.5,
    Ecm: 44000,
    epsc2: 2.6,
    epscu2: 2.6,
    n: 1.4,
  },
} satisfies Record<string, ConcreteData>;

export type ConcreteGrade = keyof typeof CONCRETE_DATA;

// Grade-independent constants (EN 1991-1-1 / EN 1992-1-1).
/** Unit weight (Wichte) of reinforced concrete [kN/m³] — EN 1991-1-1 Table A.1. */
export const CONCRETE_UNIT_WEIGHT_REINFORCED = 25;
/** Unit weight (Wichte) of plain (unreinforced) concrete [kN/m³]. */
export const CONCRETE_UNIT_WEIGHT_PLAIN = 24;
/** Density of reinforced concrete [kg/m³] — EN 1991-1-1 Table A.1. */
export const CONCRETE_DENSITY_REINFORCED = 2500;
/** Density of plain (unreinforced) concrete [kg/m³]. */
export const CONCRETE_DENSITY_PLAIN = 2400;
/** Poisson's ratio for uncracked concrete — EN 1992-1-1 §3.1.3(4). */
export const CONCRETE_POISSON = 0.2;
/** Coefficient of linear thermal expansion [1/K] — EN 1992-1-1 §3.1.3(5). */
export const CONCRETE_THERMAL = 1e-5;
