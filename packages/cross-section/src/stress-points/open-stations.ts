import type { mm } from '@baustatik/units';
import { AGAINST_Y, ALONG_Y, ALONG_Z, type WallDirection } from './types';

/**
 * WO DIE PUNKTE DER OFFENEN PROFILE LIEGEN — einmal, für das Wandmodell.
 *
 * Bis [ADR 0057](../../../../docs/adr/0057-the-parametric-solid-section-has-no-stress-points.md)
 * las das Umrissmodell dieselbe Liste. Die parametrische Vollfigur trägt
 * seither gar keine Spannungspunkte mehr, und die Liste hat nur noch einen
 * Leser.
 *
 * SEIT [ADR 0059](../../../../docs/adr/0059-the-branch-node-carries-two-stress-points.md)
 * IST SIE EINE ELEMENTLISTE. Jede Wand ist ein Element mit einer eigenen
 * Laufrichtung, und der Verzweigungsknoten steht ZWEIMAL darin: einmal je
 * Element, gleicher Ort, entgegengesetzte Tangente. Die Nummerierung faellt
 * seither aus der Reihenfolge und ist kein Vertrag mehr gegenueber dem
 * gedruckten Ausdruck.
 *
 * Das Gegenstueck fuer den geschlossenen Kasten steht in `hollow-stations.ts`.
 * Getrennt, weil der Kasten keinen freien Rand hat und seine Stellen aus der
 * Symmetrie kommen statt aus den Wandenden.
 *
 * DIE REGEL, nach der diese Listen entstehen — sie hat die aeltere Fassung
 * "alle Ecken der Umrissfigur plus Schwerpunkt" abgeloest, weil die Ecken die
 * falsche Frage beantworten:
 *
 * > Eine Vorlage enthaelt jede STELLE, an der `S` oder `t` springt oder ein
 * > Maximum hat — und traegt die Koordinate dort in die RANDFASER.
 *
 * Die beiden Haelften der Regel gehoeren verschiedenen Groessen:
 *
 * - `S` und `t` gehoeren zum SCHNITT. Ein Schnitt durch den Gurt ist die
 *   senkrechte Linie durch die volle Gurtdicke; ob man den Punkt an ihrem
 *   oberen oder unteren Ende benennt, aendert an `S` und `t` nichts.
 * - Die KOORDINATE gehoert zu sigma, und sigma ist ueber die Hoehe linear.
 *   Von zwei Punkten auf demselben Schnitt ist der mit dem groesseren `|z|`
 *   also immer der massgebende.
 *
 * Daraus faellt beides: die Verschneidungsschnitte gehoeren auf die
 * AUSSENFASER des Gurts (gleiches `S`, gleiches `t`, groesseres sigma), und die
 * Gurtecken an der Gurtunterseite koennen weg — gleiches `y`, kleineres `|z|`
 * als die Gurtspitze darueber, also nie massgebend. Dieses Argument stand
 * lange nur beim GEWALZTEN Profil, als Begruendung dafuer, warum der
 * gedruckte Ausdruck sie nicht fuehrt.
 *
 * DER STEGPUNKT AN DER GURTUNTERKANTE ist der zweite Teil. Dort springt `tau`
 * um `tf/tw`, weil derselbe Schubfluss ploetzlich durch die Stegdicke muss,
 * und `|sigma|` ist noch fast so gross wie am Rand. Ein Punkt genuegt: ueber
 * die Stegdicke ist `tau` konstant, und `sigma` variiert quer nur um die
 * halbe Stegbreite.
 *
 * ER IST DIE ERSTE STELLE DES STEGELEMENTS und kein eigener Fall mehr. Bis
 * ADR 0059 hiess er `junction` und rechnete eigens; seit ADR 0053 beginnt der
 * Steg aber an der GURTUNTERKANTE, und dort liefert die Stegformel von selbst
 * genau den Gurtanteil. Es war ein Sonderfall, der laengst keiner mehr war.
 *
 * ALLE ABMESSUNGEN IN MILLIMETERN.
 */
