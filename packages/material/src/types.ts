// Shared vocabulary for the material package. See CONTEXT.md `## Language`.

/**
 * Bemessungssituation — selects the partial safety factors.
 * `persistent` = ständig/vorübergehend, `accidental` = außergewöhnlich.
 */
export type DesignSituation = 'persistent' | 'accidental';

/** Lasteinwirkungsdauer (EN 1995-1-1) — selects the timber `kmod` value. */
export type LoadDuration =
  | 'permanent'
  | 'long-term'
  | 'medium-term'
  | 'short-term'
  | 'instantaneous';

/** Nutzungsklasse (EN 1995-1-1) — selects the timber `kmod` value. */
export type ServiceClass = 'SC1' | 'SC2' | 'SC3';

/**
 * Nachweistyp für Baustahl — selects the resistance partial factor γM
 * (M0: cross-section, M1: stability/buckling, M2: net section/fracture).
 */
export type SteelResistance = 'M0' | 'M1' | 'M2';

/** Holzprodukt — selects the timber material partial factor γM. */
export type TimberProduct = 'timber' | 'glulam';
