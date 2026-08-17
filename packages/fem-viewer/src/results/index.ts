/**
 * ERGEBNISSE als Zeichen-Specs — Auflagerreaktionen und die Verlaeufe von N, V
 * und M.
 *
 * Dieselben zwei Ebenen wie `model/` und `loads/`:
 *
 *   reactions.ts        WAS haengt wo — Komponenten, Leserichtung, Ziele
 *   internal-forces.ts  WAS wo haengt — Bezugsgroessen, Abtastung, Extremwerte
 *   ../symbols/         WIE ein Symbol aussieht — Pfeil, Bogen, Label
 *   diagram-figure.ts   WIE ein Verlauf aussieht — Flaechen, Umriss, Labels
 *
 * KEIN ERGEBNIS IST DER AUS-ZUSTAND: `result === undefined` liefert eine leere
 * Liste. Ein Schalter daneben („Ergebnisse anzeigen") waere ein zweiter Zustand,
 * der mit dem ersten desynchronisieren kann — es gibt entweder ein gerechnetes
 * Ergebnis oder keines.
 *
 * EIN Ergebnis-Pull und nicht zwei: die Reaktionen kommen aus `result.reactions`
 * und nicht aus einer eigenen Quelle. Zwei Pulls, die dasselbe Ergebnis meinen,
 * koennten desynchronisieren — genau der zweite Zustand, den der Absatz darueber
 * schon einmal ausgeschlossen hat.
 *
 * Die VERLAEUFE haben ihren eigenen Schalter, und das ist kein Widerspruch:
 * `diagrams` sagt nicht, OB gerechnet wurde, sondern WELCHE der drei
 * Schnittgroessen man sehen will — eine Frage der Ansicht, nicht des Zustands.
 */

import type { Beam, Node } from '@baustatik/fem';
import type { SolveResult } from '@baustatik/fem-solver';
import type { Spec } from '@baustatik/render-core';
import type { Viewport } from '@baustatik/viewport-2d';

import { type DiagramOptions, internalForceSpecs } from './internal-forces';
import { reactionSpecs } from './reactions';
import { type ResultStyle, reactionSymbolStyle } from './style';

export { type DiagramOptions } from './internal-forces';
export { DEFAULT_RESULT_STYLE, type ResultStyle } from './style';

interface ResultSpecOptions {
  readonly nodes: readonly Node[];
  readonly beams: readonly Beam[];
  /** Das gerechnete Ergebnis EINES Lastfalls. Weggelassen = noch nicht gerechnet. */
  readonly result?: SolveResult;
  /** Weggelassen = keine Verlaeufe. */
  readonly diagrams?: DiagramOptions;
  readonly viewport: Viewport;
  readonly style: Required<ResultStyle>;
}

/** Reine Abbildung Ergebnis -> Specs. */
export function resultSpecs(options: ResultSpecOptions): readonly Spec[] {
  const { nodes, beams, result, diagrams, viewport: vp, style } = options;

  if (result === undefined) return [];

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const specs: Spec[] = [];

  // Verlaeufe vor Reaktionen, passend zur Bandreihenfolge — die z-Order
  // garantieren aber die Baender aus `FEM_LAYERS`, nicht diese Reihenfolge.
  if (diagrams !== undefined) {
    specs.push(
      ...internalForceSpecs({
        beams,
        nodeById,
        result,
        diagrams,
        viewport: vp,
        style,
      }),
    );
  }

  const symbols = reactionSymbolStyle(style);
  for (const [nodeId, reaction] of result.reactions) {
    specs.push(...reactionSpecs(nodeId, reaction, nodeById, vp, symbols));
  }

  return specs;
}
