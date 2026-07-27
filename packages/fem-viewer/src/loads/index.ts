/**
 * Lasten als Zeichen-Specs.
 *
 * Die Aufteilung dieses Ordners hat zwei Ebenen, und die Trennung ist der ganze
 * Punkt:
 *
 *   node-loads.ts / beam-loads.ts  WAS haengt wo — Lastarten, Ziele, Lage
 *   point-force.ts / moment.ts     WIE ein Symbol aussieht — Pfeil, Bogen
 *   label.ts / style.ts            was sich beide teilen
 *
 * Eine neue Lastart beruehrt damit nur die erste Ebene, ein geaendertes Symbol
 * nur die zweite. Diese Datei verteilt bloss.
 */

import type { Beam, Node } from '@baustatik/fem';
import { type FEMLoad, modelGeometry } from '@baustatik/fem-loads';
import type { Spec } from '@baustatik/render-core';
import type { Viewport } from '@baustatik/viewport-2d';

import { beamLoadSpecs } from './beam-loads';
import { nodeLoadSpecs } from './node-loads';
import type { LoadStyle } from './style';

export {
  DEFAULT_LOAD_STYLE,
  DEFAULT_MOMENT_RADIUS_PX,
  DEFAULT_POINT_FORCE_ARROW_LENGTH_PX,
  type LoadStyle,
} from './style';

interface LoadSpecOptions {
  readonly nodes: readonly Node[];
  readonly beams: readonly Beam[];
  readonly loads: readonly FEMLoad[];
  readonly viewport: Viewport;
  readonly style: Required<LoadStyle>;
}

/** Reine Abbildung Lasten -> Specs. */
export function loadSpecs(options: LoadSpecOptions): readonly Spec[] {
  const { nodes, beams, loads, viewport: vp, style } = options;

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  // Die Stabachse kommt aus `fem-loads`, samt der fachlichen Reihenfolge
  // p1 = Anfangs-, p2 = Endknoten — daran haengt `distanceFromStart`.
  const { beamAxis } = modelGeometry(nodes, beams);

  const specs: Spec[] = [];
  for (const load of loads) {
    specs.push(
      ...(load.target === 'node'
        ? nodeLoadSpecs(load, nodeById, vp, style)
        : beamLoadSpecs(load, beamAxis, vp, style)),
    );
  }

  return specs;
}
