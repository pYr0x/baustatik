import type { cm, cm2, cm4 } from '@baustatik/units';
import type { SectionProperties } from './properties';
import { CM_TO_M, CM2_TO_M2, CM4_TO_M4 } from './units';

/**
 * Die Querschnittswerte in KATALOGEINHEITEN — die gemeinsame Zwischenform
 * beider Quellen.
 *
 * Eine parametrische Form (`ShapeResult`) und eine Tabellenzeile
 * (`SteelProfileData`) reden nach diesem Umbau dieselbe Sprache: cm², cm⁴, cm.
 * Genau das macht `toSI` möglich — vorher rechnete die eine Quelle bereits in
 * Metern und die andere noch nicht, und es gab zwei Umrechnungsstellen.
 */
export type CatalogueValues = {
  readonly A: cm2;
  readonly Iy: cm4;
  readonly Iz: cm4;
  readonly Iyz: cm4;
  readonly ys: cm;
  readonly zs: cm;
  /** Dimensionslos — reist unverändert durch. */
  readonly kappaY?: number;
  readonly kappaZ?: number;
  /** Ebenfalls dimensionslos: `1/kappa = d0 + d2·m²` (ADR 0045). */
  readonly inverseKappaY?: readonly [number, number];
  readonly inverseKappaZ?: readonly [number, number];
  /**
   * Schubmittelpunkt, im selben System wie `ys`/`zs` — `undefined` heisst NICHT
   * ERMITTELT. `alpha`/`Iu`/`Iv` stehen hier NICHT: sie sind reine Algebra auf
   * `Iy`/`Iz`/`Iyz` und werden deshalb unten gerechnet und nicht von jeder
   * Quelle einzeln hingeschrieben.
   */
  readonly yM?: cm;
  readonly zM?: cm;
  /**
   * Torsionsträgheitsmoment [cm⁴] — `undefined` heisst NICHT ERMITTELT.
   *
   * An der EINEN bestehenden Stelle umgerechnet, wie `Iy` und `Iz`: die
   * Katalogzeile führt `It` bereits in cm⁴, die parametrische Form rechnet in
   * cm, und der Wandweg bekommt seine Segmente in cm gereicht.
   */
  readonly It?: cm4;
};

/** Die Hauptachsenlage. Ergebnis in derselben Einheit wie die Eingabe. */
export type PrincipalAxes = {
  readonly alpha: number;
  readonly Iu: number;
  readonly Iv: number;
};

/**
 * Hauptträgheitsmomente und Hauptachsenwinkel aus `Iy`, `Iz`, `Iyz`.
 *
 * REINE ALGEBRA UND DESHALB TOTAL — es gibt keinen Querschnitt, für den die
 * Frage offen bliebe. Genau darum sind `alpha`, `Iu` und `Iv` PFLICHTFELDER an
 * `SectionProperties`: bei einem IPE 300 wäre `undefined` keine Auskunft,
 * sondern eine Unwahrheit.
 *
 * Herleitung: die Drehung um `alpha` (positiv von `+y` nach `+z`) liefert
 *
 *   `Iuv = (Iy − Iz)/2 · sin 2α + Iyz · cos 2α`,
 *
 * und `Iuv = 0` heißt `tan 2α = −2·Iyz / (Iy − Iz)`. Aus `atan2` genommen,
 * nicht aus `atan`: nur so fällt der Quadrant richtig, `alpha` landet in
 * `(−π/2, +π/2]`, und `Iu` wird das GRÖSSERE der beiden — beides sind die
 * Rider aus ADR 0031, und sie gelten hier per Konstruktion und nicht per Test.
 *
 * `Iyz === 0` ist ABGEKÜRZT, und die Abkürzung ist exakt: verschwindet das
 * Deviationsmoment, SIND `y` und `z` bereits die Hauptachsen. Die allgemeine
 * Formel käme auf dieselbe Antwort, aber über `sqrt` und Division — und
 * `Iu === Iy` wäre dann nur noch auf Gleitkommarauschen genau.
 *
 * BEIDE ZWEIGE SIND SEIT P2 IN GEBRAUCH. Die parametrischen Formen und die
 * Katalogzeile schreiben eine literale `0` hin und nehmen die Abkürzung; der
 * gezeichnete Umriss liefert über Green ein allgemeines `Iyz` — bei einer
 * achsparallelen Figur als Gleitkommarauschen, sonst als echte Zahl — und läuft
 * durch die allgemeine Formel. Ob Hauptachsenlage vorliegt, beantwortet damit
 * nicht dieser Vergleich, sondern das Gate mit
 * `SectionPolicy.principalAxisTolerance`.
 *
 * EXPORTIERT, ABER NICHT IM BARREL: die Funktion ist Hausalgebra und keine
 * Zusage nach außen. Ein eigener Test hängt trotzdem an ihr, weil ein
 * ungeprüftes Vorzeichen in einer Winkelkonvention genau der Fehler ist, den
 * ADR 0031 verhindern soll.
 */
