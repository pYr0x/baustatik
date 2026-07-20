/**
 * A phantom-branded number: at runtime it is a plain `number`, but its unit is
 * visible in the type at the call site (hovering `.gamma` shows `KNm3`).
 *
 * The brand is OPTIONAL, so a bare `number` assigns freely and arithmetic works
 * without unwrapping (`gamma * 1.5` is fine). This DOCUMENTS units at the call
 * site — it does not enforce them: a `KNm3` can still be passed where a `Kgm3`
 * is expected. It trades type safety for zero runtime cost and unchanged POJO
 * ergonomics. If conversion is ever needed, that belongs in `@baustatik/units`,
 * not here.
 */
export type Quantity<U extends string> = number & { readonly __unit?: U };

/** Megapascal — strengths and moduli of elasticity. */
export type MPa = Quantity<'MPa'>;
/** Kilonewton per cubic metre — unit weight (Wichte). */
export type KNm3 = Quantity<'kN/m³'>;
/** Kilogram per cubic metre — density. */
export type Kgm3 = Quantity<'kg/m³'>;
/** Per kelvin — coefficient of linear thermal expansion. */
export type PerK = Quantity<'1/K'>;
/** Per mille — strains (εc2, εcu2). */
export type PerMille = Quantity<'‰'>;
/** Percent — characteristic strain at maximum force (εuk). */
export type Percent = Quantity<'%'>;
