/**
 * DAS UMRISSMODELL — die gemeinsame Maschine hinter den Vorlagen der
 * parametrischen Formen.
 *
 * Alle drei kompakten Formen (Rechteck, T-Querschnitt, geschweisstes I) sind
 * achsparallel: in jeder Hoehe hat der Querschnitt EINE Breite, in jeder Breite
 * EINE Hoehe. Damit ist `S` an einer Stelle eine Funktion nur der einen
 * Koordinate, und dieselben zehn Zeilen beantworten sie fuer beide Richtungen.
 *
 * Der Gegenbegriff ist das WANDMODELL in `thin.ts`, das den Schubfluss laengs
 * der Wandmittellinien laufen laesst. Hier wird stattdessen quer durch die volle
 * Umrissfigur geschnitten — Grashof, und fuer Vollquerschnitte richtig.
 */

/**
 * Eine TEILFLAECHE konstanter Breite, von `from` bis `to` in der
 * Schnittkoordinate.
 *
 * `from`/`to` laufen LAENGS der Schnittkoordinate, `width` misst QUER dazu. Die
 * Teilflaechen haben deshalb keine gemeinsame Gestalt: beim I ist der Gurt flach
 * und breit (8,5 mm hoch, 100 breit), der Steg hoch und schmal — 183 von 200 mm
 * Gesamthoehe in EINEM Eintrag. Wer hier an duenne Scheibchen denkt, denkt an
 * das falsche Verfahren: es wird nicht zerschnitten und summiert, sondern ueber
 * zwei bis drei Teilflaechen geschlossen integriert.
 *
 * `width` KANN EINE SUMME UEBER GETRENNTE BEREICHE SEIN. Beim I in y-Richtung
 * steht ausserhalb des Stegs `width = 2*tf` (`compact.ts`): der senkrechte
 * Schnitt trifft dort Ober- UND Untergurt, zwei Flaechen, die sich nicht
 * beruehren. Fuer beide Groessen, die dieses Modul liefert, ist das richtig —
 * die Flaeche stimmt, ihr Schwerpunkt liegt aus Symmetrie auf der Achse, und im
 * Nenner von Grashof tragen beide Gurte den Schubfluss gemeinsam.
 */
export type OutlinePart = {
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
  parts: readonly OutlinePart[],
  cut: number,
): number {
  let moment = 0;
  for (const part of parts) {
    const to = Math.min(part.to, cut);
    if (to <= part.from) continue;
    const area = part.width * (to - part.from);
    moment += area * ((part.from + to) / 2);
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
 *
 * Was herauskommt, ist die GESAMTE durchschnittene Materialbreite und nicht die
 * eines zusammenhaengenden Stuecks — siehe `OutlinePart`. Am I ausserhalb des
 * Stegs sind das `2*tf`, die beiden Gurte zusammen.
 */
export function widthAt(parts: readonly OutlinePart[], cut: number): number {
  let width = Number.POSITIVE_INFINITY;
  for (const part of parts) {
    // Das halboffene Intervall waere an genau einem Rand blind; hier ist die
    // Beruehrung gewollt, damit ein Punkt AUF der Sprungstelle beide
    // Teilflaechen sieht und die kleinere Breite gewinnt.
    if (cut >= part.from && cut <= part.to) width = Math.min(width, part.width);
  }
  return Number.isFinite(width) ? width : 0;
}
