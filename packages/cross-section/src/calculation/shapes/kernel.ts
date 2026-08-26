import type { cm, cm2, cm4 } from '@baustatik/units';
import type { SectionProperties } from '../../model/section-properties';
import { type ShearFlowInterval, shearArea } from '../shear';
import type { CatalogueValues } from '../to-si';
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
 * brauchen wir nicht, weil geschlossene Formeln vorliegen.
 *
 * SEIT [ADR 0062](../../../../../docs/adr/0062-the-parametric-shape-writes-itself-out-as-an-outline.md)
 * GIBT ES DIE WEGE NUR NOCH DUENNWANDIG. Der kompakte Zweig hatte sie als
 * Flaechenschnitte durch die volle Figur — Grashof —, und gemessen lag das
 * +10,7 % bis +133,6 % zu schubsteif
 * (`docs/messungen/t-querschnitt-grashof-gegen-fe.md`). Die solide Form laeuft
 * jetzt als Umriss durch dieselbe FE wie die gezeichnete Figur; `pathY`/`pathZ`
 * fehlen dort, und `toProperties` antwortet κ dann mit `undefined` =
 * schubstarr. `calculation/shear.ts` bleibt VOLLSTAENDIG — der duennwandige
 * Zweig lebt davon.
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
   * [ADR 0031](../../../../../docs/adr/0031-the-cross-section-plane.md).
   *
   * `yM` steht bei jeder Form: alle vier haben eine Symmetrieachse in y, also
   * liegt er auf ihr. `zM` steht ueberall dort, wo die Form ausserdem
   * doppeltsymmetrisch ist. `undefined` heisst NICHT ERMITTELT und ist beim
   * `t-section` die Wahrheit — dort ist `zM != zs`, und die Zahl faellt
   * duennwandig aus dem Wandzug (Gurtmitte), solid aus der FE (ADR 0062).
   */
  readonly yM?: cm;
  readonly zM?: cm;
  /**
   * Torsionstraegheitsmoment [cm4] — der GESCHLOSSENE Ausdruck der Form.
   *
   * ER STEHT HIER ALS ORAKEL und nicht als Bequemlichkeit: dieselbe Zahl faellt
   * mit P5 auch aus dem gezeichneten Wandgraphen, und ein Test haelt beide
   * gegeneinander. Eine Form, die ihre eigene Formel hinschreibt, ist der
   * unabhaengige Zeuge fuer den gerechneten Weg — genau die Rolle, die
   * `tests/oracle.ts` fuer kappa spielt.
   *
   * `undefined` bei JEDER kompakten Idealisierung: fuer den Vollquerschnitt ist
   * `It` weder `⅓Σl·t³` noch Bredt, sondern die Loesung eines
   * Randwertproblems. Zwischen den beiden zulaessigen Formeln liegen drei
   * Zehnerpotenzen, und eine davon zu raten waere schlimmer als die Auskunft
   * „nicht ermittelt".
   *
   * DAS RANDWERTPROBLEM WIRD GELOEST, nur nicht hier. Seit
   * [ADR 0062](../../../../../docs/adr/0062-the-parametric-shape-writes-itself-out-as-an-outline.md)
   * schreibt die Form sich als Umriss aus und laeuft durch dieselbe FE wie die
   * gezeichnete Figur
   * ([ADR 0045](../../../../../docs/adr/0045-solid-section-values-are-nu-free-coefficients.md)).
   * `It` kommt dann aus `CrossSection.feValues` und nicht aus diesem Satz —
   * `undefined` heisst hier also „diese Form hat keine geschlossene Formel",
   * und im Ergebnis heisst es „der Aufloesungsschritt lief noch nicht".
   */
  readonly It?: cm4;
  /**
   * Schubflussweg fuer eine Querkraft in y-Richtung (gehoert zu `Iz`).
   *
   * OPTIONAL SEIT ADR 0062: nur der duennwandige Zweig hat einen Wandweg. Fehlt
   * er, faellt κ als `undefined` heraus — schubstarr, bis der FE-Block da ist.
   */
  readonly pathY?: readonly ShearFlowInterval[];
  /** Schubflussweg fuer eine Querkraft in z-Richtung (gehoert zu `Iy`). */
  readonly pathZ?: readonly ShearFlowInterval[];
};

/**
 * kappa aus dem Weg — die einzige Stelle, an der aus einem Schubflussweg eine
 * Zahl wird — und der Zusammenbau mit dem FE-Block.
 *
 * `kappaY` haengt an `Iz`, `kappaZ` an `Iy`: die Querkraft in y biegt um z.
 * Die Vertauschung waere unauffaellig — beide Zahlen blieben plausibel — und
 * ist deshalb genau ein Test wert.
 *
 * kappa ist DIMENSIONSLOS und faellt deshalb aus den cm-Werten ohne jede
 * Umrechnung: `shearArea` liefert cm², geteilt durch `A` in cm². Genau deshalb
 * bleibt kappa von einem Wechsel des Laengenmassstabs voellig unberuehrt.
 *
 * DIE GESCHLOSSENE FORMEL GEWINNT, DER FE-BLOCK FUELLT (ADR 0062). Beide
 * kommen bei keiner Form gleichzeitig vor — der duennwandige Zweig hat einen
 * Wandweg und keinen FE-Block, der solide umgekehrt —, und wo doch beides im
 * Satz staende, gilt dieselbe Vorfahrt wie in `fem-section-resolve`
 * (`props.kappaZ ?? kappaFromCoefficients(...)`). Bei `yM` traegt sie sogar
 * etwas: alle vier Formen haben eine Symmetrieachse in y, `yM = 0` ist damit
 * EXAKT, und die FE-Zahl waere dieselbe Null mit Netzrauschen.
 */
export function toProperties(
  shape: ShapeResult,
  fe: Partial<CatalogueValues> = {},
): SectionProperties {
  return toSI({
    A: shape.A,
    Iy: shape.Iy,
    Iz: shape.Iz,
    Iyz: shape.Iyz,
    ys: shape.ys,
    zs: shape.zs,
    inverseKappaY: fe.inverseKappaY,
    inverseKappaZ: fe.inverseKappaZ,
    yM: shape.yM ?? fe.yM,
    zM: shape.zM ?? fe.zM,
    It: shape.It ?? fe.It,
    kappaY: kappa(shape.Iz, shape.pathY, shape.A),
    kappaZ: kappa(shape.Iy, shape.pathZ, shape.A),
  });
}

/** kappa aus einem Weg — `undefined`, wo es keinen gibt (schubstarr). */
function kappa(
  I: number,
  path: readonly ShearFlowInterval[] | undefined,
  A: number,
): number | undefined {
  return path === undefined ? undefined : shearArea(I, path) / A;
}

/** Alle Abmessungen muessen endlich und echt positiv sein. */
export function allPositive(...values: number[]): boolean {
  return values.every((v) => Number.isFinite(v) && v > 0);
}
