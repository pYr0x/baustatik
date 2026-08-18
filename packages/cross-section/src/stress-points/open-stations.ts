import type { mm } from '@baustatik/units';

/**
 * WO DIE PUNKTE DER OFFENEN PROFILE LIEGEN — einmal, fuer beide
 * Idealisierungen.
 *
 * Das Gegenstueck fuer den geschlossenen Kasten steht in `hollow-stations.ts`.
 * Getrennt, weil der Kasten keinen freien Rand hat und seine Stellen aus der
 * Symmetrie kommen statt aus den Wandenden.
 *
 * DIE REGEL, nach der diese Listen entstehen — sie hat die aeltere Fassung
 * „alle Ecken der Umrissfigur plus Schwerpunkt" abgeloest, weil die Ecken die
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
 * schon in `compact.ts` als Begruendung dafuer, warum das GEWALZTE Profil sie
 * nicht druckt; angewandt wurde es nur dort.
 *
 * DER STEGPUNKT AN DER GURTUNTERKANTE ist der zweite Teil. Dort springt `tau`
 * um `tf/tw`, weil derselbe Schubfluss ploetzlich durch die Stegdicke muss,
 * und `|sigma|` ist noch fast so gross wie am Rand. Ein Punkt genuegt: ueber
 * die Stegdicke ist `tau` konstant, und `sigma` variiert quer nur um die
 * halbe Stegbreite.
 *
 * ALLE ABMESSUNGEN IN MILLIMETERN.
 */
export type OpenStation = {
  readonly y: mm;
  readonly z: mm;
  /**
   * Welche Wand hier geschnitten wird — nur das WANDMODELL liest das Feld.
   * Das Umrissmodell schneidet waagerecht durch die volle Figur und liest
   * `t` und `S` allein aus der Koordinate.
   *
   * `junction` ist der Schnitt UNMITTELBAR unter dem Gurt: abgetrennt ist
   * genau der Gurt, gefuehrt wird aber schon die Stegdicke. Er ist nicht
   * dasselbe wie `web` — ein Stegpunkt laeuft im Wandmodell von der
   * GURTMITTELLINIE los und wuerde das Stueck zwischen Mittellinie und
   * Gurtunterkante ein zweites Mal zaehlen.
   */
  readonly wall: 'flange' | 'junction' | 'web';
};

const flange = (y: mm, z: mm): OpenStation => ({ y, z, wall: 'flange' });
const junction = (y: mm, z: mm): OpenStation => ({ y, z, wall: 'junction' });
const web = (y: mm, z: mm): OpenStation => ({ y, z, wall: 'web' });

/**
 * Geschweisstes doppeltsymmetrisches I — 13 Stellen.
 *
 * NUMMERIERUNG WIE BEIM GEWALZTEN PROFIL (`rolled-i.ts`), Stelle fuer Stelle.
 * Das ist kein Zufall und keine Kosmetik: die gewalzte Vorlage ist gegen die
 * Referenzpunkte des Profilkatalogs geprueft, und dieselbe Form zweimal verschieden zu numerieren,
 * je nachdem ob sie aus dem Katalog oder aus vier Massen kommt, waere ein
 * Fehler mit Ansage. Bei `r = 0` treffen sich die beiden Vorlagen an den
 * Punkten 1 bis 12 auf das letzte Bit; nur Punkt 13 trennt sie, und zwar
 * gewollt (ADR 0029: der Schwerpunktwert kommt aus dem Wandmodell).
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
    flange(-b / 2, -zo), //  1  Obergurt, Spitze links
    flange(-tw / 2, -zo), //  2  Obergurt, Stegflanke links
    flange(0, -zo), //  3  Obergurt, Stegachse — Maximum von `Sz`
    flange(tw / 2, -zo), //  4  Obergurt, Stegflanke rechts
    flange(b / 2, -zo), //  5  Obergurt, Spitze rechts
    flange(-b / 2, zo), //  6  Untergurt, Spitze links
    flange(-tw / 2, zo), //  7
    flange(0, zo), //  8
    flange(tw / 2, zo), //  9
    flange(b / 2, zo), // 10
    junction(0, -zi), // 11  Steg oben — hier springt `tau` um `tf/tw`
    junction(0, zi), // 12  Steg unten
    web(0, 0), // 13  Schwerpunkt — Maximum von `Sy`
  ];
}

/**
 * Geschweisstes T — 9 Stellen, von oben nach unten.
 *
 * `zs` ist der Abstand des Schwerpunkts der UMRISSFIGUR von der
 * Gurtoberkante; alle Koordinaten liegen schwerpunktsbezogen.
 *
 * Das freie Stegende traegt ZWEI Punkte, obwohl der Steg dort nur eine Stelle
 * hat: es ist die Stelle mit dem groessten `|z|`, also die massgebende fuer
 * `sigma`, und dort tut der Beitrag aus `Mz` etwas — er ist an `y = ±bw/2`
 * am groessten und an `y = 0` genau null. Am Gurt uebernimmt das die
 * Gurtspitze, hier gibt es keine.
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
    flange(-bf / 2, top), // 1  Gurtspitze links
    flange(-bw / 2, top), // 2  Stegflanke links
    flange(0, top), // 3  Stegachse — Maximum von `Sz`
    flange(bw / 2, top), // 4  Stegflanke rechts
    flange(bf / 2, top), // 5  Gurtspitze rechts
    junction(0, flangeBottom), // 6  Steg oben — der Sprung von `tau`
    // Der Schwerpunkt der UMRISSFIGUR. Beim breiten Gurt kann er im Gurt
    // liegen (`bf=2000 / hf=200 / bw=250 / h=500` ergibt `zs = 139,5`); das
    // Wandmodell fuehrt dort trotzdem die Stegdicke, weil der Schubfluss um
    // diese Hoehe herum im Steg laeuft. Das Umrissmodell liefert an derselben
    // Stelle `t = bf` — zwei Modelle, zwei Antworten, beide richtig.
    web(0, 0), // 7  Maximum von `Sy`
    web(-bw / 2, bottom), // 8  freies Stegende links
    web(bw / 2, bottom), // 9  freies Stegende rechts
  ];
}
