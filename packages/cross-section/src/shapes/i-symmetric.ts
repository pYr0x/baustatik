import type { cm } from '@baustatik/units';
import type { Idealisation } from '../section';
import { crossWallInterval, endMoment, partIntervals } from '../shear';
import { allPositive, type ShapeResult } from './kernel';

/**
 * Das doppeltsymmetrische I — GESCHWEISST, also OHNE Ausrundung. Genau das ist
 * der Unterschied zum Walzprofil aus dem Katalog: mit denselben vier
 * Abmessungen kommt hier eine etwas kleinere Flaeche heraus, weil das Material
 * am Steg-Gurt-Uebergang fehlt.
 *
 * Eingabesystem: `y = 0` auf der Symmetrieachse, `z = 0` an der Oberkante.
 * Abmessungen in ZENTIMETERN (siehe `shapeResult`).
 */
export function iSymmetric(
  h: cm,
  b: cm,
  tw: cm,
  tf: cm,
  idealisation: Idealisation,
): ShapeResult | undefined {
  const hw = h - 2 * tf;
  if (!allPositive(h, b, tw, tf, hw, b - tw)) return undefined;

  const A = 2 * b * tf + hw * tw;
  const Iy = (b * h * h * h - (b - tw) * hw * hw * hw) / 12;
  const Iz = (2 * tf * b * b * b + hw * tw * tw * tw) / 12;

  const paths =
    idealisation === 'solid'
      ? solidPaths(h, b, tw, tf, hw)
      : thinPaths(h, b, tw, tf);

  // Doppeltsymmetrisch: Schubmittelpunkt = Schwerpunkt.
  return { A, Iy, Iz, Iyz: 0, ys: 0, zs: h / 2, yM: 0, zM: h / 2, ...paths };
}

/** Kompakt: Schnitte quer zur Schubrichtung durch die volle Umrissfigur. */
function solidPaths(h: number, b: number, tw: number, tf: number, hw: number) {
  return {
    pathZ: partIntervals(-h / 2, [
      { extent: tf, width: b },
      { extent: hw, width: tw },
      { extent: tf, width: b },
    ]).intervals,
    // Senkrechte Schnitte: ausserhalb des Stegs trifft man beide Gurte
    // (Hoehe 2*tf), ueber dem Steg zusaetzlich den Steg (Hoehe h).
    pathY: partIntervals(-b / 2, [
      { extent: (b - tw) / 2, width: 2 * tf },
      { extent: tw, width: h },
      { extent: (b - tw) / 2, width: 2 * tf },
    ]).intervals,
  };
}

/**
 * Duennwandig: der Weg laeuft ueber die MITTELLINIEN, der Steg also von
 * Gurtmitte zu Gurtmitte (Laenge `h - tf`, nicht `h - 2tf`).
 *
 * Genau diese Idealisierung reproduziert `Sy,max` des Katalogs: fuer IPE 80
 * liefert sie 11,60 cm3 gegen tabellierte 11,61 — die kompakte Fassung kaeme
 * auf 11,25 und laege damit weit daneben.
 */
function thinPaths(h: number, b: number, tw: number, tf: number) {
  const zf = (h - tf) / 2;

  // Vier Gurthaelften, alle mit demselben |S|-Verlauf: vom freien Ende zur
  // Stegachse waechst S linear auf zf*tf*b/2.
  const flangeHalf = crossWallInterval(-zf, tf, b / 2);
  const web = partIntervals(
    -zf,
    [{ extent: 2 * zf, width: tw }],
    2 * endMoment(flangeHalf),
  ).intervals[0];

  return {
    // Der Steg erbt beide oberen Gurthaelften; die beiden unteren tragen
    // dieselbe Groesse spiegelbildlich zurueck auf null.
    pathZ: [flangeHalf, flangeHalf, web, flangeHalf, flangeHalf],
    // Fuer Vy traegt der Steg NICHTS: sein abgeschnittener Teil ist um y = 0
    // symmetrisch, sein erstes Flaechenmoment um z also null. Die Querkraft in
    // y laeuft vollstaendig ueber die Gurte.
    pathY: [
      partIntervals(-b / 2, [{ extent: b, width: tf }]).intervals[0],
      partIntervals(-b / 2, [{ extent: b, width: tf }]).intervals[0],
    ],
  };
}
