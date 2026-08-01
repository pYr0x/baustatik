/**
 * Lasten als Zeichen-Specs.
 *
 * Die Aufteilung hat zwei Ebenen, und die Trennung ist der ganze Punkt:
 *
 *   node-loads.ts / beam-loads.ts  WAS haengt wo — Lastarten, Ziele, Lage
 *   ../symbols/                    WIE ein Symbol aussieht — Pfeil, Bogen, Label
 *
 * Eine neue Lastart beruehrt damit nur die erste Ebene, ein geaendertes Symbol
 * nur die zweite. Die zweite Ebene liegt nicht mehr in diesem Ordner, seit die
 * Auflagerreaktionen (`../results/`) dieselben Symbole bespielen.
 *
 * Diese Datei verteilt bloss — und loest den Stil EINMAL auf die neutralen
 * Symbolnamen auf, damit beide Lasthaelften denselben Wert sehen.
 */

import type { Beam, Node } from '@baustatik/fem';
import { type FEMLoad, modelGeometry } from '@baustatik/fem-loads';
import type { Spec } from '@baustatik/render-core';
import type { Viewport } from '@baustatik/viewport-2d';

import { beamLoadSpecs } from './beam-loads';
import { nodeLoadSpecs } from './node-loads';
import { type LoadStyle, loadSymbolStyle } from './style';

export { DEFAULT_LOAD_STYLE, type LoadStyle } from './style';

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

  const symbols = loadSymbolStyle(style);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  // Die Stabachse kommt aus `fem-loads`, samt der fachlichen Reihenfolge
  // p1 = Anfangs-, p2 = Endknoten — daran haengt `distanceFromStart`.
  const { beamAxis } = modelGeometry(nodes, beams);

  const specs: Spec[] = [];
  for (const load of loads) {
    specs.push(
      ...(load.target === 'node'
        ? nodeLoadSpecs(load, nodeById, vp, symbols)
        : beamLoadSpecs(load, beamAxis, vp, symbols)),
    );
  }

  return specs;
}
