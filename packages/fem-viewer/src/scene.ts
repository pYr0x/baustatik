/**
 * Die SZENE: Modell, Lasten und Ergebnisse zu einer Spec-Liste zusammengesetzt.
 *
 * Diese Datei komponiert nur. Was ein Stab, ein Knoten, ein Gelenk oder ein
 * Auflager zeichnet, steht in `model/`; was eine Last zeichnet, in `loads/`; was
 * ein Ergebnis zeichnet, in `results/`. Kein Driver, kein Konva, kein Zustand —
 * deshalb in Node testbar.
 */

import type { Beam, Node, NodeSupport } from '@baustatik/fem';
import type { FEMLoad } from '@baustatik/fem-loads';
import type { SupportReaction } from '@baustatik/fem-solver';
import type { Spec } from '@baustatik/render-core';
import type { Viewport } from '@baustatik/viewport-2d';

import { loadSpecs } from './loads';
import { modelSpecs } from './model';
import { resultSpecs } from './results';
import { DEFAULT_STYLE, type FEMStyle } from './style';

export { type FEMStyle } from './style';

// EIN Optionsobjekt statt Positionsparametern: sonst stuenden drei
// `readonly X[]` in Folge nebeneinander, und ein vertauschtes Paar faellt an
// keiner Typgrenze auf.
export interface FEMSceneOptions {
  readonly nodes: readonly Node[];
  readonly beams: readonly Beam[];
  readonly supports: readonly NodeSupport[];
  readonly loads: readonly FEMLoad[];
  /**
   * Die Auflagerkraefte eines gerechneten Lastfalls, direkt aus
   * `SolveResult.reactions`. Weggelassen = noch nicht gerechnet, und dann steht
   * kein Ergebnis im Bild.
   */
  readonly reactions?: ReadonlyMap<string, SupportReaction>;
  readonly viewport: Viewport;
  readonly style?: FEMStyle;
}

export function femSpecs(options: FEMSceneOptions): readonly Spec[] {
  const {
    nodes,
    beams,
    supports,
    loads,
    reactions,
    viewport: vp,
    style,
  } = options;

  // EINMAL aufgeloest und an alle Teile durchgereicht: sonst haetten Modell,
  // Lasten und Ergebnisse je eigene Vorgaben, und ein Aufrufer-Override wirkte
  // nur auf einem Drittel.
  const resolved = { ...DEFAULT_STYLE, ...style };

  // Lasten vor Ergebnissen, passend zur Bandreihenfolge — die z-Order
  // garantieren aber die Baender aus `FEM_LAYERS`, nicht diese Reihenfolge.
  return [
    ...modelSpecs({ nodes, beams, supports, viewport: vp, style: resolved }),
    ...loadSpecs({ nodes, beams, loads, viewport: vp, style: resolved }),
    ...resultSpecs({ nodes, reactions, viewport: vp, style: resolved }),
  ];
}