export function principalAxes(
  Iy: number,
  Iz: number,
  Iyz: number,
): PrincipalAxes {
  if (Iyz === 0) {
    return Iy >= Iz
      ? { alpha: 0, Iu: Iy, Iv: Iz }
      : // Die starke Achse liegt auf `z`: um +90° gedreht, und `+π/2` ist der
        // eingeschlossene Rand des Bereichs.
        { alpha: Math.PI / 2, Iu: Iz, Iv: Iy };
  }

  const mean = (Iy + Iz) / 2;
  const radius = Math.hypot((Iy - Iz) / 2, Iyz);
  return {
    alpha: Math.atan2(-2 * Iyz, Iy - Iz) / 2,
    Iu: mean + radius,
    Iv: mean - radius,
  };
}

/**
 * DIE EINZIGE STELLE IM PACKAGE, an der aus Katalogeinheiten SI wird.
 *
 * Innen rechnet alles in cm — das ist die Einheit, in der die Norm druckt und
 * in der man ein Ergebnis gegen die Tabelle diffen kann (`Iy: 8356`, nicht
 * `8.356e-5`). Nach aussen geht SI, weil `fem-section-resolve` mit `A` in m²
 * und `E` in kN/m² multipliziert und dabei kN bzw. kNm² herauskommen sollen.
 *
 * kappa läuft unverändert durch: es ist ein Verhältnis zweier Flächen und
 * damit dimensionslos. Dass es hier NICHT umgerechnet wird, ist der Grund,
 * warum der ganze Maßstabswechsel von Metern auf Zentimeter die
 * kappa-Testreihe unberührt lässt.
 */
export function toSI(values: CatalogueValues): SectionProperties {
  // Die Hauptachsen fallen aus den BEREITS umgerechneten Zahlen. Umgekehrt —
  // erst rechnen, dann umrechnen — waere dieselbe Antwort, aber `Iu === Iy`
  // gilt nur, solange beide Wege durch dieselbe Multiplikation laufen.
  const Iy = values.Iy * CM4_TO_M4;
  const Iz = values.Iz * CM4_TO_M4;
  const Iyz = values.Iyz * CM4_TO_M4;

  return {
    A: values.A * CM2_TO_M2,
    Iy,
    Iz,
    Iyz,
    ys: values.ys * CM_TO_M,
    zs: values.zs * CM_TO_M,
    kappaY: values.kappaY,
    kappaZ: values.kappaZ,
    inverseKappaY: values.inverseKappaY,
    inverseKappaZ: values.inverseKappaZ,
    ...principalAxes(Iy, Iz, Iyz),
    yM: values.yM === undefined ? undefined : values.yM * CM_TO_M,
    zM: values.zM === undefined ? undefined : values.zM * CM_TO_M,
    It: values.It === undefined ? undefined : values.It * CM4_TO_M4,
  };
}
