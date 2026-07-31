/**
 * Die Umrissfigur als BAENDER — die gemeinsame Maschine hinter den Vorlagen der
 * parametrischen Formen.
 *
 * Alle drei kompakten Formen (Rechteck, Plattenbalken, geschweisstes I) sind
 * achsparallel: in jeder Hoehe hat der Querschnitt EINE Breite, in jeder Breite
 * EINE Hoehe. Damit ist `S` an einer Stelle eine Funktion nur der einen
 * Koordinate, und dieselben zehn Zeilen beantworten sie fuer beide Richtungen.
 */

/** Ein Band konstanter Breite, von `from` bis `to` in der Schnittkoordinate. */
export type OutlineBand = {
  readonly from: number;
  readonly to: number;
  readonly width: number;
};

/**
 * Erstes Flaechenmoment des Materials VOR dem Schnitt — oberhalb von `z`
 * beziehungsweise links von `y`, jeweils um die Schwerpunktachse.
 *
 * Das Ergebnis ist IMMER <= 0: der abgeschnittene Teil liegt auf der Seite der
 * negativen Koordinate. Am oberen Rand ist er leer, am unteren umfasst er alles
 * — und das erste Flaechenmoment des GANZEN Querschnitts um seinen Schwerpunkt
 * ist null. Beide Raender liefern also 0, das Maximum liegt am Schwerpunkt.
 */
export function momentBefore(
  bands: readonly OutlineBand[],
  cut: number,
): number {
  let moment = 0;
  for (const band of bands) {
    const to = Math.min(band.to, cut);
    if (to <= band.from) continue;
    const area = band.width * (to - band.from);
    moment += area * ((band.from + to) / 2);
  }
  return moment;
}

/**
 * Die Breite an der Stelle `cut` — der Nenner in `tau = V*S/(I*t)`.
 *
 * AN EINER SPRUNGSTELLE GILT DIE KLEINERE BREITE. An der Gurtunterkante eines
 * I-Querschnitts springt die Schubspannung nach oben, weil derselbe Schubfluss
 * sich ploetzlich ueber `tw` statt ueber `b` verteilt. Der massgebende Wert ist
 * der groessere, also gehoert die kleinere Breite in den Nenner. Die groessere
 * zu nehmen hiesse, die Spitze wegzurechnen, um die es an diesem Punkt geht.
 */
export function widthAt(bands: readonly OutlineBand[], cut: number): number {
  let width = Number.POSITIVE_INFINITY;
  for (const band of bands) {
    // Das halboffene Intervall waere an genau einem Rand blind; hier ist die
    // Beruehrung gewollt, damit ein Punkt AUF der Sprungstelle beide Baender
    // sieht und die kleinere Breite gewinnt.
    if (cut >= band.from && cut <= band.to) width = Math.min(width, band.width);
  }
  return Number.isFinite(width) ? width : 0;
}
