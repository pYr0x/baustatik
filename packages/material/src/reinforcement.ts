import {
  REINFORCEMENT_DATA,
  REINFORCEMENT_DENSITY,
  REINFORCEMENT_UNIT_WEIGHT,
  type DuctilityClass,
  type ReinforcementGrade,
} from './data/reinforcement';
import { lookupGrade } from './lookup';
import type { NationalAnnexParams } from './national-annex';
import type { DesignSituation } from './types';

export interface ReinforcementDesignOptions {
  /** Design situation; defaults to `persistent`. */
  readonly situation?: DesignSituation;
}

export interface ReinforcementDesignValues {
  /** fyd = fyk / γs [MPa]. */
  readonly fyd: number;
}

export interface Reinforcement {
  readonly grade: ReinforcementGrade;
  /** Ductility class (A/B/C). */
  readonly ductility: DuctilityClass;
  /** fyk — characteristic yield strength [MPa]. */
  readonly fyk: number;
  /** ftk — characteristic tensile strength [MPa]. */
  readonly ftk: number;
  /** εuk — characteristic strain at maximum force [%]. */
  readonly epsuk: number;
  /** Es — modulus of elasticity [MPa]. */
  readonly Es: number;
  /** γ — unit weight (Wichte) [kN/m³]. */
  readonly gamma: number;
  /** ρ — density [kg/m³]. */
  readonly density: number;
  /** fyd for the persistent/transient design situation [MPa]. */
  readonly fyd: number;
  /** Design values for an explicit design situation. */
  designValues(options?: ReinforcementDesignOptions): ReinforcementDesignValues;
}

export function makeReinforcement(
  na: NationalAnnexParams,
  rawGrade: string,
): Reinforcement {
  const { grade, data } = lookupGrade(
    'reinforcement',
    REINFORCEMENT_DATA,
    rawGrade,
  );

  const designValues = (
    opts: ReinforcementDesignOptions = {},
  ): ReinforcementDesignValues => ({
    fyd: data.fyk / na.reinforcement.gammaS[opts.situation ?? 'persistent'],
  });

  return Object.freeze({
    grade,
    ductility: data.ductility,
    fyk: data.fyk,
    ftk: data.ftk,
    epsuk: data.epsuk,
    Es: data.Es,
    gamma: REINFORCEMENT_UNIT_WEIGHT,
    density: REINFORCEMENT_DENSITY,
    fyd: designValues().fyd,
    designValues,
  });
}
