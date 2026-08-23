import type { mm } from '@baustatik/units';
import { type HollowStation, hollowStations } from './hollow-stations';
import {
  iSymmetricStations,
  type OpenStation,
  tSectionStations,
} from './open-stations';
import { type StressPoint, stressPoint } from './types';

/**
 * DIE DÜNNWANDIGEN VORLAGEN — dasselbe Wandmodell, aus dem kappa fällt, und
 * seit [ADR 0057](../../../../docs/adr/0057-the-parametric-solid-section-has-no-stress-points.md)
 * die EINZIGEN parametrischen Vorlagen.
 *
 * Das Wandmodell lässt den Schubfluss LÄNGS der Wände laufen, über ihre
 * Mittellinien. Daneben stand bis ADR 0057 ein Umrissmodell, das in jeder Höhe
 * waagerecht durch die volle Figur schnitt (Grashof). Es ist weg, nicht weil es
 * ungenau wäre, sondern weil ein Vollquerschnitt gar kein Schnittmodell ist:
 * seine Spannungen kommen aus der FE (ADR 0054).
 *
 * Dieselbe Frage darf nicht zwei Maschinen haben: `idealisation` steuert seit
 * [ADR 0029](../../../../docs/adr/0029-stress-points-follow-the-idealisation.md)
 * kappa und die Spannungspunkte gemeinsam — für `solid` heißt das seit ADR 0057
 * kappa aus Grashof und gar keine Punkte.
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
 * VORZEICHEN: JEDE WAND IST EIN ELEMENT
 * ([ADR 0059](../../../../docs/adr/0059-the-branch-node-carries-two-stress-points.md)),
 * orientiert in Richtung des Schubflusses aus einem positiven `Vz`. `Sy` und
 * `Sz` sind das erste Flächenmoment des auf DIESEM Element bereits
 * durchlaufenen Teils. Das Vorzeichen ist damit gerechnet und nicht gesetzt —
 * und es ist die einzige Auskunft, mit der sich die Anteile aus `Vy` und `Vz`
 * überhaupt addieren lassen (`types.ts`).
 *
 * Bis ADR 0058 trugen beide Größen ein pauschales Minus und liefen je Größe in
 * ihre eigene Richtung: `Sy` von der nächsten freien Spitze, `Sz` durchgehend
 * von links. Bis ADR 0059 lief dann EINE Richtung (`+y`) durch den ganzen Gurt,
 * was `Sy` am Knoten kippen ließ und den Punkt dort zweiwertig machte. Jetzt
 * trägt jedes Element seine eigene Richtung, jeder Punkt genau einen Wert.
 */

/**
 * `S` für `Vz` an einer Stelle der GURTWAND.
 *
 * Eine Wand QUER zur Schubrichtung hat über ihre ganze Länge denselben
 * Hebelarm, `S` wächst also nur linear mit der Laufkoordinate — das ist
 * `crossWallInterval` in `calculation/shear.ts`, hier an einer Stelle
 * ausgewertet statt integriert. Die Laufkoordinate ist der Abstand von der
 * freien Spitze, `halfWidth - |y|`.
 *
 * `arm` IST FÜR BEIDE GURTE DERSELBE, und das ist die eigentliche Nachricht
 * dieser Funktion. Am OBERGURT läuft das Element von der Spitze zum Knoten;
 * durchlaufen ist der nahe Überstand, und der liegt bei `-zf`. Am UNTERGURT
 * läuft es vom Knoten zur Spitze; durchlaufen ist alles ANDERE, und das erste
 * Flächenmoment eines Komplements ist das Negative des Teils — der Überstand
 * liegt dort bei `+zf`, also kommt wieder `-zf` heraus. Deshalb steht hier
 * kein `side` und kein Vorzeichen je Gurt mehr.
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
 *
 * AN `zeta = start` LIEFERT SIE GENAU `S0` — den Gurtanteil, geführt mit der
 * Stegdicke. Das ist der Sprung von tau an der Gurtunterkante, und seit
 * ADR 0059 braucht er keinen eigenen Stellentyp mehr.
 */
function alongWeb(S0: number, t: number, start: number, zeta: number): number {
  return S0 + (t * (zeta * zeta - start * start)) / 2;
}

