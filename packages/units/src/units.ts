import type { UnitCategory, UnitDefinition } from './types';

export const GRAVITY = 9.81;

export const UNITS: Record<string, UnitDefinition> = {
  // ---- Length → mm ----
  mm: { category: 'length', toBase: 1 },
  cm: { category: 'length', toBase: 10 },
  dm: { category: 'length', toBase: 100 },
  m: { category: 'length', toBase: 1_000 },
  km: { category: 'length', toBase: 1_000_000 },

  // ---- Area → mm^2 ----
  'mm^2': { category: 'area', toBase: 1 },
  'cm^2': { category: 'area', toBase: 100 },
  'dm^2': { category: 'area', toBase: 10_000 },
  'm^2': { category: 'area', toBase: 1_000_000 },
  'km^2': { category: 'area', toBase: 1e12 },

  // ---- Volume → mm^3 ----
  'mm^3': { category: 'volume', toBase: 1 },
  'cm^3': { category: 'volume', toBase: 1_000 },
  'm^3': { category: 'volume', toBase: 1e9 },
  ml: { category: 'volume', toBase: 1_000 },
  l: { category: 'volume', toBase: 1_000_000 },

  // ---- Moment of Inertia → mm^4 ----
  'mm^4': { category: 'moment_of_inertia', toBase: 1 },
  'cm^4': { category: 'moment_of_inertia', toBase: 10_000 },
  'dm^4': { category: 'moment_of_inertia', toBase: 1e8 },
  'm^4': { category: 'moment_of_inertia', toBase: 1e12 },

  // ---- Mass → g ----
  g: { category: 'mass', toBase: 1 },
  kg: { category: 'mass', toBase: 1_000 },
  t: { category: 'mass', toBase: 1_000_000 },

  // ---- Force → N ----
  N: { category: 'force', toBase: 1 },
  kN: { category: 'force', toBase: 1_000 },
  MN: { category: 'force', toBase: 1_000_000 },

  // ---- Force/Length → N/mm ----
  'N/m': { category: 'force_per_length', toBase: 0.001 },
  'N/cm': { category: 'force_per_length', toBase: 0.1 },
  'N/mm': { category: 'force_per_length', toBase: 1 },
  'kN/m': { category: 'force_per_length', toBase: 1 },
  'kN/cm': { category: 'force_per_length', toBase: 100 },
  'kN/mm': { category: 'force_per_length', toBase: 1_000 },
  'MN/m': { category: 'force_per_length', toBase: 1_000 },
  'MN/cm': { category: 'force_per_length', toBase: 100_000 },
  'MN/mm': { category: 'force_per_length', toBase: 1_000_000 },

  // ---- Force/Area → N/mm^2 ----
  'N/m^2': { category: 'force_per_area', toBase: 0.000001 },
  'N/cm^2': { category: 'force_per_area', toBase: 0.01 },
  'N/mm^2': { category: 'force_per_area', toBase: 1 },
  'kN/m^2': { category: 'force_per_area', toBase: 0.001 },
  'kN/cm^2': { category: 'force_per_area', toBase: 10 },
  'kN/mm^2': { category: 'force_per_area', toBase: 1_000 },
  'MN/m^2': { category: 'force_per_area', toBase: 1 },
  'MN/cm^2': { category: 'force_per_area', toBase: 10_000 },
  'MN/mm^2': { category: 'force_per_area', toBase: 1_000_000 },
};

export const ATOMIC_UNITS: Partial<Record<UnitCategory, string>> = {
  length: 'mm',
  area: 'mm^2',
  volume: 'mm^3',
  moment_of_inertia: 'mm^4',
  mass: 'g',
  force: 'N',
  // force_per_length und force_per_area haben KEINEN Eintrag
  // → werden mit smartRound behandelt
};
