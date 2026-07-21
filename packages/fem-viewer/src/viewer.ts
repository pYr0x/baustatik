import type { Beam, Node, NodeSupport } from '@baustatik/fem';
import { type GridOptions, gridSpecs } from '@baustatik/grid-2d';
import type { RenderDriver } from '@baustatik/render-core';
import {
  pan,
  type Size,
  screenPoint,
  type Viewport,
  viewport,
  zoomAround,
} from '@baustatik/viewport-2d';

import { type FEMStyle, femSpecs } from './scene';

interface ViewerConfig {
  driver: RenderDriver; // injiziert — kein Konva hier
  getNodes: () => readonly Node[]; // PULL der Rohdaten aus dem Store
  getBeams: () => readonly Beam[]; // PULL der Rohdaten aus dem Store
  getSupports: () => readonly NodeSupport[]; // PULL der Rohdaten aus dem Store
  getScreenSize: () => Size; // PULL wie die Rohdaten — resize-faehig
  grid?: GridOptions; // weggelassen = kein Grid
  initialViewport?: Viewport;
  style?: FEMStyle; // weggelassen = schwarze Staebe, rote Knoten
}

export function createFEMViewer(config: ViewerConfig) {
  const { driver, getNodes, getBeams, getSupports } = config;

  let vp: Viewport = config.initialViewport ?? viewport(screenPoint(0, 0), 1);

  function draw() {
    driver.applyViewport(vp);
    // Grid zuerst im Array, damit die Reihenfolge lesbar der Bandreihenfolge
    // folgt. Verlassen duerfen wir uns darauf nicht — die z-Order garantieren
    // die Baender aus FEM_LAYERS, die der Driver beim Aufbau bekommt.
    const grid = config.grid
      ? gridSpecs(vp, config.getScreenSize(), config.grid)
      : [];
    driver.reconcile([
      ...grid,
      ...femSpecs(getNodes(), getBeams(), getSupports(), vp, config.style),
    ]);
    driver.flush();
  }

  // Kreis schliesst sich intern: Intent -> neuer Viewport -> neu zeichnen.
  driver.onViewIntent((intent) => {
    switch (intent.type) {
      case 'pan':
        vp = pan(vp, intent.dx, intent.dy);
        break;
      case 'zoom':
        vp = zoomAround(vp, intent.pointer, intent.factor);
        break;
      case 'reset':
        vp = config.initialViewport ?? viewport(screenPoint(0, 0), 1);
        break;
      case 'fit':
        // todo: Bounding-Box aller Knoten -> Viewport
        break;
    }
    draw();
  });

  return {
    requestRender: draw,
    destroy: () => driver.destroy(),
  };
}
