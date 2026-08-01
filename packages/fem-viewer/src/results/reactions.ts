/**
 * AUFLAGERREAKTIONEN -> Symbole. Wie bei den Knotenlasten steht hier nur, WAS an
 * einem Knoten haengt; wie ein Pfeil oder ein Bogen aussieht, steht in
 * `../symbols/`.
 *
 * LESERICHTUNG: `SupportReaction` ist die Kraft, die das Auflager auf das
 * TRAGWERK ausuebt (`fem-solver/src/solve.ts`). Eine Stuetze unter einer nach
 * unten wirkenden Last liefert damit ein negatives `fz`, und der Pfeil zeigt
 * nach oben. Gezeichnet wird mit derselben Regel wie die Last — SPITZE am
 * Knoten —, und genau dadurch ist die Gleichgewichtsprobe
 * `Summe Lasten + Summe Reaktionen = 0` im Bild ablesbar: alle Pfeile am selben
 * Knoten meinen dasselbe. Die Gegenrichtung („was das Tragwerk auf das Auflager
 * drueckt") waere eine zweite Vorzeichenkonvention in einem Bild.
 *
 * Eine freigegebene Richtung traegt exakt 0 und faellt damit in `pointForce`
 * beziehungsweise `moment` heraus — ein Zweiwertlager erzeugt von selbst zwei
 * Symbole und kein drittes. Deshalb steht hier keine Fallunterscheidung ueber
 * `NodeSupport`: was gehalten wird, sagt das Ergebnis bereits.
 */

import type { Node } from '@baustatik/fem';
import { Vector } from '@baustatik/fem-geometry';
import type { SupportReaction } from '@baustatik/fem-solver';
import type { Spec } from '@baustatik/render-core';
import type { Viewport } from '@baustatik/viewport-2d';

import { UnknownNodeReferenceError } from '../errors';
import {
  moment,
  momentSpecs,
  pointForce,
  pointForceSpecs,
  type SymbolStyle,
} from '../symbols';

export function reactionSpecs(
  nodeId: string,
  reaction: SupportReaction,
  nodeById: ReadonlyMap<string, Node>,
  vp: Viewport,
  style: SymbolStyle,
): readonly Spec[] {
  const node = nodeById.get(nodeId);
  // MODELLfehler, nicht Lastfehler: ein Ergebnis, das einen Knoten nennt, den
  // das Modell nicht hat, gehoert nicht zu diesem Modell. Element-ID und
  // Knoten-ID fallen zusammen, weil eine Reaktion keine eigene Kennung hat —
  // sie IST der Knoten.
  if (node === undefined) {
    throw new UnknownNodeReferenceError(nodeId, nodeId, 'Auflagerreaktion');
  }

  const specs: Spec[] = [];

  // Je Komponente ein eigenes Symbol, wie bei der Knotenlast: so bleibt die
  // Darstellung eine Richtung statt einer Resultierenden, und beide Bilder sind
  // nach derselben Regel zu lesen.
  const fx = pointForce(
    `reaction:${nodeId}:fx`,
    'reactions',
    node.position,
    Vector.make(1, 0),
    reaction.fx,
  );
  if (fx) specs.push(...pointForceSpecs(fx, vp, style));

  const fz = pointForce(
    `reaction:${nodeId}:fz`,
    'reactions',
    node.position,
    Vector.make(0, 1),
    reaction.fz,
  );
  if (fz) specs.push(...pointForceSpecs(fz, vp, style));

  // `my` ist wie das Lastmoment um global y definiert, positiv also gegen den
  // Uhrzeigersinn — kein zweiter Drehsinn im selben Bild.
  const my = moment(
    `reaction:${nodeId}:my`,
    'reactions',
    node.position,
    reaction.my,
  );
  if (my) specs.push(...momentSpecs(my, vp, style));

  return specs;
}
