import type { mm } from '@baustatik/units';

/**
 * DER UMLAUF DES GESCHLOSSENEN KASTENS — die 16 Stellen, an denen beide
 * Vorlagen ihre Werte bilden.
 *
 * Warum die Liste EINMAL steht und nicht wie beim I und beim T in jeder der
 * beiden Vorlagen: dort sind es neun bzw. fuenfzehn Koordinatenpaare, hier
 * sechzehn — und sie liegen nicht auf Ecken, sondern auf einem UMLAUF, dessen
 * Reihenfolge selbst die Aussage ist. Zwei Abschriften desselben Umlaufs waeren
 * zwei Gelegenheiten, ihn verschieden zu drehen; die Nummerierung ist aber ein
 * veroeffentlichter Vertrag.
 *
 * DIE REGEL DES PACKAGES („alle Ecken der Umrissfigur und der Schwerpunkt")
 * trifft der Kasten mit einer Abwandlung, die seine Form erzwingt: sein
 * Schwerpunkt liegt IM LOCH, dort gibt es kein Material und damit keine
 * Spannung. An seine Stelle treten die vier WANDMITTEN — genau die Stellen, an
 * denen `S` sein Maximum hat, aus demselben Grund, aus dem es beim Vollrechteck
 * auf halber Hoehe sitzt.
 *
 * Von den acht Ecken der Umrissfigur stehen die vier AUSSEREN als Punkt
 * (`2`, `6`, `10`, `14`). Die vier inneren stehen nicht selbst, sondern als
 * ihre beiden Projektionen auf die Aussenflaechen (`1`/`3` an der oberen
 * rechten Ecke). Das ist keine Auslassung: die innere Ecke traegt in beiden
 * Modellen keinen eigenen Wert. Im Umrissmodell liest sie `Sy` aus ihrer Hoehe
 * und `Sz` aus ihrer Breite — beide stehen an den Projektionen schon. Im
 * Wandmodell liegt sie ueberhaupt nicht auf einer Wandflaeche.
 *
 * Die Reihenfolge laeuft im Uhrzeigersinn ab der oberen rechten Ecke, in
 * der Ansicht mit `z` nach unten (Beleg TO 300/200/10 bzw. TO 400/200/10).
 */
export type HollowStation = {
  readonly y: mm;
  readonly z: mm;
  /**
   * WELCHER SCHNITT an dieser Stelle durch das Material geht. Nur das
   * Wandmodell liest das Feld; das Umrissmodell braucht nur `y` und `z`.
   *
   * `flange` — senkrechter Schnitt durch den Gurt, `web` — waagerechter durch
   * den Steg. Beide sind `t` lang und eindeutig.
   *
   * `corner` ist die AUSSENECKE, und sie ist keins von beidem: dort stossen
   * zwei freie Flaechen zusammen, ein Schnitt „quer zur Wand" ist nicht
   * definiert. Der kuerzeste Weg durchs Material geht von dort zur INNENECKE,
   * also diagonal — die Gehrung. Sie ist `t·√2` lang, und der abgeschnittene
   * Teil ist von beiden Waenden aus derselbe.
   */
  readonly wall: 'flange' | 'web' | 'corner';
};

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

  const flange = (y: mm, z: mm): HollowStation => ({ y, z, wall: 'flange' });
  const web = (y: mm, z: mm): HollowStation => ({ y, z, wall: 'web' });
  const corner = (y: mm, z: mm): HollowStation => ({ y, z, wall: 'corner' });

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
