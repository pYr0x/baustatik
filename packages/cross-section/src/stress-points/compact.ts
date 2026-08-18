import type { mm } from '@baustatik/units';
import { hollowStations } from './hollow-stations';
import { iSymmetricStations, tSectionStations } from './open-stations';
import { momentBefore, type OutlinePart, widthAt } from './outline';
import { type StressPoint, stressPoint } from './types';

/**
 * WO DIE PUNKTE LIEGEN, entscheidet diese Vorlage nicht mehr selbst: die
 * Stellen der offenen Profile stehen in `open-stations.ts`, die des Kastens in
 * `hollow-stations.ts`, und beide Idealisierungen lesen dieselbe Liste. Dort
 * steht auch die Regel, nach der sie entsteht.
 *
 * FUER DIESES MODELL ist an der Liste nur wichtig, dass jede z-STELLE und jede
 * y-STELLE vorkommt: hier haengen `Sy` und `t` allein an `z`, `Sz` allein an
 * `y`. Welche der beiden Fasern eines Schnitts benannt wird, ist dem
 * Umrissmodell gleichgueltig — das entscheidet sigma, nicht tau.
 *
 * Was die Liste erledigt, sieht man am T-Querschnitt mit breitem Gurt: die
 * Nulllinie kann IM GURT liegen (`bf=2000 / hf=200 / bw=250 / h=500` ergibt
 * `zs = 139,5 mm` bei `hf = 200`). Der Schwerpunktpunkt trifft das ohne
 * Sonderfall und liefert dort `t = bf`; „Mitte Steg" haette ihn an die falsche
 * Stelle gesetzt. Und beim Rechteck haben die vier Ecken allein ueberall
 * `S = 0` — das Maximum `b*h^2/8` sitzt auf halber Hoehe, also am Schwerpunkt.
 *
 * ALLE ABMESSUNGEN IN MILLIMETERN, wie sie aus `ShapeSpec` hereinkommen. `S`
 * faellt damit in mm³ an; `stressPoint` macht cm³ daraus.
 *
 * `Sy` und `Sz` sind das erste Flaechenmoment des Teils OBERHALB bzw. LINKS vom
 * Punkt, beide also <= 0. Das ist eine andere Vorzeichenkonvention als beim
 * gewalzten Profil, wo wir die veroeffentlichte Zaehlweise uebernehmen — dort
 * kodiert das Vorzeichen die Umlaufrichtung des Schubflusses. Hier gibt es
 * keinen Umlauf, also auch keine Richtung, die ein Vorzeichen tragen muesste.
 */
export function compactStressPoints(
  positions: readonly { y: mm; z: mm }[],
  zParts: readonly OutlinePart[],
  yParts: readonly OutlinePart[],
): StressPoint[] {
  return positions.map((position, index) =>
    stressPoint(
      index + 1,
      position.y,
      position.z,
      // Der Nenner in tau gehoert zur WAAGERECHTEN Schnittflaeche: die Breite in
      // dieser Hoehe. Beim breiten Gurt ist das `bf`, und genau das ist der
      // Grund, warum die Regel den Schwerpunkt und nicht die Stegmitte nennt.
      widthAt(zParts, position.z),
      momentBefore(zParts, position.z),
      momentBefore(yParts, position.y),
    ),
  );
}

/** Vollrechteck: 4 Ecken + Schwerpunkt. Abmessungen in mm. */
export function rectanglePoints(b: mm, h: mm): StressPoint[] {
  const zParts: OutlinePart[] = [{ from: -h / 2, to: h / 2, width: b }];
  const yParts: OutlinePart[] = [{ from: -b / 2, to: b / 2, width: h }];
  return compactStressPoints(
    [
      { y: -b / 2, z: -h / 2 },
      { y: b / 2, z: -h / 2 },
      { y: -b / 2, z: h / 2 },
      { y: b / 2, z: h / 2 },
      { y: 0, z: 0 },
    ],
    zParts,
    yParts,
  );
}

/**
 * T-Querschnitt — 9 Punkte, Stellen und Nummern aus `tSectionStations`.
 *
 * `zs` ist der Abstand des Schwerpunkts von der GURTOBERKANTE; die Punkte
 * liegen wie ueberall SCHWERPUNKTSBEZOGEN. Alles in mm.
 *
 * Die z-Stellen sind Gurtoberkante (`S = 0`), Gurtunterkante (voller Gurt,
 * und `widthAt` liefert dort `bw` — der Sprung von tau), Schwerpunkt
 * (Maximum) und freies Stegende (`S = 0`); die y-Stellen `±bf/2` (`Sz = 0`),
 * `±bw/2` und `0` (Maximum). Alle vier und alle drei kommen in den neun
 * Punkten vor — mehr braucht dieses Modell nicht, denn `Sy` haengt nur an
 * `z` und `Sz` nur an `y`.
 */
