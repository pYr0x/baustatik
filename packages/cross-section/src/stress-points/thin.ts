import type { mm } from '@baustatik/units';
import { type StressPoint, stressPoint } from './types';

/**
 * DIE DÜNNWANDIGEN VORLAGEN — dasselbe Wandmodell, aus dem kappa fällt.
 *
 * Der Unterschied zum Umrissmodell in `outline.ts` ist keine Genauigkeitsfrage,
 * sondern eine andere Vorstellung davon, WIE DER SCHUB FLIESST. Das
 * Umrissmodell legt in jeder Höhe einen waagerechten Schnitt durch die volle
 * Umrissfigur; das Wandmodell lässt den Schubfluss LÄNGS der Wände laufen,
 * über ihre Mittellinien. Beim Vollquerschnitt fallen beide zusammen — die
 * Rechteckparabel IST Grashof —, beim I liegen sie 3 % auseinander.
 *
 * Dieselbe Frage darf nicht zwei Maschinen haben: `idealisation` steuert seit
 * [ADR 0029](../../../docs/adr/0029-stress-points-follow-the-idealisation.md)
 * BEIDE Antworten, kappa und die Spannungspunkte, oder keine.
 *
 * DIE GRÖSSEN KOMMEN AUS DENSELBEN FORMELN, die `thinPaths()` in
 * `shapes/i-symmetric.ts` und `shapes/t-section.ts` für kappa benutzt. Sie
 * stehen hier ein zweites Mal, weil ein `ShearFlowInterval` heute LAGELOS ist:
 * es ist ein Energieakkumulator ohne Startpunkt und Richtung, und `pathZ`
 * benutzt dasselbe Gurtobjekt viermal. Aus ihm die Stelle eines Punktes
 * abzulesen, ginge nicht. Was die beiden zusammenhält, sind die Tests: die Gurtgrößen
 * gegen 546 RSTAB-Punkte (`r = 0`), der Schwerpunkt des I gegen `Sy,max` des
 * Katalogs, das freie Stegende des T gegen null.
 *
 * ALLE ABMESSUNGEN IN MILLIMETERN, wie sie aus `ShapeSpec` hereinkommen. `S`
 * fällt in mm³ an; `stressPoint` macht cm³ daraus.
 *
 * VORZEICHEN: wie bei allen parametrischen Formen ist `Sy`/`Sz` das erste
 * Flächenmoment des Teils OBERHALB bzw. LINKS vom Punkt, also durchweg <= 0.
 * Das gewalzte Profil führt daneben RSTABs Umlaufkonvention; für `|tau|` ist
 * die Richtung gleichgültig.
 */

/**
 * `S` an einer Stelle der GURTWAND, gemessen von der nächsten freien Spitze.
 *
 * Eine Wand QUER zur Schubrichtung hat über ihre ganze Länge denselben
 * Hebelarm, `S` wächst also nur linear — das ist `crossWallInterval` in
 * `shear.ts`, hier an einer Stelle ausgewertet statt integriert.
 *
 * `Math.abs(y)`, weil der Gurt von BEIDEN Spitzen her aufgeschnitten wird: der
 * Schubfluss läuft von jeder freien Spitze zur Stegachse, und die beiden
 * Hälften sind spiegelbildlich.
 */
function alongFlange(arm: number, t: number, halfWidth: number, y: number) {
  return arm * t * (halfWidth - Math.abs(y));
}

/**
 * `S` an einer Stelle der STEGWAND, `zeta` vom Schwerpunkt des Wandmodells aus.
 *
 * `S0` ist, was der Steg von den Gurten erbt; ab da wächst es quadratisch,
 * weil der Hebelarm mit der Laufkoordinate wächst. `start` ist die Stelle, an
 * der der Steg beginnt — die GURTMITTELLINIE, nicht die Gurtunterkante. Genau
 * daran hängt der Unterschied zum Umrissmodell.
 */
function alongWeb(S0: number, t: number, start: number, zeta: number): number {
  return S0 + (t * (zeta * zeta - start * start)) / 2;
}

/**
 * `S` an einer Stelle der Gurtwand für `Vy` — der Gurt ist hier die Wand
 * LÄNGS der Schubrichtung, also wächst `S` quadratisch.
 *
 * Der Steg trägt für `Vy` NICHTS: sein abgeschnittener Teil ist um `y = 0`
 * symmetrisch, sein erstes Flächenmoment um z also null. Die Querkraft in y
 * läuft vollständig über die Gurte — und deshalb steht hier nur EINE
 * Funktion und keine zweite für den Steg.
 */
function acrossFlange(t: number, halfWidth: number, y: number) {
  return (t * (y * y - halfWidth * halfWidth)) / 2;
}

/**
 * Geschweißtes doppeltsymmetrisches I, dünnwandig — 15 Punkte.
 *
 * KOORDINATEN UND NUMMERN SIND DIE DER KOMPAKTEN VORLAGE (`iSymmetricPoints`),
 * unverändert. Nur `t` und `S` wechseln aufs Wandmodell: `tf` an allen
 * Gurtpunkten statt `b`, `tw` am Schwerpunkt.
 *
 * Der Gurt ist im Wandmodell eine LINIE bei `z = ±zf`; Ober- und Unterseite
 * fallen auf dieselbe Wandstelle. Deshalb bekommen die vier Punkte einer
 * Gurtkante paarweise dieselben Werte — und deshalb druckt das gewalzte Profil
 * die Gurtunterseiten-Ecken gar nicht erst.
 */
