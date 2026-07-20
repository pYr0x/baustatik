import { KMOD, TIMBER_DATA, type TimberGrade } from './data/timber';
import { DesignValueRequiresContextError } from './errors';
import { lookupGrade } from './lookup';
import type { NationalAnnexParams } from './national-annex';
import type {
  DesignSituation,
  LoadDuration,
  ServiceClass,
  TimberProduct,
} from './types';

export interface TimberDesignContext {
  /** Load-duration class (EN 1995-1-1) — selects kmod. */
  readonly loadDuration: LoadDuration;
  /** Service class (EN 1995-1-1) — selects kmod. */
  readonly serviceClass: ServiceClass;
  /** Design situation; defaults to `persistent`. */
  readonly situation?: DesignSituation;
}

export interface TimberDesignValues {
  /** kmod — modification factor for load duration and service class. */
  readonly kmod: number;
  /** γM — material partial safety factor for the situation/product. */
  readonly gammaM: number;
  /** fm,d = kmod · fm,k / γM [MPa]. */
  readonly fmd: number;
  /** ft,0,d = kmod · ft,0,k / γM [MPa]. */
  readonly ft0d: number;
  /** fc,0,d = kmod · fc,0,k / γM [MPa]. */
  readonly fc0d: number;
  /** fv,d = kmod · fv,k / γM [MPa]. */
  readonly fvd: number;
}

export interface Timber {
  readonly grade: TimberGrade;
  /** Product family (timber / glulam). */
  readonly product: TimberProduct;
  /** fm,k — bending strength [MPa]. */
  readonly fmk: number;
  /** ft,0,k — tension parallel to grain [MPa]. */
  readonly ft0k: number;
  /** ft,90,k — tension perpendicular to grain [MPa]. */
  readonly ft90k: number;
  /** fc,0,k — compression parallel to grain [MPa]. */
  readonly fc0k: number;
  /** fc,90,k — compression perpendicular to grain [MPa]. */
  readonly fc90k: number;
  /** fv,k — shear strength [MPa]. */
  readonly fvk: number;
  /** E0,mean — mean modulus parallel to grain [MPa]. */
  readonly E0mean: number;
  /** E0,05 — 5% fractile modulus parallel to grain [MPa]. */
  readonly E0k: number;
  /** E90,mean — mean modulus perpendicular to grain [MPa]. */
  readonly E90mean: number;
  /** Gmean — mean shear modulus [MPa]. */
  readonly Gmean: number;
  /** ρk — characteristic density [kg/m³]. */
  readonly rhok: number;
  /** ρmean — mean density [kg/m³]. */
  readonly rhomean: number;
  /**
   * Design values require an explicit load-duration and service class — timber
   * has no default kmod, so there is deliberately no bare `fmd`/`ft0d`/… .
   */
  designValues(context: TimberDesignContext): TimberDesignValues;
}

// Names that only exist as design values; reading them without a context is a
// programming error. Present at runtime as throwing getters so untyped JS
// consumers get a clear error instead of `undefined`.
const GUARDED_DESIGN_VALUES = ['fmd', 'ft0d', 'fc0d', 'fvd', 'kmod'] as const;

export function makeTimber(na: NationalAnnexParams, rawGrade: string): Timber {
  const { grade, data } = lookupGrade('timber', TIMBER_DATA, rawGrade);

  const designValues = (ctx: TimberDesignContext): TimberDesignValues => {
    const kmod = KMOD[ctx.serviceClass][ctx.loadDuration];
    const gammaM =
      ctx.situation === 'accidental'
        ? na.timber.gammaMAccidental
        : na.timber.gammaM[data.product];
    const factor = kmod / gammaM;
    return {
      kmod,
      gammaM,
      fmd: factor * data.fmk,
      ft0d: factor * data.ft0k,
      fc0d: factor * data.fc0k,
      fvd: factor * data.fvk,
    };
  };

  const timber: Timber = {
    grade,
    product: data.product,
    fmk: data.fmk,
    ft0k: data.ft0k,
    ft90k: data.ft90k,
    fc0k: data.fc0k,
    fc90k: data.fc90k,
    fvk: data.fvk,
    E0mean: data.E0mean,
    E0k: data.E0k,
    E90mean: data.E90mean,
    Gmean: data.Gmean,
    rhok: data.rhok,
    rhomean: data.rhomean,
    designValues,
  };

  for (const name of GUARDED_DESIGN_VALUES) {
    Object.defineProperty(timber, name, {
      enumerable: false,
      configurable: false,
      get() {
        throw new DesignValueRequiresContextError(name);
      },
    });
  }

  return Object.freeze(timber);
}
