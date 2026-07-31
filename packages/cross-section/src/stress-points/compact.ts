import type { StressPoint } from './types';
import { momentBefore, type OutlineBand, widthAt } from './outline';

/**
 * DIE REGEL, aus der jede Vorlage einer parametrischen Form faellt:
 *
 * > Jede Vorlage enthaelt mindestens ALLE ECKEN der Umrissfigur und den
 * > SCHWERPUNKT.
 *
 * Was die Regel erledigt, sieht man am Plattenbalken mit breitem Gurt: die
 * Nulllinie kann IM GURT liegen (`bf=2,0 / hf=0,2 / bw=0,25 / h=0,5` ergibt
 * `zs = 0,1395 m` bei `hf = 0,2`). „Schwerpunkt" trifft das ohne Sonderfall und
 * liefert dort `t = bf`; „Mitte Steg" haette den Punkt an die falsche Stelle
 * gesetzt. Und beim Rechteck haben die vier Ecken allein ueberall `S = 0` — das
 * Maximum `b*h^2/8` sitzt auf halber Hoehe.
 *
 * `Sy` und `Sz` sind das erste Flaechenmoment des Teils OBERHALB bzw. LINKS vom
 * Punkt, beide also <= 0. Das ist eine andere Vorzeichenkonvention als beim
 * gewalzten Profil, wo wir RSTABs veroeffentlichte Zaehlweise uebernehmen — dort
 * kodiert das Vorzeichen die Umlaufrichtung des Schubflusses. Hier gibt es
 * keinen Umlauf, also auch keine Richtung, die ein Vorzeichen tragen muesste.
 */
export function compactStressPoints(
  positions: readonly { y: number; z: number }[],
  zBands: readonly OutlineBand[],
  yBands: readonly OutlineBand[],
): StressPoint[] {
  return positions.map((position, index) => ({
    nr: index + 1,
    y: position.y,
    z: position.z,
    // Der Nenner in tau gehoert zur WAAGERECHTEN Schnittflaeche: die Breite in
    // dieser Hoehe. Beim breiten Gurt ist das `bf`, und genau das ist der
    // Grund, warum die Regel den Schwerpunkt und nicht die Stegmitte nennt.
    t: widthAt(zBands, position.z),
    Sy: momentBefore(zBands, position.z),
    Sz: momentBefore(yBands, position.y),
  }));
}

/** Vollrechteck: 4 Ecken + Schwerpunkt. */
export function rectanglePoints(b: number, h: number): StressPoint[] {
  const zBands: OutlineBand[] = [{ from: -h / 2, to: h / 2, width: b }];
  const yBands: OutlineBand[] = [{ from: -b / 2, to: b / 2, width: h }];
  return compactStressPoints(
    [
      { y: -b / 2, z: -h / 2 },
      { y: b / 2, z: -h / 2 },
      { y: -b / 2, z: h / 2 },
      { y: b / 2, z: h / 2 },
      { y: 0, z: 0 },
    ],
    zBands,
    yBands,
  );
}

/**
 * Plattenbalken: 8 Ecken + Schwerpunkt.
 *
 * `zs` ist der Abstand des Schwerpunkts von der GURTOBERKANTE; die Punkte
 * liegen wie ueberall SCHWERPUNKTSBEZOGEN.
 */
export function tBeamPoints(
  bf: number,
  hf: number,
  bw: number,
  h: number,
  zs: number,
): StressPoint[] {
  const top = -zs;
  const flangeBottom = -zs + hf;
  const bottom = h - zs;

  const zBands: OutlineBand[] = [
    { from: top, to: flangeBottom, width: bf },
    { from: flangeBottom, to: bottom, width: bw },
  ];
  const yBands: OutlineBand[] = [
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
    zBands,
    yBands,
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
export function iSymmetricPoints(
  h: number,
  b: number,
  tw: number,
  tf: number,
): StressPoint[] {
  const top = -h / 2;
  const topInner = -h / 2 + tf;
  const bottomInner = h / 2 - tf;
  const bottom = h / 2;

  const zBands: OutlineBand[] = [
    { from: top, to: topInner, width: b },
    { from: topInner, to: bottomInner, width: tw },
    { from: bottomInner, to: bottom, width: b },
  ];
  const yBands: OutlineBand[] = [
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
    zBands,
    yBands,
  );
}
