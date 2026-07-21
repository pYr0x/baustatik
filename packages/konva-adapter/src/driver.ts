import type { RenderDriver, Spec } from '@baustatik/render-core';
import type { Viewport } from '@baustatik/viewport-2d';
import Konva from 'konva';
import { createBands } from './bands';
import { attachInteraction } from './interaction';
import { createReconciler } from './reconcile';

export interface KonvaDriverConfig {
  container: HTMLDivElement;
  width: number;
  height: number;
  // Zeichenbaender in Malreihenfolge — hinten = oben. Weggelassen = ein
  // einziges implizites Band, spec.layer wird dann ignoriert.
  layers?: readonly string[];
}

// Komponiert die Bausteine (Baender, Reconciler, Interaktion) zu einem
// RenderDriver. Einzige oeffentliche Einstiegsfunktion des Packages.
export function createKonvaAdapter(config: KonvaDriverConfig): RenderDriver {
  const stage = new Konva.Stage({
    container: config.container,
    width: config.width,
    height: config.height,
  });
  const layer = new Konva.Layer();
  stage.add(layer);

  const bands = createBands(layer, config.layers ?? []);
  const reconciler = createReconciler(bands);
  const interaction = attachInteraction(stage);

  return {
    applyViewport(vp: Viewport) {
      stage.scale({ x: vp.scale, y: vp.scale });
      stage.position({ x: vp.origin.x, y: vp.origin.y });
    },

    onViewIntent(handler) {
      interaction.onViewIntent(handler);
    },

    reconcile(specs: readonly Spec[]) {
      reconciler.reconcile(specs);
    },

    flush() {
      layer.batchDraw();
    },

    destroy() {
      stage.destroy();
    },
  };
}
