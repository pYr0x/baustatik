/**
 * Der Stil des Querschnitts-Viewers — die View-Policy, die jetzt gerechtfertigt
 * ist.
 *
 * BIS P5 WAREN ES ZWEI FARBEN, und zwei Modulkonstanten mit einer Begruendung
 * im JSDoc waren die richtige Antwort: eine Option am Aufruf haette eine
 * Aussage ueber die BEDEUTUNG der Lagen an den Aufrufer verschoben
 * ([`TODO.md` §2](../../TODO.md)). Mit drei Symbolarten und einem Netz sind
 * Farbe, Strichstaerke und Punktgroesse zu einer zusammenhaengenden
 * Anzeigefrage geworden — und zusammenhaengende Fragen bekommen eine Scheibe,
 * keine sieben Konstanten.
 *
 * WAS TROTZDEM KEINE STILANGABE IST: die WANDSTAERKE. `Wall.t` ist Physik in
 * Millimetern; sie wird beim Zeichnen mit `viewport.scale` multipliziert, damit
 * Konvas screen-konstanter Stroke sie als Weltgroesse abbildet. Alles mit dem
 * Suffix `Px` ist dagegen SCHEMATISCH und zoomt nicht mit — ein Schwerpunkt hat
 * keine Ausdehnung, sein Kreis ist ein Zeichen.
 *
 * DIE FARBEN TRENNEN HERKUENFTE, nicht Geschmaecker:
 *
 *   schwarz  — die Eingabe (Wandmittellinien).
 *   orange   — der abgeleitete Umriss (ADR 0037). In Schwarz auf Schwarz saehe
 *              man die Kerbe am Grad-3-Knoten nicht.
 *   hellocker— das Netz. Es liegt ueber der Figur und muss sie durchscheinen
 *              lassen.
 *   rot/gruen/blau — die drei Ergebnispunkte, untereinander unterscheidbar.
 *   dunkelgrau — die Bewehrung. EINGABE wie die Wandmittellinien, aber nicht
 *              deren Schwarz: sie liegt bei einem `solid` gezeichneten
 *              Wandgraphen ueber ihnen (ADR 0064).
 */
export interface CrossSectionStyle {
  readonly thinWallColor?: string;
  readonly outlineColor?: string;
  readonly outlineWidthPx?: number;
  readonly feColor?: string;
  readonly feWidthPx?: number;
  readonly centroidColor?: string;
  readonly centroidRadiusPx?: number;
  readonly shearCentreColor?: string;
  readonly shearCentreRadiusPx?: number;
  readonly stressPointColor?: string;
  readonly stressPointSizePx?: number;
  readonly rebarColor?: string;
  readonly rebarRadiusPx?: number;
}

export const DEFAULT_STYLE: Required<CrossSectionStyle> = {
  // Mit Alpha: die Wand ist breit, und unter ihr liegt das Grid. Voll deckend
  // verdeckte eine 20-mm-Wand die Bezugslinien, an denen man sie misst.
  thinWallColor: 'rgba(0, 0, 0, 0.75)',
  outlineColor: '#e8830c',
  // Die Umrisslinie ist eine KANTE, keine Wand — deshalb Screen-Pixel.
  outlineWidthPx: 2,
  feColor: '#d9b48a',
  feWidthPx: 1,
  centroidColor: '#dc2626',
  centroidRadiusPx: 5,
  // KLEINER als der Schwerpunkt, und das ist keine Kosmetik: bei jeder doppelt
  // symmetrischen Figur fallen die beiden Punkte zusammen, und dann muss der
  // Schubmittelpunkt IM Schwerpunktkreis sichtbar bleiben.
  shearCentreColor: '#15803d',
  shearCentreRadiusPx: 3,
  stressPointColor: '#1d4ed8',
  stressPointSizePx: 6,
  // Dunkelgrau statt schwarz: die Wandmittellinien sind schwarz, und die
  // Bewehrung liegt bei einem `solid` gezeichneten Wandgraphen darueber.
  rebarColor: '#334155',
  // Der Radius sagt NICHTS ueber `As` — er ist die Groesse einer Markierung
  // (`rebar.ts`), zwischen Schwerpunkt (5) und Schubmittelpunkt (3).
  rebarRadiusPx: 4,
};
