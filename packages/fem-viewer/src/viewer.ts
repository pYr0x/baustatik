import type { Beam, Node, NodeSupport } from '@baustatik/fem';
import type { FEMLoad } from '@baustatik/fem-loads';
import type { SolveResult } from '@baustatik/fem-solver';
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

import type { DiagramOptions } from './results';
import { type FEMStyle, femSpecs } from './scene';

interface ViewerConfig {
  driver: RenderDriver; // injiziert — kein Konva hier
  getNodes: () => readonly Node[]; // PULL der Rohdaten aus dem Store
  getBeams: () => readonly Beam[]; // PULL der Rohdaten aus dem Store
  getSupports: () => readonly NodeSupport[]; // PULL der Rohdaten aus dem Store
  getLoads: () => readonly FEMLoad[]; // PULL der Rohdaten aus dem Store
  // PULL wie die Rohdaten, aber aus dem ERGEBNIS: `undefined` heisst „noch nicht
  // gerechnet". Der Aufrufer verwirft sein Ergebnis bei jeder Modelaenderung,
  // und das Bild folgt ihm, ohne dass hier ein zweiter Zustand mitlaeuft.
  //
  // DAS GANZE ERGEBNIS und nicht nur die Reaktionen: aus ihm kommen auch die
  // Verlaeufe, und zwei Pulls fuer dieselbe Rechnung koennten auseinanderlaufen.
  getResult?: () => SolveResult | undefined;
  // WELCHE Schnittgroessen sichtbar sind, und wie hoch. Weggelassen = keine
  // Verlaeufe. Ein PULL und keine Konstruktor-Option, weil im Viewer nur der
  // Viewport Zustand ist — dieselbe Bauart wie `cross-section-viewer` mit
  // `getProperties`/`getStressPoints`/`getFEMesh`.
  getDiagrams?: () => DiagramOptions | undefined;
  getScreenSize: () => Size; // PULL wie die Rohdaten — resize-faehig
  grid?: GridOptions; // weggelassen = kein Grid
  initialViewport?: Viewport;
  style?: FEMStyle; // weggelassen = schwarze Staebe, rote Knoten
}

export function createFEMViewer(config: ViewerConfig) {
  const {
    driver,
    getNodes,
    getBeams,
    getSupports,
    getLoads,
    getResult,
    getDiagrams,
  } = config;

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
      ...femSpecs({
        nodes: getNodes(),
        beams: getBeams(),
        supports: getSupports(),
        loads: getLoads(),
        result: getResult?.(),
        diagrams: getDiagrams?.(),
        viewport: vp,
        style: config.style,
      }),
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
