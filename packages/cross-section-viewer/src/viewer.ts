import type { SectionGeometry, Wall } from '@baustatik/cross-section';
import { type GridOptions, gridSpecs } from '@baustatik/grid-2d';
import type { RenderDriver, Spec } from '@baustatik/render-core';
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
  /**
   * PULL der Rohdaten aus dem Store — jetzt der GANZE Querschnitt statt einer
   * Liste lageloser Segmente
   * ([ADR 0030](../../../docs/adr/0030-the-section-editor-stores-a-wall-graph.md)).
   *
   * Der Vorgaenger `getSegments()` gab `Segment[]` heraus, einen Typ, den in
   * `src/` nie jemand konstruiert hat: der Viewer war sein einziger Verbraucher
   * und bekam ihn von aussen hereingereicht. Mit `SectionGeometry` liest er
   * dasselbe, was gespeichert wird.
   */
  getGeometry: () => SectionGeometry;
  getScreenSize: () => Size; // PULL wie getGeometry — resize-faehig
  grid?: GridOptions; // weggelassen = kein Grid
  initialViewport?: Viewport;
}

export function createCrossSectionViewer(config: ViewerConfig) {
  const { driver, getGeometry } = config;
  const STROKE_SCALE = 1; // OPTIK: konstante Strichbreite am Schirm (px, zoomt nicht mit)
  const OUTLINE_STROKE = 1; // px — die Umrisslinie ist eine KANTE, keine Wand

  let vp: Viewport = config.initialViewport ?? viewport(screenPoint(0, 0), 1);

  /**
   * Die Zeichen-Specs des Querschnitts.
   *
   * ZWEI LAGEN, ZWEI QUELLEN, und die Trennung ist die Aussage von ADR 0030:
   *
   *   Der UMRISS kommt fertig aus dem Satz. Er ist bereits diskretisiert, traegt
   *   die Rundungen und stimmt mit den Zahlen ueberein, aus denen `A`, `Iy` und
   *   `Iz` fallen — genau dafuer reist er mit. Der Viewer rechnet ihn nicht
   *   nach; taete er es, gaebe es zwei Umrisse und einen Streit darueber,
   *   welcher gilt.
   *
   *   Die WANDMITTELLINIEN kommen aus `nodes`/`walls` und tragen ihre Dicke als
   *   Strichbreite. Sie sind die Eingabe, nicht das Ergebnis.
   *
   * EINE BOGENWAND WIRD NICHT ALS MITTELLINIE GEZEICHNET. `bulge` in einen
   * `Arc` umzurechnen ist die Aufgabe von P1, und sie darf nicht zweimal
   * geschrieben werden — die Kruemmung steht bis dahin sichtbar im Umriss. Ihre
   * SEHNE zu zeichnen waere die schlechtere Antwort: eine Linie, die es nicht
   * gibt, ununterscheidbar von einer, die es gibt.
   */
  function sectionSpecs(geometry: SectionGeometry): Spec[] {
    const specs: Spec[] = geometry.outline
      // Ein Polygon unter drei Punkten traegt keine Flaeche, und `render-core`
      // weist es zu Recht zurueck. Das Gatter laesst es trotzdem durch: es
      // fehlt erst, wenn KEIN Polygon traegt — waehrend der Eingabe ist ein
      // halb gezogener Ring der Normalfall. Dieselbe Haltung wie bei den
      // Waenden: wer ein unfertiges Modell zeichnet, soll den Rest davon sehen.
      .filter((polygon) => polygon.points.length >= 3)
      .map((polygon, index) => ({
        kind: 'polygon',
        id: `outline-${index}`,
        layer: 'section',
        closed: true,
        // EINZIGE Stelle des y/z -> u/v Mappings.
        points: polygon.points.map((p) => worldPoint(p.y, p.z)),
        strokeWidth: OUTLINE_STROKE,
        strokeColor: '#000',
      }));

    if (geometry.kind === 'outline') return specs;

    const byId = new Map(geometry.nodes.map((node) => [node.id, node]));
    for (const wall of geometry.walls) {
      const spec = wallSpec(wall, byId);
      if (spec !== undefined) specs.push(spec);
    }
    return specs;
  }

  /** Eine gerade Wand als Mittellinie. `undefined` heisst „hier nicht". */
  function wallSpec(
    wall: Wall,
    byId: ReadonlyMap<string, { y: number; z: number }>,
  ): Spec | undefined {
    if ((wall.bulge ?? 0) !== 0) return undefined;
    const start = byId.get(wall.startNodeId);
    const end = byId.get(wall.endNodeId);
    // Ein haengender Verweis ist ein Befund des Gatters
    // (`UnknownSectionNodeError`), kein Wurf im Zeichenweg: wer ein kaputtes
    // Modell zeichnet, soll den Rest davon sehen.
    if (start === undefined || end === undefined) return undefined;

    // `from`/`to` sind hier die Enden der ZEICHENSTRECKE (`Spec`), nicht die
    // Knotenverweise der Wand — die heissen `startNodeId`/`endNodeId`.
    return {
      kind: 'line',
      id: wall.id,
      layer: 'section',
      from: worldPoint(start.y, start.z),
      to: worldPoint(end.y, end.z),
      // t ist PHYSIK (die Wandstaerke), nicht die Strichbreite am Schirm —
      // deshalb skaliert sie mit dem Viewport und die Umrisslinie nicht.
      strokeWidth: wall.t * vp.scale * STROKE_SCALE,
      strokeColor: '#000',
    };
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
    driver.reconcile([...grid, ...sectionSpecs(getGeometry())]);
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
