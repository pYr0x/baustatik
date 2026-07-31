import type { StressPoint } from './types';

/**
 * Die Vorlage des GEWALZTEN I-Profils — 13 Punkte, und die Nummerierung ist ein
 * VEROEFFENTLICHTER VERTRAG.
 *
 * RSTAB druckt „S-Punkt Nr. 1…13": 1–5 oberer Flansch von links nach rechts,
 * 6–10 unterer ebenso, 11/12 Steganfang oben/unten, 13 Schwerpunkt. Wir
 * uebernehmen sie unveraendert; ein Test haelt sie fest, bevor der erste Bericht
 * sie druckt.
 *
 * Die Gurtunterseiten-Ecken fehlen — anders als beim geschweissten I mit seinen
 * 15 Punkten. Das ist eine BEGRUENDETE AUSNAHME von der Regel „alle Ecken":
 * bei homogenem Querschnitt koennen sie nie massgebend werden (gleiches `y`,
 * kleineres `|z|` als die Gurtspitze darueber), und die Nummerierung ist
 * gedruckt.
 *
 * VORZEICHEN: `Sy` ist durchweg negativ, `Sz` spiegelt zwischen oberem und
 * unterem Gurt. Das ist keine Willkuer, sondern RSTABs Buchfuehrung ueber die
 * UMLAUFRICHTUNG des Schubflusses: am Gurt zaehlt der Teil bis zur NAECHSTEN
 * freien Spitze, und der untere Gurt wird gegenlaeufig durchlaufen. Fuer den
 * Betrag — und nur der geht in `|tau|` ein — ist die Richtung gleichgueltig;
 * uebernommen wird sie, weil die Zahlen so gedruckt sind.
 */

/** Abmessungen in METERN. */
export type RolledIDimensions = {
  readonly h: number;
  readonly b: number;
  readonly tw: number;
  readonly tf: number;
  readonly r: number;
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
  const y0 = tw / 2;
  const z0 = -(h / 2 - tf); // Gurtunterseite, oben

  const squareArea = r * r;
  const quarterArea = (Math.PI * r * r) / 4;
  // Schwerpunkt des Viertelkreises, vom Mittelpunkt aus gemessen.
  const offset = (4 * r) / (3 * Math.PI);

  const area = squareArea - quarterArea;
  const momentZ =
    squareArea * (z0 + r / 2) - quarterArea * (z0 + r - offset);
  const momentY =
    squareArea * (y0 + r / 2) - quarterArea * (y0 + r - offset);

  return { area, momentZ, momentY };
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
  const { h, b, tw, tf, r } = d;
  const hw = h - 2 * tf;
  const f = fillet(d);

  const A = 2 * b * tf + hw * tw + 4 * f.area;

  // Iy: I des offenen I plus der Steiner-Anteil der vier Ausrundungen um ihren
  // eigenen Schwerpunkt herum waere die exakte Rechnung. Der Eigenanteil der
  // Ausrundung ist gegen ihren Steiner-Anteil klein, aber nicht vernachlaessigt:
  // er faellt aus derselben Zerlegung Quadrat minus Viertelkreis.
  const zf = -(h / 2 - tf) + r; // Kreismittelpunkt in z (oben)
  const zSquare = -(h / 2 - tf) + r / 2;
  const squareArea = r * r;
  const quarterArea = (Math.PI * r * r) / 4;
  const offset = (4 * r) / (3 * Math.PI);
  const zQuarter = zf - offset;

  // Eigenträgheit + Steiner, Quadrat minus Viertelkreis, um die y-Achse.
  const IySquare = (r * r * r * r) / 12 + squareArea * zSquare * zSquare;
  // Viertelkreis um seinen Mittelpunkt: pi r^4/16; um seinen Schwerpunkt:
  // pi r^4/16 - quarterArea * offset^2.
  const IyQuarterOwn = (Math.PI * r ** 4) / 16 - quarterArea * offset * offset;
  const IyQuarter = IyQuarterOwn + quarterArea * zQuarter * zQuarter;
  const IyFillet = IySquare - IyQuarter;

  const Iy = (b * h ** 3 - (b - tw) * hw ** 3) / 12 + 4 * IyFillet;

  const yf = tw / 2 + r;
  const ySquare = tw / 2 + r / 2;
  const yQuarter = yf - offset;
  const IzSquare = (r * r * r * r) / 12 + squareArea * ySquare * ySquare;
  const IzQuarter =
    (Math.PI * r ** 4) / 16 -
    quarterArea * offset * offset +
    quarterArea * yQuarter * yQuarter;
  const IzFillet = IzSquare - IzQuarter;

  const Iz = (2 * tf * b ** 3 + hw * tw ** 3) / 12 + 4 * IzFillet;

  return { A, Iy, Iz };
}

