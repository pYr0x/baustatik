/**
 * Der KNOTEN als kleiner Kreis.
 *
 * Ein Symbol ohne physische Ausdehnung: der Radius steht in Screen-Pixeln und
 * bleibt beim Zoomen konstant.
 */

import type { Node } from '@baustatik/fem';
import type { CircleSpec } from '@baustatik/render-core';
import { type Viewport, worldPoint } from '@baustatik/viewport-2d';

import type { ModelStyle } from './style';

export function nodeSpec(
  node: Node,
  vp: Viewport,
  style: Required<ModelStyle>,
): CircleSpec {
  return {
    kind: 'circle',
    id: `node:${node.id}`,
    layer: 'nodes',
    center: worldPoint(node.position.x, node.position.z),
    // GETEILT, im Gegensatz zu strokeWidth: Konva.Circle.radius liegt als
    // einziges Feld in lokalen Koordinaten und skaliert mit der Stage.
    radius: style.nodeRadiusPx / vp.scale,
    fillColor: style.nodeColor,
  };
}
