/**
 * ERGEBNISSE als Zeichen-Specs — heute die Auflagerreaktionen.
 *
 * Dieselben zwei Ebenen wie `model/` und `loads/`:
 *
 *   reactions.ts   WAS haengt wo — Komponenten, Leserichtung, Ziele
 *   ../symbols/    WIE ein Symbol aussieht — Pfeil, Bogen, Label
 *
 * KEIN ERGEBNIS IST DER AUS-ZUSTAND: `reactions === undefined` liefert eine
 * leere Liste. Ein Schalter daneben („Ergebnisse anzeigen") waere ein zweiter
 * Zustand, der mit dem ersten desynchronisieren kann — es gibt entweder ein
 * gerechnetes Ergebnis oder keines.
 *
 * Die Verlaeufe von N, V und M kommen hierher, sobald das Bezugsmass ueber alle
 * Staebe geklaert ist — dieselbe offene Frage, an der heute die Streckenlasten
 * haengen. Die Datenseite ist mit `internalForcesAlong` bereits fertig.
 */

import type { Node } from '@baustatik/fem';
import type { SupportReaction } from '@baustatik/fem-solver';
import type { Spec } from '@baustatik/render-core';
import type { Viewport } from '@baustatik/viewport-2d';

import { reactionSpecs } from './reactions';
import { type ResultStyle, reactionSymbolStyle } from './style';

export { DEFAULT_RESULT_STYLE, type ResultStyle } from './style';

interface ResultSpecOptions {
  readonly nodes: readonly Node[];
  /** Je Knoten MIT Auflager, direkt aus `SolveResult.reactions`. */
  readonly reactions?: ReadonlyMap<string, SupportReaction>;
  readonly viewport: Viewport;
  readonly style: Required<ResultStyle>;
}

/** Reine Abbildung Ergebnis -> Specs. */
export function resultSpecs(options: ResultSpecOptions): readonly Spec[] {
  const { nodes, reactions, viewport: vp, style } = options;

  if (reactions === undefined) return [];

  const symbols = reactionSymbolStyle(style);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  const specs: Spec[] = [];
  for (const [nodeId, reaction] of reactions) {
    specs.push(...reactionSpecs(nodeId, reaction, nodeById, vp, symbols));
  }

  return specs;
}