export type OpenStation = {
  readonly y: mm;
  readonly z: mm;
  /**
   * Das WANDELEMENT, auf dem die Stelle liegt — die Identitaet, in der sich
   * die beiden Punkte des Verzweigungsknotens unterscheiden.
   */
  readonly wall: OpenWall;
  /**
   * Welcher SCHNITT hier durch das Material geht, und damit welche Formel die
   * Vorlage auswertet. Der Gurt ist die Wand QUER zur Schubrichtung aus `Vz`,
   * der Steg die Wand LAENGS dazu.
   */
  readonly kind: 'flange' | 'web';
  /**
   * Die LAUFRICHTUNG DES ELEMENTS an dieser Stelle, und damit das Vorzeichen
   * von `Sy` und `Sz`.
   *
   * SIE IST DIE RICHTUNG DES SCHUBFLUSSES aus einem positiven `Vz`
   * (ADR 0059): Obergurt von den beiden Spitzen zum Knoten, Steg nach unten,
   * Untergurt vom Knoten zu den Spitzen. Also `+y` links oben und `-y` rechts
   * oben, `+z` im Steg, `-y` links unten und `+y` rechts unten.
   *
   * Bis ADR 0059 lief EINE Richtung (`+y`) durch den ganzen Gurt. Das war in
   * sich stimmig, aber es zwang `Sy` am Knoten zu kippen und machte den Punkt
   * dort zweiwertig. Jetzt kippt nichts mehr: am Knoten stehen zwei Punkte,
   * ihr `Sy` ist gleich und ihr `Sz` entgegengesetzt.
   */
  readonly direction: WallDirection;
};

/**
 * Die Elemente der beiden offenen Vorlagen. Der T hat nur den oberen Gurt —
 * seine beiden Gurthaelften heissen deshalb wie die des I.
 */
export type OpenWall =
  | 'flange-top-left'
  | 'flange-top-right'
  | 'flange-bottom-left'
  | 'flange-bottom-right'
  | 'web';

/**
 * Eine Gurtstelle. Die Laufrichtung faellt aus der Wand: die beiden Elemente
 * links vom Knoten laufen in `+y` bzw. `-y`, je nachdem ob sie auf den Knoten
 * zu- oder von ihm weglaufen.
 */
const flange = (wall: OpenWall, y: mm, z: mm): OpenStation => ({
  y,
  z,
  wall,
  kind: 'flange',
  direction:
    wall === 'flange-top-left' || wall === 'flange-bottom-right'
      ? ALONG_Y
      : AGAINST_Y,
});

const web = (y: mm, z: mm): OpenStation => ({
  y,
  z,
  wall: 'web',
  kind: 'web',
  direction: ALONG_Z,
});

/**
 * Geschweisstes doppeltsymmetrisches I — 15 Stellen auf fuenf Elementen.
 *
 * ES WAREN DREIZEHN, und die dreizehn waren die Nummerierung des gedruckten
 * Katalogblatts. Seit ADR 0059 traegt jeder der beiden Verzweigungsknoten zwei
 * Punkte — je einen fuer das linke und das rechte Gurtelement —, und die
 * Nummerierung faellt aus der Reihenfolge statt aus dem Ausdruck. Die
 * Zuordnung `gedruckte Nr -> unsere Nr` steht als Tabelle im Test.
 *
 * Die Gurtecken an der Gurtunterseite fehlen weiter: gleiches `y`, kleineres
 * `|z|` als die Gurtspitze darueber, also nie massgebend.
 */
