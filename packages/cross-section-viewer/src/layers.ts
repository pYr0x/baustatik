// Zeichenbaender einer Querschnitts-Szene, in Malreihenfolge — HINTEN = OBEN.
//
// Dieses Tupel ist gleichzeitig Namensliste, Typquelle und z-Reihenfolge: eine
// Deklaration, eine Wahrheit. Welche Baender ein Querschnitt hat, ist Fachwissen
// und lebt deshalb hier und nicht in render-core, das auch den Rahmen bedient.
//
// Ohne Baender stapeln sich Gridlinien mit der Zeit UEBER dem Querschnitt: die
// Grid-IDs sind welt-indiziert, beim Zoom-Out kommen neue Weltpositionen in den
// Sichtbereich, und der Renderer haengt neu gebaute Shapes ans Ende. Die
// Querschnittsteile behalten ihre stabile ID, werden nie neu gebaut und sinken
// dadurch effektiv immer tiefer.
//
// DIE REIHENFOLGE DER DREI OBEREN BAENDER IST EINE AUSSAGE:
//
//   `thin-walls` — die EINGABE, breite Striche mit physischer Wandstaerke.
//   `outlines`   — der daraus ABGELEITETE Umriss. Er liegt darueber, weil eine
//                  gekappte Miter-Spitze sonst unter der Wand verschwaende, aus
//                  der sie entstand.
//   `rebar`      — die Bewehrung. EINGABE und kein Ergebnis, deshalb nicht in
//                  `symbols` — aber ueber dem Umriss, denn ein Stab, den die
//                  Betonfigur verdeckt, ist keiner
//                  ([ADR 0064](../../../docs/adr/0064-the-reinforcement-lives-on-the-cross-section.md)).
//   `fe`         — das Netz. Es gehoert zu einer Rechnung, nicht zur Figur, und
//                  liegt deshalb ueber beiden: ein Drahtgitter, das die Wand
//                  verdeckt, ist richtig herum: man sieht hin, WEIL gerechnet
//                  wurde.
//   `symbols`    — Schwerpunkt, Schubmittelpunkt, Spannungspunkte. Immer oben:
//                  sie sind Punkte, und ein verdeckter Punkt ist keiner.
export const CROSS_SECTION_LAYERS = [
  'grid',
  'thin-walls',
  'outlines',
  'rebar',
  'fe',
  'symbols',
] as const;

export type CrossSectionLayer = (typeof CROSS_SECTION_LAYERS)[number];
