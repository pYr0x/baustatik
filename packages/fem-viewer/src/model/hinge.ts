/**
 * Das GELENK als kleiner, weiss gefuellter Kreis auf der Stabachse.
 *
 * WO ES SITZT: nicht im Knoten, sondern um zwei Knotenradien davon weg auf der
 * Stabachse, in Richtung des eigenen Stabs. Im Knoten laege es unter dem
 * Knotenpunkt, und an einem Knoten mit mehreren gelenkig angeschlossenen
 * Staeben laegen alle Gelenke uebereinander — die Zeichnung sagte dann nicht
 * mehr, WELCHER Stab gelenkig anschliesst. Der Versatz ist screen-konstant,
 * deshalb durch `vp.scale` geteilt.
 *
 * WELCHE FREIGABE EIN GELENK IST: jede. `u`, `w` und `theta` bekommen dasselbe
 * Symbol — der Viewer zeigt, DASS der Stab hier gelenkig anschliesst, nicht
 * welche Komponente freigegeben ist. Eine Unterscheidung braeuchte drei eigene
 * Symbole und eine Antwort darauf, wie Kombinationen aussehen.
 */

import type { Beam, BeamEndReleases, Node } from '@baustatik/fem';
import { Point, Vector } from '@baustatik/fem-geometry';
import type { CircleSpec } from '@baustatik/render-core';
import { type Viewport, worldPoint } from '@baustatik/viewport-2d';

import type { ModelStyle } from './style';

/** Traegt dieses Stabende ueberhaupt eine Freigabe? */
export function hasRelease(release?: BeamEndReleases): boolean {
  return release?.u === true || release?.w === true || release?.theta === true;
}

export function hingeSpec(
  beam: Beam,
  atNode: Node,
  /** Richtung vom betrachteten Ende in den Stab hinein. Laenge egal. */
  v: Vector,
  vp: Viewport,
  style: Required<ModelStyle>,
): CircleSpec {
  const hingePosition = Point.translate(
    atNode.position,
    Vector.scale(Vector.normalize(v), (style.nodeRadiusPx * 2) / vp.scale),
  );

  return {
    kind: 'circle',
    // Die ID nennt Stab UND Knoten: an einem Knoten koennen mehrere Staebe
    // gelenkig anschliessen, und jeder bekommt sein eigenes Symbol.
    id: `beam:${beam.id}:hinge:${atNode.id}`,
    layer: 'hinges',
    center: worldPoint(hingePosition.x, hingePosition.z),
    radius: style.hingeRadiusPx / vp.scale,
    fillColor: style.hingeInnerColor,
    strokeWidth: 1,
    strokeColor: style.hingeStrokeColor,
  };
}
