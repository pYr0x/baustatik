import { type Concrete, type ConcreteOptions, makeConcrete } from './concrete';
import type { ConcreteGrade } from './data/concrete';
import type { ReinforcementGrade } from './data/reinforcement';
import type { SteelGrade } from './data/steel';
import type { TimberGrade } from './data/timber';
import {
  type NationalAnnexId,
  type NationalAnnexParams,
  resolveNationalAnnex,
} from './national-annex';
import { makeReinforcement, type Reinforcement } from './reinforcement';
import { makeSteel, type Steel, type SteelOptions } from './steel';
import { makeTimber, type Timber } from './timber';

export interface CreateMaterialsConfig {
  /** Built-in National Annex id or a full custom parameter set. */
  readonly na: NationalAnnexId | NationalAnnexParams;
}

/** Material factories bound to a single National Annex. */
export interface Materials {
  /** The resolved National Annex these factories are bound to. */
  readonly na: NationalAnnexParams;
  concrete(grade: ConcreteGrade, options?: ConcreteOptions): Concrete;
  steel(grade: SteelGrade, options?: SteelOptions): Steel;
  reinforcement(grade: ReinforcementGrade): Reinforcement;
  timber(grade: TimberGrade): Timber;
}

/**
 * Create a set of material factories bound to a National Annex. The returned
 * factories are closures over the resolved Annex — there is no global mutable
 * configuration (see docs/adr/0002).
 */
export function createMaterials(config: CreateMaterialsConfig): Materials {
  const na = resolveNationalAnnex(config.na);
  return {
    na,
    concrete: (grade, options) => makeConcrete(na, grade, options),
    steel: (grade, options) => makeSteel(na, grade, options),
    reinforcement: (grade) => makeReinforcement(na, grade),
    timber: (grade) => makeTimber(na, grade),
  };
}