export function iSymmetricStations(
  h: mm,
  b: mm,
  tw: mm,
  tf: mm,
): readonly OpenStation[] {
  const zo = h / 2;
  const zi = h / 2 - tf;

  return [
    flange('flange-top-left', -b / 2, -zo), //  1  Obergurt links, freie Spitze
    flange('flange-top-left', -tw / 2, -zo), //  2  Obergurt links, Stegflanke
    flange('flange-top-left', 0, -zo), //  3  Knoten, linkes Element
    flange('flange-top-right', 0, -zo), //  4  Knoten, rechtes Element
    flange('flange-top-right', tw / 2, -zo), //  5  Obergurt rechts, Stegflanke
    flange('flange-top-right', b / 2, -zo), //  6  Obergurt rechts, freie Spitze
    flange('flange-bottom-left', -b / 2, zo), //  7  Untergurt links, Spitze
    flange('flange-bottom-left', -tw / 2, zo), //  8
    flange('flange-bottom-left', 0, zo), //  9  Knoten, linkes Element
    flange('flange-bottom-right', 0, zo), // 10  Knoten, rechtes Element
    flange('flange-bottom-right', tw / 2, zo), // 11
    flange('flange-bottom-right', b / 2, zo), // 12
    web(0, -zi), // 13  Steganfang oben — hier springt `tau` um `tf/tw`
    web(0, zi), // 14  Stegende unten
    web(0, 0), // 15  Schwerpunkt — Maximum von `Sy`
  ];
}

/**
 * Geschweisstes T — 10 Stellen auf drei Elementen, von oben nach unten.
 *
 * `zs` ist der Abstand des Schwerpunkts der UMRISSFIGUR von der
 * Gurtoberkante; alle Koordinaten liegen schwerpunktsbezogen.
 *
 * Der T verzweigt genau einmal, am Gurtpunkt auf der Stegachse: dort stossen
 * die beiden Gurtelemente und der Steg zusammen, und die Stelle steht deshalb
 * zweimal in der Liste (ADR 0059). Es waren neun Stellen, jetzt sind es zehn.
 *
 * Das freie Stegende traegt ZWEI Punkte, obwohl der Steg dort nur eine Stelle
 * hat: es ist die Stelle mit dem groessten `|z|`, also die massgebende fuer
 * `sigma`, und dort tut der Beitrag aus `Mz` etwas — er ist an `y = ±bw/2`
 * am groessten und an `y = 0` genau null. Am Gurt uebernimmt das die
 * Gurtspitze, hier gibt es keine. Beide liegen auf DEMSELBEN Element; sie sind
 * keine Verzweigung.
 */
export function tSectionStations(
  bf: mm,
  hf: mm,
  bw: mm,
  h: mm,
  zs: mm,
): readonly OpenStation[] {
  const top = -zs;
  const flangeBottom = -zs + hf;
  const bottom = h - zs;

  return [
    flange('flange-top-left', -bf / 2, top), //  1  Gurtspitze links
    flange('flange-top-left', -bw / 2, top), //  2  Stegflanke links
    flange('flange-top-left', 0, top), //  3  Knoten, linkes Element
    flange('flange-top-right', 0, top), //  4  Knoten, rechtes Element
    flange('flange-top-right', bw / 2, top), //  5  Stegflanke rechts
    flange('flange-top-right', bf / 2, top), //  6  Gurtspitze rechts
    web(0, flangeBottom), //  7  Stegoberkante — der Sprung von `tau`
    // Der Schwerpunkt der UMRISSFIGUR. Beim breiten Gurt kann er im Gurt
    // liegen (`bf=2000 / hf=200 / bw=250 / h=500` ergibt `zs = 139,5`); das
    // Wandmodell fuehrt dort trotzdem die Stegdicke, weil der Schubfluss um
    // diese Hoehe herum im Steg laeuft — im Gurt ist er längst zu den beiden
    // Spitzen hin abgeflossen.
    web(0, 0), //  8  Maximum von `Sy`
    web(-bw / 2, bottom), //  9  freies Stegende links
    web(bw / 2, bottom), // 10  freies Stegende rechts
  ];
}
