import type { mm } from '@baustatik/units';
import {
  AGAINST_Y,
  ALONG_Y,
  ALONG_Z,
  type StressPoint,
  stressPoint,
} from './types';

/**
 * Die Vorlage des GEWALZTEN I-Profils — 15 Punkte auf fuenf Elementen.
 *
 * Der gedruckte Ausdruck fuehrt "S-Punkt Nr. 1…13": 1–5 oberer Flansch von
 * links nach rechts, 6–10 unterer ebenso, 11/12 Steganfang oben/unten, 13
 * Schwerpunkt. Bis
 * [ADR 0059](../../../../docs/adr/0059-the-branch-node-carries-two-stress-points.md)
 * war diese Nummerierung ein VEROEFFENTLICHTER VERTRAG. Sie ist es nicht mehr:
 * jeder der beiden Verzweigungsknoten traegt jetzt zwei Punkte, einen je
 * Gurtelement. Die Zuordnung `gedruckte Nr -> unsere Nr` steht als Tabelle im
 * Test, und die dreizehn gedruckten Werte kommen dort Zeichen fuer Zeichen
 * heraus.
 *
 * Die Gurtunterseiten-Ecken fehlen weiter. Das ist eine BEGRUENDETE AUSNAHME
 * von der Regel "alle Ecken": bei homogenem Querschnitt koennen sie nie
 * massgebend werden (gleiches `y`, kleineres `|z|` als die Gurtspitze
 * darueber).
 *
 * VORZEICHEN: DAS KATALOGBLATT IST STIMMIG, es ist nur je ELEMENT geschrieben.
 * ADR 0058 hatte ihm noch vorgeworfen, `Sy` von der naechsten freien Spitze und
 * `Sz` durchgehend von links zu zaehlen, also zwei Richtungen an einer Stelle
 * zu fuehren. Das stimmt nicht. Orientiert man jede Wand in Richtung des
 * Schubflusses aus einem positiven `Vz` — Obergurt von den Spitzen zum Knoten,
 * Steg nach unten, Untergurt vom Knoten zu den Spitzen —, dann fallen alle 13
 * gedruckten Werte aus EINER Regel, Vorzeichen inklusive.
 *
 * Der Beleg stand schon im Repository: die alte Fassung lief global in `+y` und
 * wich an genau den Punkten 4, 7 und 8 ab. Das sind exakt die drei Stellen,
 * deren Element ANDERS orientiert ist als `+y`. Die Betraege stimmten immer.
 */

/**
 * Abmessungen in MILLIMETERN — genau so, wie `SteelProfileData` sie fuehrt und
 * wie die Norm sie druckt. Es gibt deshalb zwischen Tabelle und Vorlage keine
 * Umrechnung mehr.
 */
export type RolledIDimensions = {
  readonly h: mm;
  readonly b: mm;
  readonly tw: mm;
  readonly tf: mm;
  readonly r: mm;
};

/**
 * Flaeche und erstes Flaechenmoment EINER Ausrundung, bezogen auf die
 * Schwerpunktachsen des Profils.
 *
 * DIE FUMMELIGSTE RECHNUNG DIESES PACKAGES. Die Ausrundung ist das, was vom
 * Quadrat `r x r` in der Ecke zwischen Stegflanke und Gurtunterseite uebrig
 * bleibt, wenn man den Viertelkreis herausnimmt, der Steg und Gurt beruehrt.
 * Der Kreismittelpunkt liegt deshalb bei `(tw/2 + r, -(h/2 - tf) + r)` — also
 * in der VOM Steg und VOM Gurt ABGEWANDTEN Ecke des Quadrats. Wer ihn in die
 * andere Ecke legt, bekommt eine plausible Flaeche und ein falsches Moment.
 *
 * Der Beleg, dass es stimmt: `A = 2*b*tf + (h-2tf)*tw + (4-pi)*r^2` und `Iy`
 * treffen fuer jedes Profil die Tabelle, und `Sy` im Schwerpunkt trifft `SyMax`
 * — das wiederum die Haelfte des tabellierten `Wpl,y` ist.
 */