export function iSymmetricThinPoints(
  h: mm,
  b: mm,
  tw: mm,
  tf: mm,
): StressPoint[] {
  const top = -h / 2;
  const topInner = -h / 2 + tf;
  const bottomInner = h / 2 - tf;
  const bottom = h / 2;

  /** Gurtmittellinie — der Hebelarm des Gurts, wie in `rolled-i.ts`. */
  const zf = (h - tf) / 2;

  /**
   * `S` an einem Gurtpunkt, für BEIDE Gurte dieselbe Zahl.
   *
   * Am unteren Gurt ist der Teil oberhalb alles AUSSER dem Überstand
   * darunter; weil das erste Flächenmoment des ganzen Querschnitts
   * verschwindet, ist das genau das Negative des Überstands — und damit
   * derselbe Wert wie oben. RSTAB druckt an den gespiegelten Punkten dasselbe
   * `Sy`, aus demselben Grund.
   */
  const flange = (nr: number, y: mm, z: mm): StressPoint =>
    stressPoint(
      nr,
      y,
      z,
      tf,
      alongFlange(-zf, tf, b / 2, y),
      acrossFlange(tf, b / 2, y),
    );

  /** Was der Steg von den beiden oberen Gurthälften erbt. */
  const fromFlange = 2 * alongFlange(-zf, tf, b / 2, 0);

  return [
    flange(1, -b / 2, top),
    flange(2, 0, top),
    flange(3, b / 2, top),
    flange(4, -b / 2, topInner),
    flange(5, -tw / 2, topInner),
    flange(6, tw / 2, topInner),
    flange(7, b / 2, topInner),
    flange(8, -b / 2, bottomInner),
    flange(9, -tw / 2, bottomInner),
    flange(10, tw / 2, bottomInner),
    flange(11, b / 2, bottomInner),
    flange(12, -b / 2, bottom),
    flange(13, 0, bottom),
    flange(14, b / 2, bottom),
    // Der Schwerpunkt sitzt am STEG, und hier trennen sich Wandmodell und
    // Umrissmodell: der Steg läuft von Gurtmitte zu Gurtmitte (`±zf`), nicht
    // über die lichte Höhe. Bei IPE-80-Massen sind das 11,60 statt 11,25 cm³
    // — und der Katalog sagt 11,61.
    stressPoint(15, 0, 0, tw, alongWeb(fromFlange, tw, -zf, 0), 0),
  ];
}

/**
 * Geschweißtes T-Profil, dünnwandig — 9 Punkte.
 *
 * ZWEI SCHWERPUNKTE, und das ist der Sonderfall dieser Form. Die KOORDINATEN
 * liegen um `zs`, den Schwerpunkt der Umrissfigur — so, wie sigma sie braucht,
 * denn `A` und `Iy` kommen ebenfalls aus der Umrissfigur. `S` dagegen läuft um
 * `zsWall`, den Schwerpunkt des WANDMODELLS: sonst schlösse der Weg am freien
 * Stegende nicht auf null und `S` wäre zweideutig, je nachdem, von welcher
 * Seite man schneidet.
 *
 * DER VERSATZ `zs - zsWall` IST DIE NÄHERUNG DIESER FORM. Punkt 9 liegt damit
 * nicht ganz im Maximum von `S`. Bei den doppeltsymmetrischen Formen ist der
 * Versatz exakt null; ein Charakterisierungstest hält ihn hier mit Zahl fest.
 *
 * Beide Schwerpunkte kommen von außen herein, weil sie schon gerechnet sind —
 * `tSectionCentroid` und `tSectionWall` in `shapes/t-section.ts`. Zwei
 * Rechnungen für eine Zahl wären zwei Gelegenheiten, sie verschieden zu
 * bekommen.
 */
export function tSectionThinPoints(
  bf: mm,
  hf: mm,
  bw: mm,
  h: mm,
  zs: mm,
  zsWall: mm,
): StressPoint[] {
  const top = -zs;
  const flangeBottom = -zs + hf;
  const bottom = h - zs;

  /** Gurtmittellinie, relativ zum Schwerpunkt des Wandmodells. */
  const armF = hf / 2 - zsWall;
  /** Von den Koordinaten der Umrissfigur auf die des Wandmodells. */
  const toWall = (z: mm) => z + zs - zsWall;

  const flange = (nr: number, y: mm, z: mm): StressPoint =>
    stressPoint(
      nr,
      y,
      z,
      hf,
      alongFlange(armF, hf, bf / 2, y),
      acrossFlange(hf, bf / 2, y),
    );

  /** Was der Steg von den beiden Gurthälften erbt. */
  const fromFlange = 2 * alongFlange(armF, hf, bf / 2, 0);

  // `Sz = 0` an allen Stegpunkten: für `Vy` ist der Steg eine Linie auf der
  // Symmetrieachse und trägt nichts.
  const web = (nr: number, y: mm, z: mm): StressPoint =>
    stressPoint(nr, y, z, bw, alongWeb(fromFlange, bw, armF, toWall(z)), 0);

  return [
    flange(1, -bf / 2, top),
    flange(2, bf / 2, top),
    flange(3, -bf / 2, flangeBottom),
    flange(4, -bw / 2, flangeBottom),
    flange(5, bw / 2, flangeBottom),
    flange(6, bf / 2, flangeBottom),
    // Das freie Stegende. Dass hier null herauskommt, ist nicht gesetzt,
    // sondern GERECHNET — die Selbstprüfung des Weges und der Grund, warum
    // `S` um `zsWall` läuft.
    web(7, -bw / 2, bottom),
    web(8, bw / 2, bottom),
    // Der Schwerpunkt der Umrissfigur liegt IMMER am Steg: `zs > hf/2` gilt,
    // solange es unter dem Gurt überhaupt einen Steg gibt. Deshalb `t = bw`
    // ohne Sonderfall — anders als bei der kompakten Vorlage, wo der breite
    // Gurt dort `t = bf` liefert.
    web(9, 0, 0),
  ];
}
