import type { cm } from '@baustatik/units';
import type { Idealisation } from '../../model/idealisation';
import {
  crossWallInterval,
  endMoment,
  partIntervals,
  type ShearFlowInterval,
} from '../shear';
import { allPositive, type ShapeResult } from './kernel';

/**
 * Der geschlossene Kasten (QRO/RRO). `Iy` und `Iz` als Differenz aussen minus
 * innen.
 *
 * Eingabesystem: `y = 0` auf der Symmetrieachse, `z = 0` an der Oberkante.
 * Abmessungen in ZENTIMETERN (siehe `shapeValues`).
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
      ? // KOMPAKT GIBT ES KEINEN WEG MEHR (ADR 0062): hier standen waagerechte
        // bzw. senkrechte Schnitte durch die Umrissfigur, in der Mitte durch
        // BEIDE Waende. Der solide Kasten laeuft jetzt als ZWEI Ringe —
        // Material und Loch — durch die FE, und die kostet ein Loch seit
        // ADR 0048 nichts.
        {}
      : {
          // Die Querwand laeuft bis zur AUSSENKANTE, die Laengswand ueber die
          // LICHTE Weite — die exakte Parkettierung der Umrissfigur, siehe
          // `closedBoxPath`. Der Hebelarm bleibt die Mittellinie.
          pathZ: closedBoxPath(b / 2, h - 2 * t, (h - t) / 2, t),
          pathY: closedBoxPath(h / 2, b - 2 * t, (b - t) / 2, t),
        };

  // Doppeltsymmetrisch: Schubmittelpunkt = Schwerpunkt.
  return {
    A,
    Iy,
    Iz,
    Iyz: 0,
    ys: 0,
    zs: h / 2,
    yM: 0,
    zM: h / 2,
    // BREDT, ausgeschrieben: `4·A_m²/∮(ds/t)` mit `A_m = (b−t)(h−t)` und
    // `∮ds/t = 2((b−t)+(h−t))/t`. Gegenueber `⅓Σl·t³` sind das drei
    // Zehnerpotenzen — der geschlossene Kasten ist genau der Fall, an dem
    // `idealisation` bei `It` am meisten haengt.
    It:
      idealisation === 'thin-walled'
        ? (2 * t * (b - t) ** 2 * (h - t) ** 2) / (b - t + (h - t))
        : undefined,
    ...paths,
  };
}

/**
 * Der Weg im geschlossenen, SYMMETRISCHEN Kasten.
 *
 * Ein geschlossener Querschnitt hat keinen freien Rand, an dem `S = 0` waere —
 * der Startschnitt kommt aus der Symmetrie: in der Mitte der beiden Waende, die
 * quer zur Schubrichtung liegen, ist der Schubfluss null: `Sy = 0` genau in Gurtmitte, `Sz = 0` genau in
 * Stegmitte — je Richtung ein anderer Schnitt.
 *
 * DIE WAENDE PARKETTIEREN DIE UMRISSFIGUR, sie liegen nicht auf der
 * Mittellinie ([ADR 0051](../../../../docs/adr/0051-the-closed-box-tiles-the-outline-figure.md)).
 * Die QUERWAND laeuft bis zur Aussenkante (`crossOuterHalf`), die LAENGSWAND
 * ueber die lichte Weite (`alongClear`) — zusammen decken sie die Figur
 * lueckenlos und ueberschneidungsfrei ab. Das reine Mittellinienmodell tut das
 * nicht: es zaehlt an jeder Ecke ein Viertelquadrat `t/2 x t/2` doppelt und
 * laesst das gegenueberliegende weg. Die Flaeche geht dabei auf, das erste
 * Flaechenmoment nicht — pro Ecke fehlen `t³/8`.
 *
 * DIE UMLAUFLAENGE AENDERT SICH NICHT: `b/2 + (h/2 − t)` ist dasselbe wie
 * `(b−t)/2 + (h−t)/2`. Es verschiebt sich nur die Trennstelle, um `t/2`.
 *
 * Der HEBELARM `arm` bleibt die Mittellinie der Laengswand — er ist der
 * Schwerpunktabstand der Querwand, und der liegt auf halber Wanddicke.
 *
 * Vom Symmetrieschnitt laufen zwei spiegelbildliche Haelften los; sie sind
 * gleich lang und tragen dasselbe `S^2`, deshalb wird der halbe Weg zweimal
 * gezaehlt statt zweimal hingeschrieben.
 */
function closedBoxPath(
  crossOuterHalf: number,
  alongClear: number,
  arm: number,
  t: number,
): ShearFlowInterval[] {
  // Vom Symmetrieschnitt bis zur Aussenkante: quer zur Schubrichtung,
  // Hebelarm fest.
  const first = crossWallInterval(-arm, t, crossOuterHalf);
  // Die Wand laengs der Schubrichtung, ueber die lichte Weite.
  const side = partIntervals(
    -alongClear / 2,
    [{ extent: alongClear, width: t }],
    endMoment(first),
  ).intervals[0];
  // Von der gegenueberliegenden Seite zurueck zum zweiten Symmetrieschnitt.
  const last = crossWallInterval(arm, t, crossOuterHalf, endMoment(side));

  const half = [first, side, last];
  return [...half, ...half];
}