function fillet(d: RolledIDimensions) {
  const { h, tw, tf, r } = d;

  const squareArea = r * r;
  const quarterArea = (Math.PI * r * r) / 4;
  /** Schwerpunkt des Viertelkreises, vom Kreismittelpunkt aus gemessen. */
  const offset = (4 * r) / (3 * Math.PI);
  /** Eigentraegheit des Viertelkreises um SEINEN Schwerpunkt. */
  const quarterOwnI = (Math.PI * r ** 4) / 16 - quarterArea * offset * offset;

  /**
   * Erstes und zweites Flaechenmoment um EINE Achse. `edge` ist die Kante des
   * Quadrats, an der Gurt bzw. Steg anliegt.
   *
   * Beide Achsen rechnen identisch und unterscheiden sich nur in `edge` —
   * zweimal hingeschrieben waere zweimal Gelegenheit, ein Vorzeichen zu
   * verlieren.
   */
  const about = (edge: number) => {
    const squareCentre = edge + r / 2;
    const quarterCentre = edge + r - offset;
    return {
      moment: squareArea * squareCentre - quarterArea * quarterCentre,
      inertia:
        r ** 4 / 12 +
        squareArea * squareCentre * squareCentre -
        (quarterOwnI + quarterArea * quarterCentre * quarterCentre),
    };
  };

  return {
    area: squareArea - quarterArea,
    /** Um die y-Achse: Kante ist die Gurtunterseite (oben). */
    aboutY: about(-(h / 2 - tf)),
    /** Um die z-Achse: Kante ist die Stegflanke. */
    aboutZ: about(tw / 2),
  };
}

/**
 * `A`, `Iy` und `Iz` aus `h, b, tw, tf, r` — die Umrissfigur MIT Ausrundung.
 *
 * NICHT die Quelle der Querschnittswerte: die kommen aus der Tabelle
 * („tabelliert, nicht nachgerechnet"). Diese Integration ist der BELEG, dass
 * die Ausrundung richtig sitzt — sie muss die Tabelle auf 0,2 % treffen, und
 * nur deshalb darf man den Spannungspunkten glauben, die aus derselben
 * Integration fallen.
 */
export function rolledIGeometry(d: RolledIDimensions) {
  const { h, b, tw, tf } = d;
  const hw = h - 2 * tf;
  const f = fillet(d);

  // Das offene I plus VIER Ausrundungen. Deren Eigentraegheit ist gegen ihren
  // Steiner-Anteil klein, aber nicht vernachlaessigt — sie faellt aus derselben
  // Zerlegung Quadrat minus Viertelkreis wie das erste Flaechenmoment.
  return {
    A: 2 * b * tf + hw * tw + 4 * f.area,
    Iy: (b * h ** 3 - (b - tw) * hw ** 3) / 12 + 4 * f.aboutY.inertia,
    Iz: (2 * tf * b ** 3 + hw * tw ** 3) / 12 + 4 * f.aboutZ.inertia,
  };
}

