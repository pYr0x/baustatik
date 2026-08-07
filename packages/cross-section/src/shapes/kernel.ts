import type { cm, cm2, cm4 } from '@baustatik/units';
import type { SectionProperties } from '../properties';
import { type ShearFlowInterval, shearArea } from '../shear';
import { toSI } from '../to-si';

/**
 * Was eine parametrische Form liefert: die Werte der UMRISSFIGUR plus die zwei
 * Schubfluss-Wege.
 *
 * EINHEITEN WIE DER KATALOG: cm², cm⁴, cm — dieselben, in denen
 * `SteelProfileData` seine Zeile fuehrt. Damit sind die beiden Quellen dieses
 * Packages deckungsgleich, und es gibt nur EINE Stelle, die nach SI umrechnet
 * (`toSI`). Vorher rechnete die parametrische Form bereits in Metern und der
 * Katalog noch nicht — zwei Umrechnungen fuer eine Frage.
 *
 * DIE IDEALISIERUNG STECKT NUR IN DEN WEGEN. `A`, `Iy`, `Iz`, `Iyz`, `ys` und
 * `zs` werden in BEIDEN Faellen exakt aus der Umrissfigur gerechnet — die
 * klassische duennwandige Naeherung (Mittellinie, `t^3`-Anteil entfaellt)
 * brauchen wir nicht, weil geschlossene Formeln vorliegen. Heute wirkt
 * `idealisation` damit auf GENAU EINE Groesse: kappa. Mit `It` kommt sie wieder,
 * und dort liegen zwischen `1/3 * sum l*t^3` und Bredt drei Zehnerpotenzen.
 */
export type ShapeResult = {
  readonly A: cm2;
  readonly Iy: cm4;
  readonly Iz: cm4;
  readonly Iyz: cm4;
  readonly ys: cm;
  readonly zs: cm;
  /**
   * Der Schubmittelpunkt, im SELBEN System wie `ys`/`zs` — die Invariante aus
   * [ADR 0031](../../../docs/adr/0031-the-cross-section-plane.md).
   *
   * `yM` steht bei jeder Form: alle vier haben eine Symmetrieachse in y, also
   * liegt er auf ihr. `zM` steht ueberall dort, wo die Form ausserdem
   * doppeltsymmetrisch ist. `undefined` heisst NICHT ERMITTELT und ist beim
   * `t-section` die Wahrheit — dort ist `zM != zs`, und die Zahl faellt erst
   * aus dem Wandweg.
   */
  readonly yM?: cm;
  readonly zM?: cm;
  /** Schubflussweg fuer eine Querkraft in y-Richtung (gehoert zu `Iz`). */
  readonly pathY: readonly ShearFlowInterval[];
  /** Schubflussweg fuer eine Querkraft in z-Richtung (gehoert zu `Iy`). */
  readonly pathZ: readonly ShearFlowInterval[];
};

/**
 * kappa aus dem Weg — die einzige Stelle, an der aus einem Schubflussweg eine
 * Zahl wird.
 *
 * `kappaY` haengt an `Iz`, `kappaZ` an `Iy`: die Querkraft in y biegt um z.
 * Die Vertauschung waere unauffaellig — beide Zahlen blieben plausibel — und
 * ist deshalb genau ein Test wert.
 *
 * kappa ist DIMENSIONSLOS und faellt deshalb aus den cm-Werten ohne jede
 * Umrechnung: `shearArea` liefert cm², geteilt durch `A` in cm². Genau deshalb
 * bleibt kappa von einem Wechsel des Laengenmassstabs voellig unberuehrt.
 */
export function toProperties(shape: ShapeResult): SectionProperties {
  return toSI({
    A: shape.A,
    Iy: shape.Iy,
    Iz: shape.Iz,
    Iyz: shape.Iyz,
    ys: shape.ys,
    zs: shape.zs,
    yM: shape.yM,
    zM: shape.zM,
    kappaY: shearArea(shape.Iz, shape.pathY) / shape.A,
    kappaZ: shearArea(shape.Iy, shape.pathZ) / shape.A,
  });
}

/** Alle Abmessungen muessen endlich und echt positiv sein. */
export function allPositive(...values: number[]): boolean {
  return values.every((v) => Number.isFinite(v) && v > 0);
}
