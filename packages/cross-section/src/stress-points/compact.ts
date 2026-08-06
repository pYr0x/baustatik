import type { mm } from '@baustatik/units';
import { momentBefore, type OutlinePart, widthAt } from './outline';
import { type StressPoint, stressPoint } from './types';

/**
 * DIE REGEL, aus der jede Vorlage einer parametrischen Form faellt:
 *
 * > Jede Vorlage enthaelt mindestens ALLE ECKEN der Umrissfigur und den
 * > SCHWERPUNKT.
 *
 * Was die Regel erledigt, sieht man am T-Querschnitt mit breitem Gurt: die
 * Nulllinie kann IM GURT liegen (`bf=2000 / hf=200 / bw=250 / h=500` ergibt
 * `zs = 139,5 mm` bei `hf = 200`). „Schwerpunkt" trifft das ohne Sonderfall und
 * liefert dort `t = bf`; „Mitte Steg" haette den Punkt an die falsche Stelle
 * gesetzt. Und beim Rechteck haben die vier Ecken allein ueberall `S = 0` — das
 * Maximum `b*h^2/8` sitzt auf halber Hoehe.
 *
 * ALLE ABMESSUNGEN IN MILLIMETERN, wie sie aus `ShapeSpec` hereinkommen. `S`
 * faellt damit in mm³ an; `stressPoint` macht cm³ daraus.
 *
 * `Sy` und `Sz` sind das erste Flaechenmoment des Teils OBERHALB bzw. LINKS vom
 * Punkt, beide also <= 0. Das ist eine andere Vorzeichenkonvention als beim
 * gewalzten Profil, wo wir RSTABs veroeffentlichte Zaehlweise uebernehmen — dort
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
 * T-Querschnitt: 8 Ecken + Schwerpunkt.
 *
 * `zs` ist der Abstand des Schwerpunkts von der GURTOBERKANTE; die Punkte
 * liegen wie ueberall SCHWERPUNKTSBEZOGEN. Alles in mm.
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
    [
      { y: -bf / 2, z: top },
      { y: bf / 2, z: top },
      { y: -bf / 2, z: flangeBottom },
      { y: -bw / 2, z: flangeBottom },
      { y: bw / 2, z: flangeBottom },
      { y: bf / 2, z: flangeBottom },
      { y: -bw / 2, z: bottom },
      { y: bw / 2, z: bottom },
      { y: 0, z: 0 },
    ],
    zParts,
    yParts,
  );
}

/**
 * Geschweisstes doppeltsymmetrisches I: 12 Ecken + Schwerpunkt + 2 Punkte auf
 * der Stegachse `(0, ±h/2)`.
 *
 * Die beiden Zusatzpunkte sind der Unterschied zu RSTABs 13 Punkten fuer das
 * GEWALZTE Profil. Dort faellt die Gurtunterseite weg, weil sie bei homogenem
 * Querschnitt nie massgebend werden kann (gleiches `y`, kleineres `|z|` als die
 * Gurtspitze darueber) und die Nummerierung gedruckt ist. Geschweisstes I (15)
 * und gewalztes IPE (13) lesen sich damit bewusst verschieden — es sind zwei
 * Formen.
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

  return compactStressPoints(
    [
      { y: -b / 2, z: top },
      { y: 0, z: top },
      { y: b / 2, z: top },
      { y: -b / 2, z: topInner },
      { y: -tw / 2, z: topInner },
      { y: tw / 2, z: topInner },
      { y: b / 2, z: topInner },
      { y: -b / 2, z: bottomInner },
      { y: -tw / 2, z: bottomInner },
      { y: tw / 2, z: bottomInner },
      { y: b / 2, z: bottomInner },
      { y: -b / 2, z: bottom },
      { y: 0, z: bottom },
      { y: b / 2, z: bottom },
      { y: 0, z: 0 },
    ],
    zParts,
    yParts,
  );
}
