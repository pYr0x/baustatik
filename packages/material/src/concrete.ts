import {
  CONCRETE_DATA,
  CONCRETE_DENSITY_PLAIN,
  CONCRETE_DENSITY_REINFORCED,
  CONCRETE_POISSON,
  CONCRETE_THERMAL,
  CONCRETE_UNIT_WEIGHT_PLAIN,
  CONCRETE_UNIT_WEIGHT_REINFORCED,
  type ConcreteGrade,
} from './data/concrete';
import { lookupGrade } from './lookup';
import type { NationalAnnexParams } from './national-annex';
import type { DesignSituation } from './types';

export interface ConcreteDesignOptions {
  /** Design situation; defaults to `persistent`. */
  readonly situation?: DesignSituation;
}

export interface ConcreteDesignValues {
  /** fcd = αcc · fck / γc [MPa]. */
  readonly fcd: number;
  /** fctd = αct · fctk,0.05 / γc [MPa]. */
  readonly fctd: number;
}

export interface ConcreteOptions {
  /** Reinforced concrete (25 kN/m³, default) vs. plain (24 kN/m³). */
  readonly reinforced?: boolean;
}

export interface Concrete {
  readonly grade: ConcreteGrade;
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
  /** εc2 — strain at maximum strength [‰]. */
  readonly epsc2: number;
  /** εcu2 — ultimate strain [‰]. */
  readonly epscu2: number;
  /** n — parabola-rectangle exponent. */
  readonly n: number;
  /** ν — Poisson's ratio. */
  readonly nu: number;
  /** αT — thermal expansion coefficient [1/K]. */
  readonly alphaT: number;
  /** γ — unit weight (Wichte) [kN/m³]. */
  readonly gamma: number;
  /** ρ — density [kg/m³]. */
  readonly density: number;
  /** fcd for the persistent/transient design situation [MPa]. */
  readonly fcd: number;
  /** Design values for an explicit design situation. */
  designValues(options?: ConcreteDesignOptions): ConcreteDesignValues;
}

function computeDesign(
  data: (typeof CONCRETE_DATA)[ConcreteGrade],
  na: NationalAnnexParams,
  situation: DesignSituation,
): ConcreteDesignValues {
  const gammaC = na.concrete.gammaC[situation];
  return {
    fcd: (na.concrete.alphaCc * data.fck) / gammaC,
    fctd: (na.concrete.alphaCt * data.fctk05) / gammaC,
  };
}

export function makeConcrete(
  na: NationalAnnexParams,
  rawGrade: string,
  options: ConcreteOptions = {},
): Concrete {
  const { grade, data } = lookupGrade('concrete', CONCRETE_DATA, rawGrade);
  const plain = options.reinforced === false;
  const gamma = plain
    ? CONCRETE_UNIT_WEIGHT_PLAIN
    : CONCRETE_UNIT_WEIGHT_REINFORCED;
  const density = plain ? CONCRETE_DENSITY_PLAIN : CONCRETE_DENSITY_REINFORCED;

  return Object.freeze({
    grade,
    fck: data.fck,
    fcm: data.fcm,
    fctm: data.fctm,
    fctk05: data.fctk05,
    Ecm: data.Ecm,
    epsc2: data.epsc2,
    epscu2: data.epscu2,
    n: data.n,
    nu: CONCRETE_POISSON,
    alphaT: CONCRETE_THERMAL,
    gamma,
    density,
    fcd: computeDesign(data, na, 'persistent').fcd,
    designValues: (opts: ConcreteDesignOptions = {}) =>
      computeDesign(data, na, opts.situation ?? 'persistent'),
  });
}
