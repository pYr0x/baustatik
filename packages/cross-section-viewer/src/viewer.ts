import type {
  SectionGeometry,
  SectionPolicy,
  SectionProperties,
  StressPoint,
} from '@baustatik/cross-section';
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

import type { CrossSectionFEMesh } from './fe';
import { crossSectionSpecs } from './scene';
import type { CrossSectionStyle } from './style';

interface ViewerConfig {
  driver: RenderDriver; // injiziert — kein Konva hier
  /**
   * PULL der Rohdaten aus dem Store — der GANZE Querschnitt
   * ([ADR 0030](../../../docs/adr/0030-the-section-editor-stores-a-wall-graph.md)).
   *
   * Der Vorgaenger `getSegments()` gab `Segment[]` heraus, einen Typ, den in
   * `src/` nie jemand konstruiert hat: der Viewer war sein einziger Verbraucher
   * und bekam ihn von aussen hereingereicht. Mit `SectionGeometry` liest er
   * dasselbe, was gespeichert wird.
   */
  getGeometry: () => SectionGeometry;
  /**
   * PULL der Erzeugungs-Einstellung, aus demselben Store wie `getGeometry`
   * ([ADR 0033](../../../docs/adr/0033-the-cross-section-has-a-creation-policy.md)).
   *
   * ZWEITER PULL UND KEINE MODULKONSTANTE: `arcTolerance` entscheidet mit,
   * welche Kante ueberhaupt als Bogen gezeichnet wird, und sie steht seit
   * `schemaVersion: 7` im SELBEN Satz wie der Umriss, den der Viewer daneben
   * zeichnet. Ein OPTIONALER Pull liesse die stille Abweichung nur
   * unauffaelliger bestehen.
   */
  getSectionPolicy: () => SectionPolicy;
  /**
   * PULLS DER ERGEBNISSE. `undefined` heisst „noch nicht gerechnet", und ein
   * WEGGELASSENER Pull ist derselbe Aus-Zustand — es gibt keinen zusaetzlichen
   * Sichtbarkeitsschalter, der neben der Ergebnisexistenz veralten koennte.
   *
   * Der Aufrufer verwirft sein Ergebnis bei jeder Geometrie- oder
   * Policy-Aenderung, und das Bild folgt ihm, ohne dass hier ein zweiter
   * Zustand mitlaeuft (Muster der Auflagerkraefte im FEM-Viewer; fuer das Netz
   * ausserdem [ADR 0039](../../../docs/adr/0039-meshing-is-a-transient-worker-capability.md)).
   */
  getProperties?: () => SectionProperties | undefined;
  getStressPoints?: () => readonly StressPoint[] | undefined;
  getFEMesh?: () => CrossSectionFEMesh | undefined;
  getScreenSize: () => Size; // PULL wie getGeometry — resize-faehig
  grid?: GridOptions; // weggelassen = kein Grid
  initialViewport?: Viewport;
  style?: CrossSectionStyle; // weggelassen = schwarze Waende, oranger Umriss
}

/**
 * Der Viewer haelt NUR den Viewport.
 *
 * Er kennt keinen `SectionGeometry`-Einzelteil und kein Render-Primitive mehr:
 * er zieht Daten, aktualisiert die Kamera, stellt das Grid voran und reicht die
 * Szene an den `RenderDriver` weiter. Was gezeichnet wird, steht in `scene.ts`
 * und den vier Lagen darunter.
 */
export function createCrossSectionViewer(config: ViewerConfig) {
  const { driver, getGeometry, getSectionPolicy } = config;

  let vp: Viewport = config.initialViewport ?? viewport(screenPoint(0, 0), 1);

  function draw() {
    driver.applyViewport(vp);
    // Grid zuerst im Array, damit die Reihenfolge lesbar der Bandreihenfolge
    // folgt. Die z-Order GARANTIEREN aber die Baender aus CROSS_SECTION_LAYERS,
    // die der Driver beim Aufbau bekommt — ohne sie landen beim Zoom-Out neu
    // gebaute Gridlinien ueber dem Querschnitt.
    const grid = config.grid
      ? gridSpecs(vp, config.getScreenSize(), config.grid)
      : [];
    // JEDER PULL GENAU EINMAL JE FRAME: ein zweiter Aufruf koennte einen
    // anderen Wert liefern, und dann zeigte ein Bild zwei Rechenstaende.
    driver.reconcile([
      ...grid,
      ...crossSectionSpecs({
        geometry: getGeometry(),
        sectionPolicy: getSectionPolicy(),
        viewport: vp,
        properties: config.getProperties?.(),
        stressPoints: config.getStressPoints?.(),
        feMesh: config.getFEMesh?.(),
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
        // todo: Bounding-Box des Umrisses -> Viewport
        break;
    }
    draw();
  });

  return {
    requestRender: draw,
    destroy: () => driver.destroy(),
  };
}
