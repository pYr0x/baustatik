import type { MPa, mm } from '@baustatik/units';

/**
 * Die Spannungen an EINEM Spannungspunkt.
 *
 * 1:1 ZUR EINGABELISTE: eine Zeile je Punkt, in derselben Reihenfolge. **Kein
 * Maximum und kein „massgebender Punkt"** — welcher Punkt massgebend ist, hängt
 * vom Nachweis ab und gehört in die Bemessungsstelle
 * ([ADR 0056](../../../docs/adr/0056-verifications-split-by-material-stresses-do-not.md)).
 *
 * `nr` UND `wall` REISEN MIT, weil erst beide zusammen den Punkt identifizieren:
 * am Verzweigungsknoten des I stehen zwei Punkte auf derselben Koordinate und
 * unterscheiden sich genau in `wall`
 * ([ADR 0059](../../../docs/adr/0059-the-stress-point-lies-on-a-wall-element.md)).
 */
export type StressAtPoint = {
  /** Die Nummer des Spannungspunkts, aus dem diese Zeile fällt. */
  readonly nr: number;
  /** Das Wandelement, auf dem der Punkt liegt (ADR 0059). */
  readonly wall: string;
  /** Ort, RELATIV ZUM SCHWERPUNKT [mm] — übernommen, nicht gerechnet. */
  readonly y: mm;
  readonly z: mm;
  /** Normalspannung [MPa], positiv = Zug. */
  readonly sigma: MPa;
  /**
   * Schubspannung [MPa] — **VORZEICHENBEHAFTET**, bezogen auf die Tangente
   * (`ty`, `tz`).
   *
   * `tau > 0` heisst: der Schubfluss läuft in `+s`. Ohne die Tangente daneben
   * ist das Vorzeichen bedeutungslos, deshalb steht sie in derselben Zeile.
   */
  readonly tau: MPa;
  /**
   * Vergleichsspannung nach von Mises [MPa]: `sqrt(σ² + 3τ²)`.
   *
   * DER FAKTOR 3 KOMMT AUS DER GESTALTAENDERUNGSENERGIE und nicht aus EN 1993.
   * Deshalb steht σv hier und nicht in einem Bemessungspackage: er ist
   * werkstofffrei — es gibt keine Festigkeit in dieser Formel (ADR 0054/0056).
   */
  readonly sigmaV: MPa;
  /**
   * Die EINHEITSTANGENTE des Wandelements, übernommen aus dem Spannungspunkt —
   * die Richtung, auf die sich das Vorzeichen von `tau` bezieht (ADR 0058).
   *
   * WARUM DIE RICHTUNG MITREIST: am Verzweigungsknoten des I tragen beide
   * Gurtelemente unter `Vz` dasselbe `Sy`, also dasselbe vorzeichenbehaftete
   * `q` — physikalisch laufen die Flüsse aber AUFEINANDER ZU. Das steckt
   * ausschliesslich in den entgegengesetzten Tangenten. Und `sectionStresses`
   * gibt die `StressPoint[]` gar nicht heraus: ihr Aufrufer hätte sonst KEINEN
   * Weg an die Richtung.
   *
   * `Mt` später ist damit eine Addition auf `q` und kein Breaking Change.
   */
  readonly ty: number;
  readonly tz: number;
};