/**
 * `S` für `Vy` an einer Stelle der Gurtwand — der Gurt ist hier die Wand
 * LÄNGS der Schubrichtung, also wächst `S` quadratisch.
 *
 * `ty` ist die Tangente des Elements. Das Element links vom Knoten läuft am
 * Obergurt in `+y` und am Untergurt in `-y`; beim einen ist der durchlaufene
 * Teil der linke Streifen, beim anderen sein Komplement, und beide Male dreht
 * `ty` das Vorzeichen richtig herum. Genau HIER sitzt seit ADR 0059 die
 * Zweiwertigkeit des Knotens: `Sy` ist dort einwertig, `Sz` nicht.
 *
 * Der Steg trägt für `Vy` NICHTS: sein abgeschnittener Teil ist um `y = 0`
 * symmetrisch, sein erstes Flächenmoment um z also null. Die Querkraft in y
 * läuft vollständig über die Gurte — und deshalb steht hier nur EINE
 * Funktion und keine zweite für den Steg.
 */
function acrossFlange(ty: number, t: number, halfWidth: number, y: number) {
  return (ty * t * (y * y - halfWidth * halfWidth)) / 2;
}

/**
 * Geschweißtes doppeltsymmetrisches I, dünnwandig — 15 Punkte auf fünf
 * Elementen.
 *
 * KOORDINATEN, NUMMERN UND ELEMENTE KOMMEN AUS `iSymmetricStations`, `t` und
 * `S` aus dem Wandmodell: `tf` an allen zwölf Gurtpunkten, `tw` an den drei
 * Stegpunkten.
 *
 * BEI `r = 0` DIESELBEN ZAHLEN WIE DAS GEWALZTE PROFIL — an allen fünfzehn
 * Punkten, bis aufs letzte Bit. Seit ADR 0053 gilt das auch am Schwerpunkt:
 * der Steg läuft hier wie dort über die LICHTE Höhe.
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
   * `S` an einem Gurtpunkt.
   *
   * `-zf` FÜR BEIDE GURTE, nicht `Math.sign(z) * zf`: am Untergurt ist der
   * durchlaufene Teil das Komplement des Überstands, und dessen erstes
   * Flächenmoment ist das Negative (siehe `alongFlange`). Die vier Vorzeichen
   * des klassischen I-Bildes fallen daraus zusammen mit der Elementtangente —
   * Obergurt von den Spitzen zum Steg, Untergurt vom Steg zu den Spitzen.
   */
  const flange = (
    nr: number,
    { y, z, wall, direction }: OpenStation,
  ): StressPoint =>
    stressPoint(
      nr,
      wall,
      y,
      z,
      tf,
      alongFlange(-zf, tf, b / 2, y),
      acrossFlange(direction.ty, tf, b / 2, y),
      direction,
    );

  /** Was der Steg von den beiden oberen Gurthälften erbt. */
  const fromFlange = 2 * alongFlange(-zf, tf, b / 2, 0);

  const point = (nr: number, station: OpenStation): StressPoint => {
    const { y, z, wall, kind, direction } = station;
    switch (kind) {
      case 'flange':
        return flange(nr, station);
      case 'web':
        // Der Steg läuft über die LICHTE Höhe (`±zw`), weil die Wände die
        // Umrissfigur kacheln — der Gurt ist bereits ganz gezählt. An `∓zw`
        // liefert das genau den Gurtanteil (der Sprung von tau an der
        // Gurtunterkante), im Schwerpunkt bei IPE-80-Massen 11,25 cm³ — genau
        // das, was `rolled-i.ts` bei `r = 0` rechnet.
        return stressPoint(
          nr,
          wall,
          y,
          z,
          tw,
          alongWeb(fromFlange, tw, -zw, z),
          0,
          direction,
        );
    }
  };

  return iSymmetricStations(h, b, tw, tf).map((station, index) =>
    point(index + 1, station),
  );
}