export function tSectionPoints(
  bf: mm,
  hf: mm,
  bw: mm,
  h: mm,
  zs: mm,
): StressPoint[] {
  const top = -zs;
  const flangeBottom = -zs + hf;
  const bottom = h - zs;

  const zParts: OutlinePart[] = [
    { from: top, to: flangeBottom, width: bf },
    { from: flangeBottom, to: bottom, width: bw },
  ];
  const yParts: OutlinePart[] = [
    { from: -bf / 2, to: -bw / 2, width: hf },
    { from: -bw / 2, to: bw / 2, width: h },
    { from: bw / 2, to: bf / 2, width: hf },
  ];

  return compactStressPoints(
    tSectionStations(bf, hf, bw, h, zs),
    zParts,
    yParts,
  );
}

/**
 * Geschweisstes doppeltsymmetrisches I — 13 Punkte, Stellen und Nummern aus
 * `iSymmetricStations` und damit dieselben wie beim GEWALZTEN Profil.
 *
 * Frueher waren es 15: die vier Ecken an der Gurtunterseite waren mit dabei.
 * Das Argument gegen sie stand schon hier — gleiches `y`, kleineres `|z|` als
 * die Gurtspitze darueber, also bei homogenem Querschnitt nie massgebend —,
 * angewandt wurde es aber nur auf das gewalzte Profil. Ihre z-Stelle traegt
 * jetzt der Stegpunkt `(0, ±(h/2 - tf))`, ihre y-Stelle die Gurtspitze
 * darueber; verloren geht in diesem Modell also nichts.
 */
export function iSymmetricPoints(h: mm, b: mm, tw: mm, tf: mm): StressPoint[] {
  const top = -h / 2;
  const topInner = -h / 2 + tf;
  const bottomInner = h / 2 - tf;
  const bottom = h / 2;

  const zParts: OutlinePart[] = [
    { from: top, to: topInner, width: b },
    { from: topInner, to: bottomInner, width: tw },
    { from: bottomInner, to: bottom, width: b },
  ];
  // `2*tf` ist eine SUMME ueber zwei getrennte Flaechen: der senkrechte Schnitt
  // ausserhalb des Stegs trifft Ober- UND Untergurt. Warum das fuer `S` und
  // fuer den Nenner von Grashof richtig ist, steht bei `OutlinePart`.
  const yParts: OutlinePart[] = [
    { from: -b / 2, to: -tw / 2, width: 2 * tf },
    { from: -tw / 2, to: tw / 2, width: h },
    { from: tw / 2, to: b / 2, width: 2 * tf },
  ];

  return compactStressPoints(iSymmetricStations(h, b, tw, tf), zParts, yParts);
}

/**
 * Geschlossener Kasten, kompakt — 16 Punkte, dieselben Stellen und Nummern wie
 * die duennwandige Vorlage.
 *
 * ZWEI WAENDE IM SCHNITT, und das ist der ganze Unterschied zu den offenen
 * Formen: zwischen den Gurten trifft der waagerechte Schnitt BEIDE Stege, also
 * `2t`, und der senkrechte zwischen den Stegen beide Gurte. Es sind dieselben
 * `OutlinePart`s, aus denen `hollowRectangle` in
 * `calculation/shapes/hollow-rectangle.ts` seinen `solid`-Schubweg baut — die
 * Idealisierung soll fuer kappa und fuer die Spannungspunkte dieselbe Figur
 * schneiden ([ADR 0029](../../../../docs/adr/0029-stress-points-follow-the-idealisation.md)).
 *
 * DASS DIE STELLEN DIESELBEN SIND, HEISST NICHT, DASS DIE WERTE ES SIND. Das
 * Umrissmodell liest `Sy` allein aus der HOEHE: die fuenf Punkte der
 * Gurtaussenseite (`2` bis `6`) liegen am oberen Rand und haben damit alle
 * `Sy = 0`, waehrend das Wandmodell dort laengs des Gurts von 0 auf `zm·t·ym`
 * anwaechst. In STEGMITTE fallen die beiden dagegen zusammen, wo es darauf
 * ankommt: das Umrissmodell schneidet beide Stege (`S` doppelt, `t = 2t`), das
 * Wandmodell einen (`S` einfach, `t`) — `S/t` und damit `tau` ist dieselbe Zahl.
 */
export function hollowRectanglePoints(b: mm, h: mm, t: mm): StressPoint[] {
  const zParts: OutlinePart[] = [
    { from: -h / 2, to: -h / 2 + t, width: b },
    { from: -h / 2 + t, to: h / 2 - t, width: 2 * t },
    { from: h / 2 - t, to: h / 2, width: b },
  ];
  const yParts: OutlinePart[] = [
    { from: -b / 2, to: -b / 2 + t, width: h },
    { from: -b / 2 + t, to: b / 2 - t, width: 2 * t },
    { from: b / 2 - t, to: b / 2, width: h },
  ];

  return compactStressPoints(hollowStations(b, h, t), zParts, yParts);
}
