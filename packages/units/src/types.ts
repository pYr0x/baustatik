export type UnitCategory =
  | 'length'
  | 'area'
  | 'volume'
  | 'moment_of_inertia'
  | 'mass'
  | 'force'
  | 'force_per_length'
  | 'force_per_area';

export interface UnitDefinition {
  category: UnitCategory;
  toBase: number;
}

export interface FromChain {
  to(target: string): number;
}

export interface ConvertChain {
  from(source: string): FromChain;
}
