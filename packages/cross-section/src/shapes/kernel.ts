import type { SectionProperties } from '../properties';
import { type ShearSegment, shearArea } from '../shear';

/**
 * Was eine parametrische Form liefert: die Werte der UMRISSFIGUR plus die zwei
 * Schubfluss-Wege.
 *
 * DIE IDEALISIERUNG STECKT NUR IN DEN WEGEN. `A`, `Iy`, `Iz`, `Iyz`, `ys` und
 * `zs` werden in BEIDEN Faellen exakt aus der Umrissfigur gerechnet — die
 * klassische duennwandige Naeherung (Mittellinie, `t^3`-Anteil entfaellt)
 * brauchen wir nicht, weil geschlossene Formeln vorliegen. Heute wirkt
 * `idealisation` damit auf GENAU EINE Groesse: kappa. Mit `It` kommt sie wieder,
 * und dort liegen zwischen `1/3 * sum l*t^3` und Bredt drei Zehnerpotenzen.
 */
export type ShapeResult = {
  readonly A: number;
  readonly Iy: number;
  readonly Iz: number;
  readonly Iyz: number;
  readonly ys: number;
  readonly zs: number;
  /** Schubflussweg fuer eine Querkraft in y-Richtung (gehoert zu `Iz`). */
  readonly pathY: readonly ShearSegment[];
  /** Schubflussweg fuer eine Querkraft in z-Richtung (gehoert zu `Iy`). */
  readonly pathZ: readonly ShearSegment[];
};

/**
 * kappa aus dem Weg — die einzige Stelle, an der aus einem Schubflussweg eine
 * Zahl wird.
 *
 * `kappaY` haengt an `Iz`, `kappaZ` an `Iy`: die Querkraft in y biegt um z.
 * Die Vertauschung waere unauffaellig — beide Zahlen blieben plausibel — und
 * ist deshalb genau ein Test wert.
 */
export function toProperties(shape: ShapeResult): SectionProperties {
  return {
    A: shape.A,
    Iy: shape.Iy,
    Iz: shape.Iz,
    Iyz: shape.Iyz,
    ys: shape.ys,
    zs: shape.zs,
    kappaY: shearArea(shape.Iz, shape.pathY) / shape.A,
    kappaZ: shearArea(shape.Iy, shape.pathZ) / shape.A,
  };
}

/** Alle Abmessungen muessen endlich und echt positiv sein. */
export function allPositive(...values: number[]): boolean {
  return values.every((v) => Number.isFinite(v) && v > 0);
}
