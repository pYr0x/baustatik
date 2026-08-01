/**
 * A phantom-branded number: at runtime it is a plain `number`, but its unit is
 * visible in the type at the call site (hovering `.gamma` shows `KNm3`).
 *
 * The brand is OPTIONAL, so a bare `number` assigns freely and arithmetic works
 * without unwrapping (`gamma * 1.5` is fine). This DOCUMENTS units at the call
 * site — it does not enforce them: a `KNm3` can still be passed where a `Kgm3`
 * is expected. It trades type safety for zero runtime cost and unchanged POJO
 * ergonomics. Where an actual conversion is needed, `convert(...).toExact(...)`
 * from this same package does it.
 */
export type Quantity<U extends string> = number & { readonly __unit?: U };

// ---- Längen ----
// Kleingeschrieben wie das Symbol selbst: `h: mm` und `A: cm2` lesen sich wie
// die Domäne, in der sie stehen.

/** Millimeter — die Einheit, in der ein Querschnitt gezeichnet wird. */
export type mm = Quantity<'mm'>;
/** Zentimeter. */
export type cm = Quantity<'cm'>;
/** Meter — SI, die Einheit der Modell- und FEM-Grenze. */
export type m = Quantity<'m'>;

// ---- Flächen ----

/** Quadratmillimeter. */
export type mm2 = Quantity<'mm²'>;
/** Quadratzentimeter — die Einheit, in der jede Profiltabelle `A` druckt. */
export type cm2 = Quantity<'cm²'>;
/** Quadratmeter. */
export type m2 = Quantity<'m²'>;

// ---- Volumina und statische Momente ----

/** Kubikmillimeter. */
export type mm3 = Quantity<'mm³'>;
/** Kubikzentimeter — Widerstandsmomente `W` und statische Momente `S`. */
export type cm3 = Quantity<'cm³'>;
/** Kubikmeter. */
export type m3 = Quantity<'m³'>;

// ---- Flächenmomente 2. Grades ----

/** mm⁴. */
export type mm4 = Quantity<'mm⁴'>;
/** cm⁴ — die Einheit, in der jede Profiltabelle `Iy` druckt. */
export type cm4 = Quantity<'cm⁴'>;
/** m⁴. */
export type m4 = Quantity<'m⁴'>;

// ---- Material ----
// Wörtlich aus `@baustatik/material` umgezogen, KEINE Umbenennung: die Namen
// stehen in der öffentlichen Oberfläche von `material`.

/** Megapascal — strengths and moduli of elasticity. */
export type MPa = Quantity<'MPa'>;
/** Newton per millimeter — strengths and moduli of elasticity. */
export type Nmm = Quantity<'N/mm'>;
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
