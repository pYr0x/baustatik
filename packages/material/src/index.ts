import { createMaterials } from './factory';

// Convenience factories pre-bound to the German National Annex (DE). This is
// the common case; use `createMaterials({ na })` for a different Annex.
const de = createMaterials({ na: 'DE' });

export const concrete = de.concrete;
export const steel = de.steel;
export const reinforcement = de.reinforcement;
export const timber = de.timber;

export type {
  Concrete,
  ConcreteDesignOptions,
  ConcreteDesignValues,
  ConcreteOptions,
} from './concrete';
export type { ConcreteGrade } from './data/concrete';
export type { DuctilityClass, ReinforcementGrade } from './data/reinforcement';
export type { SteelGrade } from './data/steel';
export type { TimberGrade } from './data/timber';
export {
  DesignValueRequiresContextError,
  UnknownGradeError,
  UnknownNationalAnnexError,
} from './errors';
export type { CreateMaterialsConfig, Materials } from './factory';
export { createMaterials } from './factory';
export {
  DE,
  EN,
  type NationalAnnexId,
  type NationalAnnexParams,
  resolveNationalAnnex,
} from './national-annex';
export type {
  Kgm3,
  KNm3,
  MPa,
  Percent,
  PerK,
  PerMille,
  Quantity,
} from './quantity';
export type {
  Reinforcement,
  ReinforcementDesignOptions,
  ReinforcementDesignValues,
} from './reinforcement';
export type {
  Steel,
  SteelDesignOptions,
  SteelDesignValues,
  SteelOptions,
} from './steel';
export type { Timber, TimberDesignContext, TimberDesignValues } from './timber';
export type {
  DesignSituation,
  LoadDuration,
  ServiceClass,
  SteelResistance,
  TimberProduct,
} from './types';
