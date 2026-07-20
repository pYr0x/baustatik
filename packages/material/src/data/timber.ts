import type { Kgm3, MPa } from '../quantity';
import type { LoadDuration, ServiceClass, TimberProduct } from '../types';

// Characteristic timber properties — EN 338:2016 (solid timber C/D classes)
// and EN 14080:2013 (glued laminated timber GL classes).
// Cross-checked against pcachim/eurocodepy `eurocodes.json`.
// Units: strengths & moduli in MPa; densities in kg/m³.

export interface TimberData {
  /** Product family — selects the material partial factor γM. */
  readonly product: TimberProduct;
  /** Source standard for the characteristic values. */
  readonly standard: string;
  /** fm,k — bending strength [MPa]. */
  readonly fmk: MPa;
  /** ft,0,k — tension parallel to grain [MPa]. */
  readonly ft0k: MPa;
  /** ft,90,k — tension perpendicular to grain [MPa]. */
  readonly ft90k: MPa;
  /** fc,0,k — compression parallel to grain [MPa]. */
  readonly fc0k: MPa;
  /** fc,90,k — compression perpendicular to grain [MPa]. */
  readonly fc90k: MPa;
  /** fv,k — shear strength [MPa]. */
  readonly fvk: MPa;
  /** E0,mean — mean modulus parallel to grain [MPa]. */
  readonly E0mean: MPa;
  /** E0,05 — 5% fractile modulus parallel to grain [MPa]. */
  readonly E0k: MPa;
  /** E90,mean — mean modulus perpendicular to grain [MPa]. */
  readonly E90mean: MPa;
  /** Gmean — mean shear modulus [MPa]. */
  readonly Gmean: MPa;
  /** ρk — characteristic density [kg/m³]. */
  readonly rhok: Kgm3;
  /** ρmean — mean density [kg/m³]. */
  readonly rhomean: Kgm3;
}

export const TIMBER_DATA = {
  C16: {
    product: 'timber',
    standard: 'EN 338',
    fmk: 16,
    ft0k: 8.5,
    ft90k: 0.4,
    fc0k: 17,
    fc90k: 2.2,
    fvk: 3.2,
    E0mean: 8000,
    E0k: 5400,
    E90mean: 270,
    Gmean: 500,
    rhok: 310,
    rhomean: 370,
  },
  C18: {
    product: 'timber',
    standard: 'EN 338',
    fmk: 18,
    ft0k: 10,
    ft90k: 0.4,
    fc0k: 18,
    fc90k: 2.2,
    fvk: 3.4,
    E0mean: 9000,
    E0k: 6000,
    E90mean: 300,
    Gmean: 560,
    rhok: 320,
    rhomean: 380,
  },
  C24: {
    product: 'timber',
    standard: 'EN 338',
    fmk: 24,
    ft0k: 14.5,
    ft90k: 0.4,
    fc0k: 21,
    fc90k: 2.5,
    fvk: 4.0,
    E0mean: 11000,
    E0k: 7400,
    E90mean: 370,
    Gmean: 690,
    rhok: 350,
    rhomean: 420,
  },
  C30: {
    product: 'timber',
    standard: 'EN 338',
    fmk: 30,
    ft0k: 19,
    ft90k: 0.4,
    fc0k: 24,
    fc90k: 2.7,
    fvk: 4.0,
    E0mean: 11500,
    E0k: 7700,
    E90mean: 370,
    Gmean: 690,
    rhok: 380,
    rhomean: 460,
  },
  D24: {
    product: 'timber',
    standard: 'EN 338',
    fmk: 24,
    ft0k: 14,
    ft90k: 0.6,
    fc0k: 21,
    fc90k: 4.9,
    fvk: 3.7,
    E0mean: 10000,
    E0k: 8400,
    E90mean: 670,
    Gmean: 630,
    rhok: 485,
    rhomean: 580,
  },
  D30: {
    product: 'timber',
    standard: 'EN 338',
    fmk: 30,
    ft0k: 18,
    ft90k: 0.6,
    fc0k: 24,
    fc90k: 5.3,
    fvk: 3.9,
    E0mean: 11000,
    E0k: 9200,
    E90mean: 730,
    Gmean: 690,
    rhok: 530,
    rhomean: 640,
  },
  D40: {
    product: 'timber',
    standard: 'EN 338',
    fmk: 40,
    ft0k: 24,
    ft90k: 0.6,
    fc0k: 27,
    fc90k: 5.5,
    fvk: 4.2,
    E0mean: 13600,
    E0k: 10900,
    E90mean: 870,
    Gmean: 810,
    rhok: 550,
    rhomean: 660,
  },
  GL24h: {
    product: 'glulam',
    standard: 'EN 14080',
    fmk: 24,
    ft0k: 19.2,
    ft90k: 0.5,
    fc0k: 24,
    fc90k: 2.5,
    fvk: 3.5,
    E0mean: 11500,
    E0k: 9600,
    E90mean: 300,
    Gmean: 650,
    rhok: 385,
    rhomean: 460,
  },
  GL28h: {
    product: 'glulam',
    standard: 'EN 14080',
    fmk: 28,
    ft0k: 22.3,
    ft90k: 0.5,
    fc0k: 28,
    fc90k: 2.5,
    fvk: 3.5,
    E0mean: 12600,
    E0k: 10500,
    E90mean: 300,
    Gmean: 650,
    rhok: 425,
    rhomean: 460,
  },
  GL30h: {
    product: 'glulam',
    standard: 'EN 14080',
    fmk: 30,
    ft0k: 24,
    ft90k: 0.5,
    fc0k: 30,
    fc90k: 2.5,
    fvk: 3.5,
    E0mean: 13600,
    E0k: 11300,
    E90mean: 300,
    Gmean: 650,
    rhok: 430,
    rhomean: 480,
  },
} satisfies Record<string, TimberData>;

export type TimberGrade = keyof typeof TIMBER_DATA;

// kmod — modification factor for load duration and service class.
// EN 1995-1-1:2004 Table 3.1. Solid timber, glued laminated timber and LVL
// share the same values, so a single table covers both product families.
export const KMOD: Readonly<
  Record<ServiceClass, Readonly<Record<LoadDuration, number>>>
> = {
  SC1: {
    permanent: 0.6,
    'long-term': 0.7,
    'medium-term': 0.8,
    'short-term': 0.9,
    instantaneous: 1.1,
  },
  SC2: {
    permanent: 0.6,
    'long-term': 0.7,
    'medium-term': 0.8,
    'short-term': 0.9,
    instantaneous: 1.1,
  },
  SC3: {
    permanent: 0.5,
    'long-term': 0.55,
    'medium-term': 0.65,
    'short-term': 0.7,
    instantaneous: 0.9,
  },
};
