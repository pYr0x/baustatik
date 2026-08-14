/**
 * Die Querschnittswerte des MITGEFÜHRTEN UMRISSES, nach Green.
 *
 * DIE DRITTE QUELLE RECHNET AUS DEM POLYGON, nicht aus dem Wandgraphen. `outline`
 * steht in BEIDEN Varianten von `SectionGeometry` und ist bereits diskretisiert
 * — hier wird nie nach `nodes`, `walls` oder `rings` gefragt, und deshalb braucht
 * diese Datei weder eine Bibliothek noch die Unterscheidung `midline`/`outline`
 * ([ADR 0035](../../../../docs/adr/0035-the-editor-section-yields-values-without-kappa.md)).
 *
 * ARBEITSTEILUNG: die Algebra eines EINZELNEN Ringes liegt unten, in
 * `Polygon.moments` (`@baustatik/section-geometry`). Hier liegt allein die
 * ZUSAMMENSETZUNG — die Summe über die Ringe und die eine Steiner-Verschiebung
 * in den Gesamtschwerpunkt. „Mehrere Ringe sind ein Querschnitt" ist eine
 * Aussage dieses Packages und keine der ebenen Geometrie.
 *
 * MATERIAL UND LOCH STECKEN IM UMLAUFSINN: `signedArea > 0` ist Material,
 * `< 0` ein Loch ([ADR 0034](../../../../docs/adr/0034-winding-is-mathematical-and-the-factory-does-not-normalise.md)).
 * Weil `Polygon.moments` roh und vorzeichenbehaftet liefert, addieren sich alle
 * sechs Zahlen LINEAR, und der hohle Betonkasten braucht keinen Sonderfall —
 * das Loch zieht sich über sein Vorzeichen selbst ab. Ein
 * Verschachtelungstest steht deshalb NICHT auf der Rechenstrecke, sondern als
 * Warnung im Gate.
 *
 * SKALENFREI, wie die Formfunktionen: was hineingeht, bestimmt, was
 * herauskommt. `geometryValues` in `geometry-properties.ts` reicht Zentimeter herein.
 */

import { Polygon as SectionPolygon } from '@baustatik/section-geometry';
import type { Polygon } from '../model/section-geometry';

/**
 * Was aus dem Umriss fällt — auf den SCHWERPUNKT bezogen, in der Einheit der
 * Eingabe.
 *
 * OHNE kappa UND OHNE SCHUBMITTELPUNKT, und das ist keine Lücke im Typ,
 * sondern der Zuschnitt: beide brauchen einen Wandweg beziehungsweise Grashof
 * und kommen mit P4/P5. `alpha`/`Iu`/`Iv` stehen ebenfalls nicht hier — sie
 * sind reine Algebra auf `Iy`/`Iz`/`Iyz` und fallen einmal für alle Quellen in
 * `toSI` an.
 */
export type GreenValues = {
  /** Querschnittsfläche [L²] — immer echt positiv, sonst gibt es kein Ergebnis. */
  readonly A: number;
  /** `∫z² dA` um den Schwerpunkt [L⁴]. */
  readonly Iy: number;
  /** `∫y² dA` um den Schwerpunkt [L⁴]. */
  readonly Iz: number;
  /**
   * `+∫y·z dA` um den Schwerpunkt [L⁴] — DAS NACKTE GREEN-INTEGRAL, OHNE
   * NEGATION.
   *
   * DIE KONVENTION IST ERZWUNGEN UND NICHT GEWÄHLT: ADR 0031 schreibt
   * `tan 2α = −2·Iyz/(Iy − Iz)`, und Definitions- und Formelvorzeichen reisen
   * immer GEMEINSAM. Die Literatur führt zwei Paare —
   *
   *   `Iyz = +∫y·z dA` mit `tan 2α = −2·Iyz/(Iy − Iz)`   (mathematisch;
   *      Hibbeler, Timoshenko, angelsächsische Literatur)
   *   `Iyz = −∫y·z dA` mit `tan 2α = +2·Iyz/(Iy − Iz)`   (Groß/Hauger/
   *      Schröder/Wall, klassische deutsche Elastostatik)
   *
   * — und beide liefern dasselbe `α`. Das Haus steht durchgehend auf dem
   * ersten: `convert.ts` behandelt `(y, z)` mathematisch, `Arc.sweep` zählt
   * mathematisch positiv, `principalAxes` nimmt `atan2`.
   *
   * FÜR EINEN GEZEICHNETEN UMRISS IST DIESE ZAHL NIE EXAKT NULL. Ein
   * achsparallel gezeichnetes Rechteck liefert Gleitkommarauschen; wer wissen
   * will, ob Hauptachsenlage vorliegt, fragt das Gate mit
   * `SectionPolicy.principalAxisTolerance` und nicht diesen Wert gegen `0`.
   */
  readonly Iyz: number;
  /** Schwerpunkt im EINGABESYSTEM des Umrisses [L]. */
  readonly ys: number;
  readonly zs: number;
};

/**
 * Die Werte des Umrisses — oder `undefined`, wenn er keine Fläche trägt.
 *
 * `undefined` HEISST „KENNE ICH NICHT", wie überall in diesem Package: der
 * Umriss ist leer, jeder Ring hat weniger als drei Punkte, oder die Summe der
 * Flächen ist nicht echt positiv (umgekehrt gewickelt, oder das Loch größer
 * als das Material). Eine negative Fläche hier durchzulassen erzeugte in
 * `fem-section-resolve` eine negative Steifigkeit — der einzige Fehler dieser
 * Ecke, der den Löser STILL kaputtmacht. Was daran im Einzelnen falsch ist,
 * sagt das Gate; hier steht nur, dass nichts zu rechnen war.
 */
export function greenValues(
  outline: readonly Polygon[],
): GreenValues | undefined {
  let A = 0;
  let Sy = 0;
  let Sz = 0;
  // Roh um den URSPRUNG. Schwerpunktsbezogen je Ring wäre für die Summe
  // unbrauchbar — die Ringschwerpunkte sind verschieden.
  let IyO = 0;
  let IzO = 0;
  let IyzO = 0;

  for (const polygon of outline) {
    if (polygon.points.length < 3) continue;
    const m = SectionPolygon.moments(polygon.points);
    A += m.A;
    Sy += m.Sy;
    Sz += m.Sz;
    IyO += m.Iy;
    IzO += m.Iz;
    IyzO += m.Iyz;
  }

  if (!(Number.isFinite(A) && A > 0)) return undefined;

  const ys = Sy / A;
  const zs = Sz / A;

  // Die Steiner-Verschiebung passiert EINMAL, hier am Ende — nicht je Ring.
  return Object.freeze({
    A,
    Iy: IyO - A * zs * zs,
    Iz: IzO - A * ys * ys,
    Iyz: IyzO - A * ys * zs,
    ys,
    zs,
  });
}
