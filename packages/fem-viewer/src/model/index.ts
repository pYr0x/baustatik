/**
 * Das MODELL als Zeichen-Specs — Staebe, Knoten, Gelenke, Auflager.
 *
 * Die Aufteilung dieses Ordners hat zwei Ebenen, genau wie `loads/`:
 *
 *   index.ts                    WAS gezeichnet wird — Verteilung, Referenzen
 *   beam.ts / node.ts           die Elemente selbst
 *   fiber.ts                    die gestrichelte Faser auf der +ez-Seite
 *   hinge.ts                    WIE ein Gelenk aussieht und wo es sitzt
 *   support.ts                  WELCHES Auflagersymbol ein Fall bekommt
 *   support-symbols.ts          WIE diese Symbole aussehen
 *   style.ts                    was sich alle teilen
 *
 * Ein neuer Auflagerfall beruehrt damit nur `support.ts`, ein geaendertes
 * Symbol nur `support-symbols.ts`. Diese Datei verteilt bloss und loest die
 * Knotenreferenzen auf.
 */

import type { Beam, Node, NodeSupport } from '@baustatik/fem';
import type { Spec } from '@baustatik/render-core';
import type { Viewport } from '@baustatik/viewport-2d';

import { UnknownNodeReferenceError } from '../errors';
import { beamSpecs } from './beam';
import { fiberSpec } from './fiber';
import { nodeSpec } from './node';
import type { ModelStyle } from './style';
import { supportSpec } from './support';

export { DEFAULT_MODEL_STYLE, type ModelStyle } from './style';

interface ModelSpecOptions {
  readonly nodes: readonly Node[];
  readonly beams: readonly Beam[];
  readonly supports: readonly NodeSupport[];
  readonly viewport: Viewport;
  readonly style: Required<ModelStyle>;
}

/** Reine Abbildung Modell -> Specs. */
export function modelSpecs(options: ModelSpecOptions): readonly Spec[] {
  const { nodes, beams, supports, viewport: vp, style } = options;

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const specs: Spec[] = [];

  // Staebe vor Knoten, damit das Array die Bandreihenfolge widerspiegelt und
  // lesbar bleibt. Die GARANTIE liefern aber die Baender, nicht diese
  // Reihenfolge — der Renderer haengt neue Shapes sonst ungefragt obenauf.
  for (const beam of beams) {
    const start = byId.get(beam.startNodeId);
    if (!start) throw new UnknownNodeReferenceError(beam.id, beam.startNodeId);
    const end = byId.get(beam.endNodeId);
    if (!end) throw new UnknownNodeReferenceError(beam.id, beam.endNodeId);

    // Die Faser haengt an JEDEM Stab und braucht kein Ergebnis: sie sagt, welche
    // Seite die Knotenreihenfolge zur +z-Seite gemacht hat, und genau dorthin
    // traegt `results/internal-forces.ts` spaeter einen positiven Wert ab.
    specs.push(
      ...beamSpecs(beam, start, end, vp, style),
      fiberSpec(beam, start, end, vp, style),
    );
  }

  for (const node of nodes) {
    specs.push(nodeSpec(node, vp, style));
  }

  for (const support of supports) {
    const node = byId.get(support.nodeId);
    if (!node) {
      throw new UnknownNodeReferenceError(
        support.id,
        support.nodeId,
        'NodeSupport',
      );
    }

    specs.push(
      supportSpec({
        support,
        position: node.position,
        scale: vp.scale,
        color: style.nodeSupportColor,
      }),
    );
  }

  return specs;
}