export function rolledIStressPoints(d: RolledIDimensions): StressPoint[] {
  const { h, b, tw, tf, r } = d;
  const hh = h / 2;
  const bb = b / 2;
  /** Gurtmittellinie — der Hebelarm des Gurts. */
  const zf = (h - tf) / 2;
  /** Wo der GERADE Stegteil beginnt: Punkt 13/14. */
  const zWeb = hh - tf - r;
  /** Wo die Ausrundung an den Gurt stoesst: Punkt 2/5/8/11. */
  const yFillet = tw / 2 + r;

  const f = fillet(d);

  /** Erstes Flaechenmoment des GESAMTEN oberen Gurts (negativ). */
  const flangeMoment = -b * tf * zf;
  /** Beide oberen Ausrundungen. */
  const filletMoment = 2 * f.aboutY.moment;

  /** Der Gurtueberstand von der Spitze bis zur Ausrundung. */
  const outstand = bb - yFillet;
  const outstandMoment = -outstand * tf * zf;
  const outstandMomentZ = -outstand * tf * ((bb + yFillet) / 2);

  /** Halber Gurt, von der Spitze bis zur Stegachse. */
  const halfFlangeMoment = -bb * tf * zf;
  const halfFlangeMomentZ = -bb * tf * (bb / 2);

  /** Alles oberhalb des Steganfangs: Gurt + zwei Ausrundungen + Stegstueck. */
  const aboveWebStart = flangeMoment + filletMoment - tw * r * (zWeb + r / 2);
  /** Alles oberhalb des Schwerpunkts. */
  const aboveCentroid = flangeMoment + filletMoment - (tw * (hh - tf) ** 2) / 2;

  /**
   * Eine Gurtstelle auf dem Element `wall`. Die Tangente faellt aus der Wand,
   * genau wie in `open-stations.ts`: die beiden oberen Elemente laufen auf den
   * Knoten zu, die beiden unteren von ihm weg.
   */
  const flange = (
    nr: number,
    wall: string,
    y: mm,
    z: mm,
    Sy: number,
    Sz: number,
  ): StressPoint =>
    stressPoint(
      nr,
      wall,
      y,
      z,
      tf,
      Sy,
      Sz,
      wall === 'flange-top-left' || wall === 'flange-bottom-right'
        ? ALONG_Y
        : AGAINST_Y,
    );

  // Ausgeschrieben statt ueber eine Symmetrieregel gebaut: beim Lesen soll
  // neben jeder Nummer stehen, was dort steht.
  //
  // `Sy` IST AN ALLEN ZWOELF GURTSTELLEN NEGATIV, und das ist kein pauschales
  // Minus, sondern gerechnet. Am OBERGURT ist durchlaufen der nahe Ueberstand,
  // und der liegt bei `-zf`. Am UNTERGURT laeuft das Element vom Knoten weg,
  // durchlaufen ist also alles ANDERE — und das erste Flaechenmoment eines
  // Komplements ist das Negative des Teils, hier also wieder `-zf`.
  //
  // `Sz` KIPPT MIT DER ELEMENTTANGENTE. Am Knoten stehen deshalb zwei Punkte
  // mit gleichem `Sy` und entgegengesetztem `Sz`; genau dorthin ist die
  // Zweiwertigkeit gewandert, die bis ADR 0059 an `Sy` hing (ADR 0059).
  return [
    flange(1, 'flange-top-left', -bb, -hh, 0, 0),
    flange(
      2,
      'flange-top-left',
      -yFillet,
      -hh,
      outstandMoment,
      outstandMomentZ,
    ),
    flange(3, 'flange-top-left', 0, -hh, halfFlangeMoment, halfFlangeMomentZ),
    flange(4, 'flange-top-right', 0, -hh, halfFlangeMoment, -halfFlangeMomentZ),
    flange(
      5,
      'flange-top-right',
      yFillet,
      -hh,
      outstandMoment,
      -outstandMomentZ,
    ),
    flange(6, 'flange-top-right', bb, -hh, 0, 0),
    flange(7, 'flange-bottom-left', -bb, hh, 0, 0),
    flange(
      8,
      'flange-bottom-left',
      -yFillet,
      hh,
      outstandMoment,
      -outstandMomentZ,
    ),
    flange(
      9,
      'flange-bottom-left',
      0,
      hh,
      halfFlangeMoment,
      -halfFlangeMomentZ,
    ),
    flange(
      10,
      'flange-bottom-right',
      0,
      hh,
      halfFlangeMoment,
      halfFlangeMomentZ,
    ),
    flange(
      11,
      'flange-bottom-right',
      yFillet,
      hh,
      outstandMoment,
      outstandMomentZ,
    ),
    flange(12, 'flange-bottom-right', bb, hh, 0, 0),
    stressPoint(13, 'web', 0, -zWeb, tw, aboveWebStart, 0, ALONG_Z),
    stressPoint(14, 'web', 0, zWeb, tw, aboveWebStart, 0, ALONG_Z),
    stressPoint(15, 'web', 0, 0, tw, aboveCentroid, 0, ALONG_Z),
  ];
}
