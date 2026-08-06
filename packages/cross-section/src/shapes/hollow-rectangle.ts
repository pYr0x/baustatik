import type { cm } from '@baustatik/units';
import type { Idealisation } from '../section';
import {
  crossWallSegment,
  endMoment,
  partSegments,
  type ShearSegment,
} from '../shear';
import { allPositive, type ShapeResult } from './kernel';

/**
 * Der geschlossene Kasten (QRO/RRO). `Iy` und `Iz` als Differenz aussen minus
 * innen.
 *
 * Eingabesystem: `y = 0` auf der Symmetrieachse, `z = 0` an der Oberkante.
 * Abmessungen in ZENTIMETERN (siehe `shapeResult`).
 */
export function hollowRectangle(
  b: cm,
  h: cm,
  t: cm,
  idealisation: Idealisation,
): ShapeResult | undefined {
  const bi = b - 2 * t;
  const hi = h - 2 * t;
  if (!allPositive(b, h, t, bi, hi)) return undefined;

  const A = b * h - bi * hi;
  const Iy = (b * h * h * h - bi * hi * hi * hi) / 12;
  const Iz = (h * b * b * b - hi * bi * bi * bi) / 12;

  const paths =
    idealisation === 'solid'
      ? {
          // Kompakt: waagerechte bzw. senkrechte Schnitte durch die Umrissfigur.
          // In der Mitte schneidet man BEIDE Waende, daher die Breite 2t.
          pathZ: partSegments(-h / 2, [
            { extent: t, width: b },
            { extent: hi, width: 2 * t },
            { extent: t, width: b },
          ]).segments,
          pathY: partSegments(-b / 2, [
            { extent: t, width: h },
            { extent: bi, width: 2 * t },
            { extent: t, width: h },
          ]).segments,
        }
      : {
          pathZ: closedBoxPath(b - t, h - t, t),
          pathY: closedBoxPath(h - t, b - t, t),
        };

  return { A, Iy, Iz, Iyz: 0, ys: 0, zs: h / 2, ...paths };
}

/**
 * Der Weg im geschlossenen, SYMMETRISCHEN Kasten.
 *
 * Ein geschlossener Querschnitt hat keinen freien Rand, an dem `S = 0` waere —
 * der Startschnitt kommt aus der Symmetrie: in der Mitte der beiden Waende, die
 * quer zur Schubrichtung liegen, ist der Schubfluss null. Belegt am
 * RSTAB-Dialog zu QRO 60x6,3: `Sy = 0` genau in Gurtmitte, `Sz = 0` genau in
 * Stegmitte — je Richtung ein anderer Schnitt.
 *
 * `along` ist die Mittellinien-Ausdehnung IN Schubrichtung, `across` quer dazu.
 * Vom Symmetrieschnitt laufen zwei spiegelbildliche Haelften los; sie sind
 * gleich lang und tragen dasselbe `S^2`, deshalb wird der halbe Weg zweimal
 * gezaehlt statt zweimal hingeschrieben.
 */
function closedBoxPath(
  across: number,
  along: number,
  t: number,
): ShearSegment[] {
  const arm = along / 2;

  // Vom Symmetrieschnitt bis zur Ecke: quer zur Schubrichtung, Hebelarm fest.
  const first = crossWallSegment(-arm, t, across / 2);
  // Die Wand laengs der Schubrichtung.
  const side = partSegments(
    -arm,
    [{ extent: along, width: t }],
    endMoment(first),
  ).segments[0];
  // Von der gegenueberliegenden Ecke zurueck zum zweiten Symmetrieschnitt.
  const last = crossWallSegment(arm, t, across / 2, endMoment(side));

  const half = [first, side, last];
  return [...half, ...half];
}
