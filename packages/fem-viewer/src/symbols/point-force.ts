/**
 * Die konzentrierte KRAFT als Pfeil mit Beschriftung.
 *
 * Der Pfeil ist ein SCHEMA: seine Laenge sagt nichts ueber den Betrag, sie ist
 * fuer jede Kraft dieselbe. Den Betrag traegt das Label. (Bei der Streckenlast
 * ist es genau umgekehrt — dort IST die Pfeillaenge die Ordinate. Deshalb steht
 * sie in `distributed-force.ts` und nicht als Parameter hier.)
 *
 * WOHER Lage und Richtung kommen, entscheidet diese Datei nicht: sie bekommt
 * beides fertig herein. Fuer eine Stablast beantwortet das
 * `@baustatik/fem-load-resolve` bereits fuer den Solver; fuer eine
 * Auflagerreaktion steht die Richtung schon im Vorzeichen von `SupportReaction`.
 *
 * WESSEN Pfeil das ist, weiss die Datei ebenfalls nicht: `layer` und die Farben
 * kommen von aussen. Deshalb zeichnet sie Last und Reaktion mit demselben Code,
 * ohne dass eine der beiden Seiten die andere kennt.
 *
 * DIE SPITZE STEHT UM `forceGapPx` VOR DEM ANGRIFFSPUNKT, sie liegt nicht darin:
 * dieselbe Luft, die die Streckenlast ueber dem Stab laesst, und aus demselben
 * Grund — die Figur behauptet damit nicht, sie sei ein Teil des Tragwerks. Fuer
 * die Reaktion gilt derselbe Gap wie fuer die Last, und genau deshalb bleibt die
 * Gleichgewichtsprobe im Bild ablesbar: die beiden Pfeile am selben Knoten
 * stehen gleich weit ab und zeigen einander entgegen. WO die Last angreift, sagt
 * auf einem Stab die Marke (`marker.ts`), am Knoten der Knoten selbst.
 */

import { Point, Vector } from '@baustatik/fem-geometry';
import type { ArrowSpec, Spec } from '@baustatik/render-core';
import { type Viewport, worldPoint } from '@baustatik/viewport-2d';

import type { FEMLayer } from '../layers';
import { forceLabelText, symbolLabelSpec } from './label';
import type { SymbolStyle } from './style';

/** Eine gezeichnete Kraft: wo sie angreift, wohin sie zeigt, wie gross sie ist. */
export interface PointForce {
  /** Global eindeutig, aus Last- bzw. Knoten-ID und ggf. Komponente. */
  readonly id: string;
  /** Malband — das sagt die Quelle, nicht das Symbol. */
  readonly layer: FEMLayer;
  /** Angriffspunkt — hier liegt die PFEILSPITZE. */
  readonly at: Point;
  /** Einheitsvektor der Wirkrichtung, global. */
  readonly direction: Vector;
  /** Betrag in kN, bereits ohne Vorzeichen. */
  readonly magnitude: number;
}

/**
 * Eine gerichtete Kraft aus Achse und vorzeichenbehaftetem Wert.
 *
 * `undefined` und 0 fallen gemeinsam heraus — fuer die Komponenten einer
 * Knotenlast wie fuer `p` einer Stab-Einzellast, und ebenso fuer die freigegebene
 * Richtung eines Auflagers, die exakt 0 traegt: ein Wert ohne Betrag hat keine
 * Richtung, und ein Pfeil der Laenge 0 waere kein Bild, sondern ein Punkt.
 * `validateLoads` beanstandet solche Lasten bereits; das Zeichnen soll daran
 * aber nicht scheitern.
 */
export function pointForce(
  id: string,
  layer: FEMLayer,
  at: Point,
  axis: Vector,
  value: number | undefined,
): PointForce | undefined {
  if (value === undefined || value === 0) return undefined;
  return {
    id,
    layer,
    at,
    direction: Vector.scale(axis, Math.sign(value)),
    magnitude: Math.abs(value),
  };
}

/** Die beiden Enden des Schafts, entgegen der Wirkrichtung abgetragen. */
interface Shaft {
  /** Um `forceGapPx` vor dem Angriffspunkt, nicht darin. */
  readonly tip: Point;
  /** Das AEUSSERE Ende: nochmals `forceArrowLengthPx` weiter. */
  readonly tail: Point;
}

/**
 * Beide Enden AUS EINER Rechnung: der Pfeil spannt zwischen ihnen, das Label
 * haengt hinter dem aeusseren, und getrennt gerechnet koennten sie
 * auseinanderrutschen.
 *
 * GETEILT durch scale: der Pfeil ist ein Symbol und soll beim Zoomen gleich
 * gross bleiben — der Gap ebenso, sonst waechst die Luecke beim Herauszoomen ins
 * Bild. Ausgenommen strokeWidth, das der Adapter ohnehin in Screen-Pixeln
 * zeichnet (strokeScaleEnabled: false).
 */
function shaft(force: PointForce, vp: Viewport, style: SymbolStyle): Shaft {
  const back = (distance: number): Point =>
    Point.translate(force.at, Vector.scale(force.direction, -distance / vp.scale));
  return {
    tip: back(style.forceGapPx),
    tail: back(style.forceGapPx + style.forceArrowLengthPx),
  };
}

function arrowSpec(
  force: PointForce,
  { tip, tail }: Shaft,
  vp: Viewport,
  style: SymbolStyle,
): ArrowSpec {
  return {
    kind: 'arrow',
    id: `${force.id}:arrow`,
    layer: force.layer,
    tail: worldPoint(tail.x, tail.z),
    tip: worldPoint(tip.x, tip.z),
    pointerLength: style.forcePointerLengthPx / vp.scale,
    pointerWidth: style.forcePointerWidthPx / vp.scale,
    strokeColor: style.forceColor,
    strokeWidth: style.forceArrowWidthPx,
    fillColor: style.forceColor,
  };
}

/** Vorzeichenwechsel ohne `-0`: fachlich dasselbe, in Specs und Tests aber Laerm. */
function opposite(value: number): number {
  return value === 0 ? 0 : -value;
}

export function pointForceSpecs(
  force: PointForce,
  vp: Viewport,
  style: SymbolStyle,
): readonly Spec[] {
  const ends = shaft(force, vp, style);

  return [
    arrowSpec(force, ends, vp, style),
    symbolLabelSpec({
      id: `${force.id}:label`,
      layer: force.layer,
      text: forceLabelText(force.magnitude),
      // Anker ist das AEUSSERE Pfeilende, die Richtung zeigt vom Pfeil weg.
      anchor: ends.tail,
      direction: Vector.make(
        opposite(force.direction.dx),
        opposite(force.direction.dz),
      ),
      viewport: vp,
      style,
    }),
  ];
}