export function rolledIStressPoints(d: RolledIDimensions): StressPoint[] {
  const { h, b, tw, tf, r } = d;
  const hh = h / 2;
  const bb = b / 2;
  /** Gurtmittellinie — der Hebelarm des Gurts. */
  const zf = (h - tf) / 2;
  /** Wo der GERADE Stegteil beginnt: Punkt 11/12. */
  const zWeb = hh - tf - r;
  /** Wo die Ausrundung an den Gurt stoesst: Punkt 2/4/7/9. */
  const yFillet = tw / 2 + r;

  const f = fillet(d);

  /** Erstes Flaechenmoment des GESAMTEN oberen Gurts (negativ). */
  const flangeMoment = -b * tf * zf;
  /** Beide oberen Ausrundungen. */
  const filletMoment = 2 * f.momentZ;

  /** Der Gurtueberstand von der Spitze bis zur Ausrundung. */
  const outstand = bb - yFillet;
  const outstandMoment = -outstand * tf * zf;
  const outstandMomentZ = -outstand * tf * ((bb + yFillet) / 2);

  /** Halber Gurt, von der Spitze bis zur Stegachse. */
  const halfFlangeMoment = -bb * tf * zf;
  const halfFlangeMomentZ = -bb * tf * (bb / 2);

  /** Alles oberhalb des Steganfangs: Gurt + zwei Ausrundungen + Stegstueck. */
  const aboveWebStart =
    flangeMoment + filletMoment - tw * r * (zWeb + r / 2);
  /** Alles oberhalb des Schwerpunkts. */
  const aboveCentroid =
    flangeMoment + filletMoment - (tw * (hh - tf) ** 2) / 2;

  const flange = (
    nr: number,
    y: number,
    z: number,
    Sy: number,
    Sz: number,
  ): StressPoint => ({ nr, y, z, t: tf, Sy, Sz });

  // Ausgeschrieben statt ueber eine Symmetrieregel gebaut: die 13 Zeilen SIND
  // der Vertrag, und beim Lesen soll neben jeder Nummer stehen, was dort steht.
  // `Sy` ist an allen vier gleichwertigen Gurtstellen dasselbe, `Sz` spiegelt
  // — links/rechts am oberen Gurt, und am unteren noch einmal.
  return [
    flange(1, -bb, -hh, 0, 0),
    flange(2, -yFillet, -hh, outstandMoment, outstandMomentZ),
    flange(3, 0, -hh, halfFlangeMoment, halfFlangeMomentZ),
    flange(4, yFillet, -hh, outstandMoment, -outstandMomentZ),
    flange(5, bb, -hh, 0, 0),
    flange(6, -bb, hh, 0, 0),
    flange(7, -yFillet, hh, outstandMoment, -outstandMomentZ),
    flange(8, 0, hh, halfFlangeMoment, -halfFlangeMomentZ),
    flange(9, yFillet, hh, outstandMoment, outstandMomentZ),
    flange(10, bb, hh, 0, 0),
    { nr: 11, y: 0, z: -zWeb, t: tw, Sy: aboveWebStart, Sz: 0 },
    { nr: 12, y: 0, z: zWeb, t: tw, Sy: aboveWebStart, Sz: 0 },
    { nr: 13, y: 0, z: 0, t: tw, Sy: aboveCentroid, Sz: 0 },
  ];
}
