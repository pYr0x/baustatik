import {
  STEEL_DATA,
  STEEL_DENSITY,
  type SteelGrade,
  STEEL_POISSON,
  STEEL_THERMAL,
  STEEL_UNIT_WEIGHT,
} from './data/steel';
import { lookupGrade } from './lookup';
import type { NationalAnnexParams } from './national-annex';
import type { Kgm3, KNm3, MPa, PerK } from './quantity';
import type { SteelResistance } from './types';

/** Shear modulus of structural steel [MPa] — EN 1993-1-1 §3.2.6. */
export const STEEL_SHEAR_MODULUS: MPa = 81000;

/** Nominal thickness [mm] above which the reduced (`*40`) strengths apply. */
const THICKNESS_LIMIT = 40;

export interface SteelDesignOptions {
  /** Resistance/check type selecting γM; defaults to `M0` (cross-section). */
  readonly resistance?: SteelResistance;
}

export interface SteelDesignValues {
  /** fyd = fyk / γM(resistance) [MPa]. */
  readonly fyd: MPa;
  /** fud = fuk / γM2 [MPa]. */
  readonly fud: MPa;
}

export interface SteelOptions {
  /** Nominal element thickness [mm]; > 40 mm selects the reduced strengths. */
  readonly thickness?: number;
}

export interface Steel {
  readonly grade: SteelGrade;
  /** fyk — characteristic yield strength for the selected thickness [MPa]. */
  readonly fyk: MPa;
  /** fuk — characteristic ultimate strength for the selected thickness [MPa]. */
  readonly fuk: MPa;
  /** Es — modulus of elasticity [MPa]. */
  readonly Es: MPa;
  /** G — shear modulus [MPa]. */
  readonly G: MPa;
  /** ν — Poisson's ratio. */
  readonly nu: number;
  /** αT — thermal expansion coefficient [1/K]. */
  readonly alphaT: PerK;
  /** γ — unit weight (Wichte) [kN/m³]. */
  readonly gamma: KNm3;
  /** ρ — density [kg/m³]. */
  readonly density: Kgm3;
  /** fyd for cross-section resistance (γM0) [MPa]. */
  readonly fyd: MPa;
  /** Design values for an explicit resistance/check type. */
  designValues(options?: SteelDesignOptions): SteelDesignValues;
}

export function makeSteel(
  na: NationalAnnexParams,
  rawGrade: string,
  options: SteelOptions = {},
): Steel {
  const { grade, data } = lookupGrade('steel', STEEL_DATA, rawGrade);
  const thick =
    options.thickness !== undefined && options.thickness > THICKNESS_LIMIT;
  const fyk = thick ? data.fyk40 : data.fyk;
  const fuk = thick ? data.fuk40 : data.fuk;

  const designValues = (opts: SteelDesignOptions = {}): SteelDesignValues => ({
    fyd: fyk / na.steel.gammaM[opts.resistance ?? 'M0'],
    fud: fuk / na.steel.gammaM.M2,
  });

  return Object.freeze({
    grade,
    fyk,
    fuk,
    Es: data.Es,
    G: STEEL_SHEAR_MODULUS,
    nu: STEEL_POISSON,
    alphaT: STEEL_THERMAL,
    gamma: STEEL_UNIT_WEIGHT,
    density: STEEL_DENSITY,
    fyd: designValues().fyd,
    designValues,
  });
}
