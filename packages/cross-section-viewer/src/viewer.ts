import type { Segment } from '@baustatik/cross-section';
import { type GridOptions, gridSpecs } from '@baustatik/grid-2d';
import type { RenderDriver, Spec } from '@baustatik/render-core';
import { Arc } from '@baustatik/section-geometry';
import {
  pan,
  type Size,
  screenPoint,
  type Viewport,
  viewport,
  worldPoint,
  zoomAround,
} from '@baustatik/viewport-2d';

interface ViewerConfig {
  driver: RenderDriver; // injiziert — kein Konva hier
  getSegments: () => readonly Segment[]; // PULL der Rohdaten aus dem Store
  getScreenSize: () => Size; // PULL wie getSegments — resize-faehig
  grid?: GridOptions; // weggelassen = kein Grid
  initialViewport?: Viewport;
  arcSegments?: number; // Aufloesung der Bogen-Diskretisierung
}

export function createCrossSectionViewer(config: ViewerConfig) {
  const { driver, getSegments } = config;
  const arcSegments = config.arcSegments ?? 24;
  const STROKE_SCALE = 1; // OPTIK: konstante Strichbreite am Schirm (px, zoomt nicht mit)

  let vp: Viewport = config.initialViewport ?? viewport(screenPoint(0, 0), 1);

  // Rohdaten -> umwandeln in Zeichen-Spec
  function toSpec(seg: Segment): Spec {
    if (seg.geometry === 'line') {
      return {
        kind: 'line',
        id: seg.id,
        layer: 'section',
        // EINZIGE Stelle des y/z -> u/v Mappings.
        from: worldPoint(seg.start.y, seg.start.z),
        to: worldPoint(seg.end.y, seg.end.z),
        strokeWidth: seg.thickness * vp.scale * STROKE_SCALE,
        strokeColor: '#000',
      };
    }
    // // Bogen: section-geometry rechnet die Punkte aus, wir zeichnen eine offene Polylinie.
    // const arc = Arc.make(
    //   { y: seg.center.y, z: seg.center.z },
    //   seg.radius,
    //   seg.startAngle,
    //   seg.sweep,
    // );
    // const pts = Arc.toPolyline(arc, { segments: arcSegments });
    // return {
    //   kind: 'polygon',
    //   id: seg.id,
    //   closed: false,
    //   points: pts.map((p) => worldPoint(p.y, p.z)),
    //   strokeWidth: seg.thickness * vp.scale * STROKE_SCALE,
    //   strokeColor: '#000',
    // };
    throw new Error(
      `Segment-Geometrie noch nicht unterstuetzt: ${seg.geometry}`,
    );
  }

  function draw() {
    driver.applyViewport(vp);
    // Grid zuerst im Array, damit die Reihenfolge lesbar der Bandreihenfolge
    // folgt. Die z-Order GARANTIEREN aber die Baender aus CROSS_SECTION_LAYERS,
    // die der Driver beim Aufbau bekommt — ohne sie landen beim Zoom-Out neu
    // gebaute Gridlinien ueber dem Querschnitt.
    const grid = config.grid
      ? gridSpecs(vp, config.getScreenSize(), config.grid)
      : [];
    driver.reconcile([...grid, ...getSegments().map(toSpec)]);
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
        // todo: Bounding-Box aller Segmente -> Viewport
        break;
    }
    draw();
  });

  return {
    requestRender: draw,
    destroy: () => driver.destroy(),
  };
}
