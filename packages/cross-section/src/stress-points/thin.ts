import type { mm } from '@baustatik/units';
import { type HollowStation, hollowStations } from './hollow-stations';
import {
  iSymmetricStations,
  type OpenStation,
  tSectionStations,
} from './open-stations';
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
 * [ADR 0029](../../../../docs/adr/0029-stress-points-follow-the-idealisation.md)
 * BEIDE Antworten, kappa und die Spannungspunkte, oder keine.
 *
 * DIE GRÖSSEN KOMMEN AUS DENSELBEN FORMELN, die `thinPaths()` in
 * `shapes/i-symmetric.ts` und `shapes/t-section.ts` für kappa benutzt. Sie
 * stehen hier ein zweites Mal, weil ein `ShearFlowInterval` heute LAGELOS ist:
 * es ist ein Energieakkumulator ohne Startpunkt und Richtung, und `pathZ`
 * benutzt dasselbe Gurtobjekt viermal. Aus ihm die Stelle eines Punktes
 * abzulesen, ginge nicht. Was die beiden zusammenhält, sind die Tests: die Gurtgrößen
 * gegen die Punkte des Profilkatalogs (`r = 0`), der Schwerpunkt des I gegen `Sy,max` des
 * Katalogs, das freie Stegende des T gegen null.
 *
 * ALLE ABMESSUNGEN IN MILLIMETERN, wie sie aus `ShapeSpec` hereinkommen. `S`
 * fällt in mm³ an; `stressPoint` macht cm³ daraus.
 *
 * VORZEICHEN: wie bei allen parametrischen Formen ist `Sy`/`Sz` das erste
 * Flächenmoment des Teils OBERHALB bzw. LINKS vom Punkt, also durchweg <= 0.
 * Das gewalzte Profil führt daneben eine Umlaufkonvention; für `|tau|` ist
 * die Richtung gleichgültig.
 */

/**
 * `S` an einer Stelle der GURTWAND, gemessen von der nächsten freien Spitze.
 *
 * Eine Wand QUER zur Schubrichtung hat über ihre ganze Länge denselben
 * Hebelarm, `S` wächst also nur linear — das ist `crossWallInterval` in
 * `calculation/shear.ts`, hier an einer Stelle ausgewertet statt integriert.
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
 * der der Steg beginnt — die GURTUNTERKANTE, nicht die Gurtmittellinie
 * ([ADR 0053](../../../../docs/adr/0053-the-stress-point-walls-tile-the-outline.md)).
 * Der Gurt ist schon eine volle Wand; ließe man den Steg an der Mittellinie
 * beginnen, zählte er das Stück dazwischen ein zweites Mal.
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
 * Geschweißtes doppeltsymmetrisches I, dünnwandig — 13 Punkte.
 *
 * KOORDINATEN UND NUMMERN SIND DIE DER KOMPAKTEN VORLAGE, weil beide dieselbe
 * Liste lesen (`iSymmetricStations`). Nur `t` und `S` wechseln aufs
 * Wandmodell: `tf` an allen Gurtpunkten statt `b`, `tw` an den dreien auf der
 * Stegachse.
 *
 * DIESELBE NUMMERIERUNG WIE DAS GEWALZTE PROFIL, und bei `r = 0` auch
 * DIESELBEN ZAHLEN AN ALLEN DREIZEHN PUNKTEN — bis aufs letzte Bit. Seit
 * ADR 0053 gilt das auch am Schwerpunkt: der Steg läuft hier wie dort über die
 * LICHTE Höhe. `rolled-i.ts` hat das immer so gerechnet; die
 * Mittellinienfassung war die Abweichlerin.
 *
 * Der Gurt ist im Wandmodell eine LINIE bei `z = ±zf`; Ober- und Unterseite
 * fallen auf dieselbe Wandstelle. Genau deshalb liegen die
 * Verschneidungsschnitte auf der AUSSENfaser: `S` und `t` sind auf beiden
 * Fasern dieselben, sigma ist außen größer.
 */
