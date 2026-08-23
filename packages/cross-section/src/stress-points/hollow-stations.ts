import type { mm } from '@baustatik/units';
import { type WallDirection, bisector } from './types';

/**
 * DER UMLAUF DES GESCHLOSSENEN KASTENS — die 16 Stellen, an denen das
 * Wandmodell seine Werte bildet.
 *
 * Warum die Liste als eigene Datei steht und nicht in der Vorlage: die Stellen
 * liegen nicht auf Ecken, sondern auf einem UMLAUF, dessen Reihenfolge selbst
 * die Aussage ist.
 *
 * DER KASTEN HAT KEINEN VERZWEIGUNGSKNOTEN, und deshalb hat ADR 0059 an ihm
 * nichts geaendert ausser den Wand-Ids. Seine Aussenecke verbindet ZWEI Waende
 * zu einem durchgehenden Umlauf; sie ist einwertig, weil dort nichts abzweigt.
 * Die sechzehn Stellen und ihre Nummern sind unveraendert.
 *
 * DIE REGEL DES PACKAGES ("alle Ecken der Umrissfigur und der Schwerpunkt")
 * trifft der Kasten mit einer Abwandlung, die seine Form erzwingt: sein
 * Schwerpunkt liegt IM LOCH, dort gibt es kein Material und damit keine
 * Spannung. An seine Stelle treten die vier WANDMITTEN — genau die Stellen, an
 * denen `S` sein Maximum hat, aus demselben Grund, aus dem es beim Vollrechteck
 * auf halber Hoehe sitzt.
 *
 * Von den acht Ecken der Umrissfigur stehen die vier AUSSEREN als Punkt
 * (`2`, `6`, `10`, `14`). Die vier inneren stehen nicht selbst, sondern als
 * ihre beiden Projektionen auf die Aussenflaechen (`1`/`3` an der oberen
 * rechten Ecke). Das ist keine Auslassung: die innere Ecke liegt ueberhaupt
 * nicht auf einer Wandflaeche, und ihre `y`- und `z`-Stelle stehen an den
 * Projektionen schon.
 *
 * Die Reihenfolge laeuft im Uhrzeigersinn ab der oberen rechten Ecke, in
 * der Ansicht mit `z` nach unten (Beleg TO 300/200/10 bzw. TO 400/200/10).
 */
export type HollowStation = {
  readonly y: mm;
  readonly z: mm;
  /**
   * Das WANDELEMENT, auf dem die Stelle liegt. Der Umlauf besteht aus acht
   * Elementen: vier Waende und die vier Gehrungen dazwischen.
   *
   * Am Kasten trennt die Id keine zwei Punkte voneinander — es gibt keinen
   * Ort, an dem zwei stehen. Sie steht trotzdem, weil ein Spannungspunkt seit
   * ADR 0059 sagt, auf welchem Element er liegt, und das gilt auch dort, wo es
   * gerade nichts zu unterscheiden gibt.
   */
  readonly wall: HollowWall;
  /**
   * WELCHER SCHNITT an dieser Stelle durch das Material geht.
   *
   * `flange` — senkrechter Schnitt durch den Gurt, `web` — waagerechter durch
   * den Steg. Beide sind `t` lang und eindeutig.
   *
   * `corner` ist die AUSSENECKE, und sie ist keins von beidem: dort stossen
   * zwei freie Flaechen zusammen, ein Schnitt "quer zur Wand" ist nicht
   * definiert. Der kuerzeste Weg durchs Material geht von dort zur INNENECKE,
   * also diagonal — die Gehrung. Sie ist `t·√2` lang, und der abgeschnittene
   * Teil ist von beiden Waenden aus derselbe.
   */
  readonly kind: 'flange' | 'web' | 'corner';
  /**
   * Die LAUFRICHTUNG des Umlaufs an dieser Stelle — dieselbe Drehrichtung, die
   * die Reihenfolge der Liste ohnehin schon ausspricht, nur als Vektor.
   *
   * `+s` LAEUFT GEGEN DIE NUMMERIERUNG, und das ist kein Versehen. Die
   * Nummern zaehlen ab der oberen rechten Ecke in die eine Richtung, die
   * Laufkoordinate in die andere — ein geschlossener Umlauf: Obergurt nach
   * rechts `(+1,0)`, rechter Steg nach unten `(0,+1)`, Untergurt nach links
   * `(-1,0)`, linker Steg nach oben `(0,-1)`.
   *
   * DER GRUND IST DER GEDRUCKTE AUSDRUCK. Er fuehrt fuer den Kasten eine in
   * sich STIMMIGE Konvention: ein einziger Umlauf, `Sy` kippt zwischen den
   * Stegen, `Sz` zwischen den Gurten. Unser Feld ist bis auf ein GLOBALES
   * Vorzeichen dasselbe, und ein globales Vorzeichen ist genau die Wahl der
   * Laufrichtung. Sie so zu legen, dass die Referenz Zeichen fuer Zeichen
   * stimmt, kostet nichts und macht aus dem Betragsvergleich einen echten
   * Vergleich.
   *
   * Beim gewalzten I ist es dasselbe Prinzip, nur je ELEMENT statt je
   * Querschnitt: dort orientiert der Schubfluss aus `+Vz` jede Wand einzeln,
   * und damit stimmen auch dessen dreizehn gedruckte Werte Zeichen fuer
   * Zeichen (ADR 0059).
   *
   * DIE AUSSENECKE HAT EINE, und zwar die WINKELHALBIERENDE. Dort ist nichts
   * undefiniert: der Umlauf laeuft ueber die Gehrung glatt von einer Wand in
   * die andere, und die Gehrung liegt unter 45°. Was an der Ecke nicht
   * definiert ist, ist die Tangente am MATERIALPUNKT der Aussenkante — und der
   * ist spannungsfrei, weil dort zwei freie Flaechen zusammenstossen. Der
   * Punkt fuehrt deshalb tau aus dem Fluss durch die GEHRUNG und sigma an der
   * ECKKOORDINATE. Das ist keine Ausnahme, sondern die Regel des Packages
   * noch einmal: `S` und `t` gehoeren zum Schnitt, die Koordinate zu sigma
   * (siehe `open-stations.ts`).
   */
  readonly direction: WallDirection;
};