/**
 * Geschweißtes T-Profil, dünnwandig — 10 Punkte auf drei Elementen.
 *
 * Die Stellen kommen aus `tSectionStations`. Die sechs Gurtpunkte liegen auf
 * der AUSSENfaser, weil `S` und `t` zum SCHNITT gehören und nicht zur Faser;
 * Punkt 7 ist die Stegoberkante mit dem Sprung von tau.
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

  // Der T hat nur EINEN Gurt, und der ist der obere: sein Hebelarm ist `armF`,
  // negativ, weil die Gurtmittellinie über dem Schwerpunkt liegt. Beide
  // Gurtelemente laufen auf den Knoten zu, also gilt `armF` unverändert — das
  // Komplement-Argument des I-Untergurts kommt hier gar nicht vor.
  const flange = (
    nr: number,
    { y, z, wall, direction }: OpenStation,
  ): StressPoint =>
    stressPoint(
      nr,
      wall,
      y,
      z,
      hf,
      alongFlange(armF, hf, bf / 2, y),
      acrossFlange(direction.ty, hf, bf / 2, y),
      direction,
    );

  /** Was der Steg von den beiden Gurthälften erbt. */
  const fromFlange = 2 * alongFlange(armF, hf, bf / 2, 0);

  // `Sz = 0` an allen Stegpunkten: für `Vy` ist der Steg eine Linie auf der
  // Symmetrieachse und trägt nichts.
  const point = (nr: number, station: OpenStation): StressPoint => {
    const { y, z, wall, kind, direction } = station;
    switch (kind) {
      case 'flange':
        return flange(nr, station);
      case 'web':
        // Stegoberkante, Schwerpunkt und freies Stegende. An der Oberkante
        // (`zeta = armW`) ist abgetrennt GENAU der Gurt, geführt wird schon
        // `bw`. Dass am Stegende null herauskommt, ist nicht gesetzt, sondern
        // GERECHNET — die Selbstprüfung des Weges und der Beleg, dass die
        // beiden Kacheln die Umrissfigur wirklich treffen.
        //
        // `t = bw` auch am Schwerpunkt, ohne Sonderfall: beim breiten Gurt
        // kann er im Gurt liegen, aber der Schubfluss läuft um diese Höhe
        // herum im Steg — im Gurt ist er längst zu den Spitzen abgeflossen.
        return stressPoint(
          nr,
          wall,
          y,
          z,
          bw,
          alongWeb(fromFlange, bw, armW, z),
          0,
          direction,
        );
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
 * ER HAT AUCH KEINEN VERZWEIGUNGSKNOTEN, und deshalb hat ADR 0059 hier nichts
 * geaendert: die Aussenecke verbindet zwei Waende zu einem durchgehenden
 * Umlauf, sie ist einwertig, und die Nummerierung steht wie zuvor.
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
 * der Gehrungsschnitt `t·√2` lang ist. Das ist die Regel des Packages ("an
 * einer Sprungstelle gilt die kleinere Breite") und die sichere Seite: an der
 * konvexen Aussenecke ist der wahre Schubfluss ohnehin null, weil beide
 * angrenzenden Flaechen schubfrei sind.
 *
 * VORZEICHEN: DER GESCHLOSSENE QUERSCHNITT IST DER FALL, an dem ein pauschales
 * Minus am offensichtlichsten falsch ist. Ein umlaufender Fluss KANN nicht
 * durchweg ein Vorzeichen haben: fuer `Vz` laeuft er in beiden Stegen nach
 * unten, und in einer festen Umlaufrichtung heisst das im linken Steg `+s`
 * und im rechten `-s`.
 *
 * Der Umlauf steht in `hollowStations` — die Reihenfolge der Liste IST er, und
 * die Tangente jeder Stelle faellt daraus. Von dort kommen auch die beiden
 * Vorzeichen hier:
 *
 * - `Sy` traegt `-sign(y)`. Sein Nullschnitt liegt in GURTMITTE (4 und 12),
 *   und der bereits durchlaufene Teil liegt immer auf der Seite, auf der man
 *   steht.
 * - `Sz` traegt `sign(z)`. Sein Nullschnitt liegt in STEGMITTE (8 und 16).
 *
 * `Math.sign(0)` ist null und trifft damit genau die vier Nullschnitte — an
 * denen die Betragsformeln ohnehin schon null liefern. Die Probe: `q = -Vz*Sy/Iy`
 * ergibt Fluss von der Obergurtmitte zu beiden Ecken, beide Stege hinunter,
 * und im Untergurt von den Ecken zur Mitte zurueck.
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

  /** Die Gehrung an der Aussenecke — in `a` und `c` symmetrisch, als BETRAG. */
  const mitre = t * (a * c - (a * t) / 2 - (c * t) / 2 + (t * t) / 3);

  const point = (
    nr: number,
    { y, z, wall, kind, direction }: HollowStation,
  ): StressPoint => {
    /** Vorzeichen aus dem Umlauf; die Formeln darunter liefern Betraege. */
    const sy = -Math.sign(y);
    const sz = Math.sign(z);
    switch (kind) {
      case 'corner':
        return stressPoint(
          nr,
          wall,
          y,
          z,
          t,
          sy * mitre,
          sz * mitre,
          direction,
        );
      case 'flange':
        // Fuer `Sy` liegt der Punkt VOR der Ecke, fuer `Sz` dahinter.
        return stressPoint(
          nr,
          wall,
          y,
          z,
          t,
          sy * across(zm, Math.abs(y)),
          sz * along(across(ym, c), yi, Math.abs(y)),
          direction,
        );
      case 'web':
        return stressPoint(
          nr,
          wall,
          y,
          z,
          t,
          sy * along(across(zm, a), zi, Math.abs(z)),
          sz * across(ym, Math.abs(z)),
          direction,
        );
    }
  };

  return hollowStations(b, h, t).map((station, index) =>
    point(index + 1, station),
  );
}