export function iSymmetricThinPoints(
  h: mm,
  b: mm,
  tw: mm,
  tf: mm,
): StressPoint[] {
  /** Gurtmittellinie — der Hebelarm des Gurts, wie in `rolled-i.ts`. */
  const zf = (h - tf) / 2;
  /** Gurtunterkante — dort beginnt der Steg (ADR 0053). */
  const zw = h / 2 - tf;

  /**
   * `S` an einem Gurtpunkt, für BEIDE Gurte dieselbe Zahl.
   *
   * Am unteren Gurt ist der Teil oberhalb alles AUSSER dem Überstand
   * darunter; weil das erste Flächenmoment des ganzen Querschnitts
   * verschwindet, ist das genau das Negative des Überstands — und damit
   * derselbe Wert wie oben. An den gespiegelten Punkten ergibt sich dasselbe
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

  const point = (nr: number, { y, z, wall }: OpenStation): StressPoint => {
    switch (wall) {
      case 'flange':
        return flange(nr, y, z);
      case 'junction':
        // ABGETRENNT IST GENAU DER GURT, gefuehrt wird schon `tw`. Hier den
        // Stegweg zu benutzen hiesse, das Stueck zwischen Gurtmittellinie und
        // Gurtunterkante ein zweites Mal zu zaehlen — dieselbe Ecklücke, die
        // beim Kasten `t³/8` hiess (ADR 0051). Das gewalzte Profil rechnet an
        // seinen Punkten 11/12 dasselbe, dort `aboveWebStart`.
        return stressPoint(nr, y, z, tw, fromFlange, 0);
      case 'web':
        // Der Schwerpunkt. Der Steg läuft über die LICHTE Höhe (`±zw`), weil
        // die Wände die Umrissfigur kacheln — der Gurt ist bereits ganz
        // gezählt. Bei IPE-80-Massen sind das 11,25 cm³, genau das, was
        // `rolled-i.ts` bei `r = 0` liefert.
        return stressPoint(nr, y, z, tw, alongWeb(fromFlange, tw, -zw, z), 0);
    }
  };

  return iSymmetricStations(h, b, tw, tf).map((station, index) =>
    point(index + 1, station),
  );
}

/**
 * Geschweißtes T-Profil, dünnwandig — 9 Punkte.
 *
 * Die Stellen kommen aus `tSectionStations`, dieselbe Liste, die auch das
 * Umrissmodell liest. Die fünf Gurtpunkte liegen auf der AUSSENfaser, weil
 * `S` und `t` zum SCHNITT gehören und nicht zur Faser; Punkt 6 ist die
 * Stegoberkante mit dem Sprung von tau.
 *
 * EIN SCHWERPUNKT, und das war bis
 * [ADR 0053](../../../../docs/adr/0053-the-stress-point-walls-tile-the-outline.md)
 * anders. `S` läuft um `zs`, den Schwerpunkt der UMRISSFIGUR — dieselbe Achse,
 * um die sigma rechnet, weil `A` und `Iy` ebenfalls von dort kommen.
 *
 * DASS DER WEG DAMIT ÜBERHAUPT AUF NULL SCHLIESST, hängt am Kacheln: Gurt
 * (`bf × hf`) und Steg (`bw × (h − hf)`) überdecken die Umrissfigur
 * lückenlos und überschneidungsfrei, ihr gemeinsamer Schwerpunkt IST `zs`.
 * Ein Steg ab der Gurtmittellinie wäre eine andere Figur mit einem anderen
 * Schwerpunkt (`zsWall`), und dann müsste `S` um DEN laufen — mit einem
 * Versatz zu den Koordinaten, den man nur benennen, nicht wegrechnen kann.
 *
 * `zsWall` LEBT WEITER, aber nur für kappa: der Schubenergie-Weg behält die
 * Mittellinienabwicklung, weil die Schubflächen des Profilkatalogs auf ihr
 * definiert sind. Warum dieselbe Idealisierung an zwei Stellen zwei
 * Wandlängen führt, steht in ADR 0053.
 */
export function tSectionThinPoints(
  bf: mm,
  hf: mm,
  bw: mm,
  h: mm,
  zs: mm,
): StressPoint[] {
  /** Gurtmittellinie, relativ zum Schwerpunkt der Umrissfigur. */
  const armF = hf / 2 - zs;
  /** Gurtunterkante — dort beginnt der Steg. */
  const armW = hf - zs;

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
  const point = (nr: number, { y, z, wall }: OpenStation): StressPoint => {
    switch (wall) {
      case 'flange':
        return flange(nr, y, z);
      case 'junction':
        // Abgetrennt ist genau der Gurt, gefuehrt wird schon `bw`. Den
        // Stegweg zu nehmen zaehlte das Stueck zwischen Gurtmittellinie und
        // Gurtunterkante doppelt.
        return stressPoint(nr, y, z, bw, fromFlange, 0);
      case 'web':
        // Schwerpunkt und freies Stegende. Dass am Stegende null
        // herauskommt, ist nicht gesetzt, sondern GERECHNET — die
        // Selbstprüfung des Weges und der Beleg, dass die beiden Kacheln die
        // Umrissfigur wirklich treffen.
        //
        // `t = bw` auch am Schwerpunkt, ohne Sonderfall: beim breiten Gurt
        // kann er im Gurt liegen, aber der Schubfluss läuft um diese Höhe
        // herum im Steg. Die kompakte Vorlage liefert dort `t = bf`.
        return stressPoint(nr, y, z, bw, alongWeb(fromFlange, bw, armW, z), 0);
    }
  };

  return tSectionStations(bf, hf, bw, h, zs).map((station, index) =>
    point(index + 1, station),
  );
}

/**
 * Geschlossener Kasten, duennwandig — 16 Punkte.
 *
 * DER GESCHLOSSENE QUERSCHNITT HAT KEINEN FREIEN RAND, an dem `S = 0` waere.
 * Der Startschnitt kommt aus der Symmetrie, und er ist fuer die beiden
 * Richtungen ein ANDERER: fuer `Vz` liegt der Schubfluss in GURTMITTE still,
 * fuer `Vy` in STEGMITTE. Deshalb hat Punkt 4 `Sy = 0` und Punkt 8 `Sz = 0`,
 * und keiner der sechzehn Punkte hat beides.
 *
 * JEDER PUNKT IST EIN SCHNITT, und `S` ist das erste Flaechenmoment dessen,
 * was zwischen dem Symmetrieschnitt und ihm liegt — genommen an der
 * UMRISSFIGUR, nicht an der Mittellinie
 * ([ADR 0051](../../../../docs/adr/0051-the-closed-box-tiles-the-outline-figure.md)).
 * Damit ist `S` an allen zwoelf Wandpunkten EXAKT und nicht genaehert; das
 * reine Mittellinienmodell lag pro passierter Ecke um `t³/8` daneben.
 *
 * DIE ZERLEGUNG IST JE RICHTUNG EINE ANDERE, und beide parkettieren die Figur
 * lueckenlos:
 *
 * | | Wand QUER zur Schubrichtung | Wand LAENGS dazu |
 * | --- | --- | --- |
 * | `Sy` | Gurt, bis zur Aussenkante `b/2` | Steg, lichte Hoehe `h/2 − t` |
 * | `Sz` | Steg, bis zur Aussenkante `h/2` | Gurt, lichte Breite `b/2 − t` |
 *
 * Der Hebelarm bleibt in beiden Faellen die Mittellinie — er ist der
 * Schwerpunktabstand der Wand. Es sind dieselben Groessen, aus denen
 * `closedBoxPath` in `shapes/hollow-rectangle.ts` kappa bildet; sie stehen
 * hier ein zweites Mal, aus demselben Grund wie beim I und beim T (siehe Kopf
 * dieser Datei): ein `ShearFlowInterval` ist lagelos.
 *
 * DIE AUSSENECKE IST KEIN WANDSCHNITT. Dort stossen zwei freie Flaechen
 * zusammen; der kuerzeste Weg durchs Material geht zur INNENECKE, also
 * diagonal — die GEHRUNG. Der abgeschnittene Teil ist dann der Gurtstreifen
 * bis zur lichten Breite plus das halbe Eckquadrat, und das Ergebnis
 *
 *     S = t·(a·c − a·t/2 − c·t/2 + t²/3),   a = b/2, c = h/2
 *
 * ist in `a` und `c` SYMMETRISCH: von der Gurtseite und von der Stegseite
 * kommt dieselbe Zahl, und `Sy = Sz` an der Ecke. Beides ist gerechnet, nicht
 * gesetzt — ein Test haelt es fest.
 *
 * `t` bleibt an allen sechzehn Punkten die Wandstaerke, auch an der Ecke, wo
 * der Gehrungsschnitt `t·√2` lang ist. Das ist die Regel des Packages („an
 * einer Sprungstelle gilt die kleinere Breite") und die sichere Seite: an der
 * konvexen Aussenecke ist der wahre Schubfluss ohnehin null, weil beide
 * angrenzenden Flaechen schubfrei sind.
 *
 * VORZEICHEN: die Konvention der parametrischen Formen, also durchweg <= 0.
 * Ein Umlaufmodell druckt hier stattdessen die UMLAUFRICHTUNG — sein `Sy` kippt zwischen
 * linkem und rechtem Steg, weil der Umlauf sie entgegengesetzt durchlaeuft.
 * Fuer `|tau|` ist das gleichgueltig.
 */
export function hollowRectangleThinPoints(b: mm, h: mm, t: mm): StressPoint[] {
  /** Halbe Aussenmasse. */
  const a = b / 2;
  const c = h / 2;
  /** Halbe LICHTE Masse — dort endet die Wand laengs der Schubrichtung. */
  const yi = a - t;
  const zi = c - t;
  /** Die Mittellinien, und damit die Hebelarme. */
  const ym = a - t / 2;
  const zm = c - t / 2;

  /**
   * `S` einer Wand QUER zur Schubrichtung: fester Hebelarm, `S` waechst
   * linear — `crossWallInterval(arm, t, s)` aus `calculation/shear.ts`, hier
   * an einer Stelle ausgewertet statt integriert.
   */
  const across = (arm: number, s: number) => arm * t * s;
  /**
   * `S` einer Wand LAENGS der Schubrichtung, `s` vom Symmetrieschnitt aus.
   * Der Hebelarm waechst mit der Laufkoordinate, `S` also quadratisch; `S0`
   * ist, was die Wand von der Querwand erbt.
   */
  const along = (S0: number, half: number, s: number) =>
    S0 + (t * (half * half - s * s)) / 2;

  /** Die Gehrung an der Aussenecke — in `a` und `c` symmetrisch. */
  const mitre = t * (a * c - (a * t) / 2 - (c * t) / 2 + (t * t) / 3);

  const point = (nr: number, { y, z, wall }: HollowStation): StressPoint => {
    switch (wall) {
      case 'corner':
        return stressPoint(nr, y, z, t, -mitre, -mitre);
      case 'flange':
        // Fuer `Sy` liegt der Punkt VOR der Ecke, fuer `Sz` dahinter.
        return stressPoint(
          nr,
          y,
          z,
          t,
          -across(zm, Math.abs(y)),
          -along(across(ym, c), yi, Math.abs(y)),
        );
      case 'web':
        return stressPoint(
          nr,
          y,
          z,
          t,
          -along(across(zm, a), zi, Math.abs(z)),
          -across(ym, Math.abs(z)),
        );
    }
  };

  return hollowStations(b, h, t).map((station, index) =>
    point(index + 1, station),
  );
}