/** Die acht Elemente des Umlaufs: vier Waende, vier Gehrungen. */
export type HollowWall =
  | 'flange-top'
  | 'flange-bottom'
  | 'web-left'
  | 'web-right'
  | 'corner-top-left'
  | 'corner-top-right'
  | 'corner-bottom-left'
  | 'corner-bottom-right';

/**
 * Die 16 Stellen fuer Aussenmasse `b`/`h` und umlaufende Wandstaerke `t`,
 * schwerpunktsbezogen und in Millimetern.
 *
 * `bi`/`hi` sind die LICHTEN halben Masse — der Ort, an dem die innere Ecke auf
 * die Aussenflaeche faellt.
 */
export function hollowStations(b: mm, h: mm, t: mm): readonly HollowStation[] {
  const yo = b / 2;
  const zo = h / 2;
  const yi = b / 2 - t;
  const zi = h / 2 - t;

  // `+s` laeuft GEGEN die Nummerierung (siehe `HollowStation.direction`).
  // Damit zeigt die Tangente im Gurt in Richtung `-sign(z)` und im Steg in
  // Richtung `sign(y)`; die Ecke nimmt beides und wird auf Laenge eins
  // gebracht. Die Wand-Id faellt aus derselben Lage.
  const flange = (y: mm, z: mm): HollowStation => ({
    y,
    z,
    wall: z < 0 ? 'flange-top' : 'flange-bottom',
    kind: 'flange',
    direction: { ty: -Math.sign(z), tz: 0 },
  });
  const web = (y: mm, z: mm): HollowStation => ({
    y,
    z,
    wall: y > 0 ? 'web-right' : 'web-left',
    kind: 'web',
    direction: { ty: 0, tz: Math.sign(y) },
  });
  const cornerWall = (y: mm, z: mm): HollowWall => {
    if (z < 0) return y > 0 ? 'corner-top-right' : 'corner-top-left';
    return y > 0 ? 'corner-bottom-right' : 'corner-bottom-left';
  };
  const corner = (y: mm, z: mm): HollowStation => ({
    y,
    z,
    wall: cornerWall(y, z),
    kind: 'corner',
    direction: bisector(-Math.sign(z), Math.sign(y)),
  });

  return [
    web(yo, -zi), //   1  rechter Steg, obere innere Ecke
    corner(yo, -zo), //   2  Aussenecke oben rechts
    flange(yi, -zo), //   3  Obergurt, innere Ecke projiziert
    flange(0, -zo), //   4  Obergurt, Mitte
    flange(-yi, -zo), //   5
    corner(-yo, -zo), //   6  Aussenecke oben links
    web(-yo, -zi), //   7  linker Steg, obere innere Ecke
    web(-yo, 0), //   8  linker Steg, Mitte
    web(-yo, zi), //   9  linker Steg, untere innere Ecke
    corner(-yo, zo), //  10  Aussenecke unten links
    flange(-yi, zo), //  11
    flange(0, zo), //  12  Untergurt, Mitte
    flange(yi, zo), //  13
    corner(yo, zo), //  14  Aussenecke unten rechts
    web(yo, zi), //  15  rechter Steg, untere innere Ecke
    web(yo, 0), //  16  rechter Steg, Mitte
  ];
}
