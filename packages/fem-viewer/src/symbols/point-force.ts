/**
 * Die konzentrierte KRAFT als Pfeil mit Beschriftung.
 *
 * Der Pfeil ist ein SCHEMA: seine Laenge sagt nichts ueber den Betrag, sie ist
 * fuer jede Kraft dieselbe. Den Betrag traegt das Label. (Streckenlasten werden
 * sich das nicht leisten koennen — dort muss die Hoehe skalieren, sonst sind
 * 5 kN/m und 50 kN/m nicht unterscheidbar.)
 *
 * WOHER Lage und Richtung kommen, entscheidet diese Datei nicht: sie bekommt
 * beides fertig herein. Fuer eine Stablast beantwortet das
 * `@baustatik/fem-load-resolve` bereits fuer den Solver; fuer eine
 * Auflagerreaktion steht die Richtung schon im Vorzeichen von `SupportReaction`.
 *
 * WESSEN Pfeil das ist, weiss die Datei ebenfalls nicht: `layer` und die Farben
 * kommen von aussen. Deshalb zeichnet sie Last und Reaktion mit demselben Code,
 * ohne dass eine der beiden Seiten die andere kennt.
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

/**
 * Das AEUSSERE Pfeilende: Angriffspunkt minus Wirkrichtung mal Pfeillaenge.
 *
 * Pfeil und Label haengen beide daran — der eine faengt dort an, das andere
 * liegt dahinter. Zweimal gerechnet koennten sie auseinanderrutschen.
 *
 * GETEILT durch scale: der Pfeil ist ein Symbol und soll beim Zoomen gleich
 * gross bleiben. Ausgenommen strokeWidth — das zeichnet der Adapter ohnehin in
 * Screen-Pixeln (strokeScaleEnabled: false).
 */
function arrowTail(force: PointForce, vp: Viewport, style: SymbolStyle): Point {
  const length = style.forceArrowLengthPx / vp.scale;
  return Point.translate(force.at, Vector.scale(force.direction, -length));
}

function arrowSpec(
  force: PointForce,
  tail: Point,
  vp: Viewport,
  style: SymbolStyle,
): ArrowSpec {
  return {
    kind: 'arrow',
    id: `${force.id}:arrow`,
    layer: force.layer,
    tail: worldPoint(tail.x, tail.z),
    // Die Spitze liegt EXAKT am Angriffspunkt.
    tip: worldPoint(force.at.x, force.at.z),
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
  const tail = arrowTail(force, vp, style);

  return [
    arrowSpec(force, tail, vp, style),
    symbolLabelSpec({
      id: `${force.id}:label`,
      layer: force.layer,
      text: forceLabelText(force.magnitude),
      // Anker ist das AEUSSERE Pfeilende, die Richtung zeigt vom Pfeil weg.
      anchor: tail,
      direction: Vector.make(
        opposite(force.direction.dx),
        opposite(force.direction.dz),
      ),
      viewport: vp,
      style,
    }),
  ];
}
