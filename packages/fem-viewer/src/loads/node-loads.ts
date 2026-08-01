/**
 * KNOTENlasten -> Symbole. Diese Datei beantwortet nur, WAS an einem Knoten
 * haengt; wie ein Pfeil oder ein Bogen aussieht, steht in `point-force.ts` und
 * `moment.ts`.
 *
 * Eine Knotenlast traegt `fx`, `fz` und `my` im SELBEN Objekt. Der Zeichner
 * behandelt sie deshalb nicht als Entweder-Oder: ein Knoten kann gleichzeitig
 * Kraft und Moment tragen, und dann steht beides im Bild.
 */

import type { Node } from '@baustatik/fem';
import { Vector } from '@baustatik/fem-geometry';
import { type NodeLoad, UnknownLoadTargetError } from '@baustatik/fem-loads';
import type { Spec } from '@baustatik/render-core';
import type { Viewport } from '@baustatik/viewport-2d';

import {
  moment,
  momentSpecs,
  pointForce,
  pointForceSpecs,
  type SymbolStyle,
} from '../symbols';

export function nodeLoadSpecs(
  load: NodeLoad,
  nodeById: ReadonlyMap<string, Node>,
  vp: Viewport,
  style: SymbolStyle,
): readonly Spec[] {
  const specs: Spec[] = [];

  for (const nodeId of load.nodeIds) {
    const node = nodeById.get(nodeId);
    // Ein Lastziel, das es nicht gibt, ist ein LASTfehler — nicht der
    // Modellfehler `UnknownNodeReferenceError`, den ein ins Leere zeigender
    // Stab ausloest. Dieselbe Arbeitsteilung wie in `fem-loads`.
    if (node === undefined) {
      throw new UnknownLoadTargetError(load.id, 'node', nodeId);
    }

    // Je Komponente ein eigenes Symbol: so gibt der Anwender es ein, und so
    // bleibt die Darstellung eine Richtung statt einer Resultierenden.
    const fx = pointForce(
      `load:${load.id}:${nodeId}:fx`,
      'loads',
      node.position,
      Vector.make(1, 0),
      load.fx,
    );
    if (fx) specs.push(...pointForceSpecs(fx, vp, style));

    const fz = pointForce(
      `load:${load.id}:${nodeId}:fz`,
      'loads',
      node.position,
      Vector.make(0, 1),
      load.fz,
    );
    if (fz) specs.push(...pointForceSpecs(fz, vp, style));

    const my = moment(
      `load:${load.id}:${nodeId}:my`,
      'loads',
      node.position,
      load.my,
    );
    if (my) specs.push(...momentSpecs(my, vp, style));
  }

  return specs;
}
