import { UnknownNationalAnnexError } from './errors';
import type { DesignSituation, SteelResistance, TimberProduct } from './types';

/**
 * A National Annex parameter set: the partial safety factors and reduction
 * coefficients that turn characteristic values into design values. Only the
 * NA-dependent policy lives here — never the characteristic material data.
 */
export interface NationalAnnexParams {
  /** Human-readable id, e.g. "DE" or a custom label. */
  readonly id: string;
  readonly concrete: {
    /** αcc — long-term/compression reduction (DE NA: 0.85; EN rec.: 1.0). */
    readonly alphaCc: number;
    /** αct — tensile reduction (DE NA: 0.85; EN rec.: 1.0). */
    readonly alphaCt: number;
    /** γc by design situation. */
    readonly gammaC: Readonly<Record<DesignSituation, number>>;
  };
  readonly reinforcement: {
    /** γs by design situation. */
    readonly gammaS: Readonly<Record<DesignSituation, number>>;
  };
  readonly steel: {
    /** γM by resistance/check type (DE NA: γM1 = 1.1; EN rec.: 1.0). */
    readonly gammaM: Readonly<Record<SteelResistance, number>>;
  };
  readonly timber: {
    /** γM by product for persistent/transient situations. */
    readonly gammaM: Readonly<Record<TimberProduct, number>>;
    /** γM for accidental situations (EN 1995-1-1: 1.0). */
    readonly gammaMAccidental: number;
  };
}

/**
 * German National Annex (DIN EN 1992/1993/1995-1-1/NA).
 * Key divergences from the EN-recommended values: αcc = αct = 0.85, γM1 = 1.1.
 */
export const DE: NationalAnnexParams = {
  id: 'DE',
  concrete: {
    alphaCc: 0.85,
    alphaCt: 0.85,
    gammaC: { persistent: 1.5, accidental: 1.2 },
  },
  reinforcement: {
    gammaS: { persistent: 1.15, accidental: 1.0 },
  },
  steel: {
    gammaM: { M0: 1.0, M1: 1.1, M2: 1.25 },
  },
  timber: {
    gammaM: { timber: 1.3, glulam: 1.25 },
    gammaMAccidental: 1.0,
  },
};

/**
 * EN-recommended values (the base Eurocode recommendations, as used by
 * eurocodepy). Provided for comparison; not the default.
 */
export const EN: NationalAnnexParams = {
  id: 'EN',
  concrete: {
    alphaCc: 1.0,
    alphaCt: 1.0,
    gammaC: { persistent: 1.5, accidental: 1.2 },
  },
  reinforcement: {
    gammaS: { persistent: 1.15, accidental: 1.0 },
  },
  steel: {
    gammaM: { M0: 1.0, M1: 1.0, M2: 1.25 },
  },
  timber: {
    gammaM: { timber: 1.3, glulam: 1.25 },
    gammaMAccidental: 1.0,
  },
};

export type NationalAnnexId = 'DE' | 'EN';

const BUILT_IN: Record<NationalAnnexId, NationalAnnexParams> = { DE, EN };

/** Resolve a built-in id or a custom parameter object into a parameter set. */
export function resolveNationalAnnex(
  na: NationalAnnexId | NationalAnnexParams,
): NationalAnnexParams {
  if (typeof na === 'string') {
    const params = BUILT_IN[na];
    if (!params) {
      throw new UnknownNationalAnnexError(na, Object.keys(BUILT_IN));
    }
    return params;
  }
  return na;
}
