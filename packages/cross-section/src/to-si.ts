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
  /**
   * Schubmittelpunkt, im selben System wie `ys`/`zs` — `undefined` heisst NICHT
   * ERMITTELT. `alpha`/`Iu`/`Iv` stehen hier NICHT: sie sind reine Algebra auf
   * `Iy`/`Iz`/`Iyz` und werden deshalb unten gerechnet und nicht von jeder
   * Quelle einzeln hingeschrieben.
   */
  readonly yM?: cm;
  readonly zM?: cm;
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
 * REINE ALGEBRA UND DESHALB TOTAL — es gibt keinen Querschnitt, fuer den die
 * Frage offen bliebe. Genau darum sind `alpha`, `Iu` und `Iv` PFLICHTFELDER an
 * `SectionProperties`: bei einem IPE 300 waere `undefined` keine Auskunft,
 * sondern eine Unwahrheit.
 *
 * Herleitung: die Drehung um `alpha` (positiv von `+y` nach `+z`) liefert
 *
 *   `Iuv = (Iy − Iz)/2 · sin 2α + Iyz · cos 2α`,
 *
 * und `Iuv = 0` heisst `tan 2α = −2·Iyz / (Iy − Iz)`. Aus `atan2` genommen,
 * nicht aus `atan`: nur so faellt der Quadrant richtig, `alpha` landet in
 * `(−π/2, +π/2]`, und `Iu` wird das GROESSERE der beiden — beides sind die
 * Rider aus ADR 0031, und sie gelten hier per Konstruktion und nicht per Test.
 *
 * `Iyz === 0` ist ABGEKUERZT, und die Abkuerzung ist exakt: verschwindet das
 * Deviationsmoment, SIND `y` und `z` bereits die Hauptachsen. Die allgemeine
 * Formel kaeme auf dieselbe Antwort, aber ueber `sqrt` und Division — und
 * `Iu === Iy` waere dann nur noch auf Gleitkommarauschen genau. Alle heutigen
 * Quellen laufen durch diesen Zweig.
 *
 * EXPORTIERT, ABER NICHT IM BARREL: der allgemeine Zweig hat heute keine
 * Quelle, die ihn erreicht — er wartet auf die Green-Rechnung aus P2. Ohne
 * eigenen Test waere er ungeprueft, und ein ungeprueftes Vorzeichen in einer
 * Winkelkonvention ist genau der Fehler, den ADR 0031 verhindern soll.
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
    ...principalAxes(Iy, Iz, Iyz),
    yM: values.yM === undefined ? undefined : values.yM * CM_TO_M,
    zM: values.zM === undefined ? undefined : values.zM * CM_TO_M,
  };
}
