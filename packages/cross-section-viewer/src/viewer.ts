import type {
  SectionGeometry,
  SectionPolicy,
  Wall,
} from '@baustatik/cross-section';
import { type GridOptions, gridSpecs } from '@baustatik/grid-2d';
import type { RenderDriver, Spec } from '@baustatik/render-core';
import { Bulge, Point, type PointType } from '@baustatik/section-geometry';
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
  /**
   * PULL der Erzeugungs-Einstellung, aus demselben Store wie `getGeometry`
   * ([ADR 0033](../../../docs/adr/0033-the-cross-section-has-a-creation-policy.md)).
   *
   * ZWEITER PULL UND KEINE MODULKONSTANTE: `arcTolerance` entscheidet mit,
   * welche Kante ueberhaupt als Bogen gezeichnet wird, und sie steht seit
   * `schemaVersion: 7` im SELBEN Satz wie der Umriss, den der Viewer daneben
   * zeichnet. Eine Konstante hier zoege die Toleranz aus einer anderen Quelle
   * als den Satz; ein OPTIONALER Pull liesse die stille Abweichung nur
   * unauffaelliger bestehen.
   */
  getSectionPolicy: () => SectionPolicy;
  getScreenSize: () => Size; // PULL wie getGeometry — resize-faehig
  grid?: GridOptions; // weggelassen = kein Grid
  initialViewport?: Viewport;
}

export function createCrossSectionViewer(config: ViewerConfig) {
  const { driver, getGeometry, getSectionPolicy } = config;
  const STROKE_SCALE = 1; // OPTIK: konstante Strichbreite am Schirm (px, zoomt nicht mit)
  const OUTLINE_STROKE = 2; // px — die Umrisslinie ist eine KANTE, keine Wand
  /**
   * Der Umriss ist ORANGE, die Wände schwarz — und das ist eine Aussage des
   * VIEWERS, kein Geschmack
   * ([ADR 0037](../../../docs/adr/0037-the-outline-comes-from-inflating-wall-runs.md)).
   *
   * Der Umriss ist ABGELEITET, die Wände sind die EINGABE. Wer eine Kerbe am
   * Grad-3-Knoten oder einen gekappten Miter-Spitz sehen will, muss die beiden
   * Lagen unterscheiden können — in Schwarz auf Schwarz sieht man genau das
   * nicht.
   *
   * MODULKONSTANTE UND KEINE OPTION AM AUFRUF: dass das eine abgeleitet und das
   * andere Eingabe ist, weiss der Viewer und nicht der Aufrufer. Eine Farbe ist
   * ausserdem noch nicht der Anlass für eine View-Policy — ein
   * `crossSectionStyle` steht in `packages/TODO.md` §2 als erster benannter
   * Anwärter, fällig mit Auswahl und Fangpunkten (P7).
   */
  const OUTLINE_COLOR = '#e8830c';
  /** Die Wandmittellinie: die EINGABE, und damit die neutrale Farbe. */
  const WALL_COLOR = '#000';

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
   * EINE BOGENWAND WIRD JETZT MITGEZEICHNET (P1). Bis P0 gab `wallSpec` fuer
   * sie `undefined` zurueck, weil `bulge` in einen `Arc` umzurechnen nicht
   * zweimal geschrieben werden durfte; seit `Bulge` in
   * `@baustatik/section-geometry` steht, gibt es die Umrechnung an einer
   * Stelle. Ihre SEHNE zu zeichnen waere weiterhin die schlechtere Antwort:
   * eine Linie, die es nicht gibt, ununterscheidbar von einer, die es gibt.
   */
  function sectionSpecs(geometry: SectionGeometry): Spec[] {
    const specs: Spec[] = geometry.outline
      // Ein Polygon unter drei Punkten traegt keine Flaeche, und `render-core`
      // weist es zu Recht zurueck. Das Gate laesst es trotzdem durch: es
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
        strokeColor: OUTLINE_COLOR,
      }));

    if (geometry.kind === 'outline') return specs;

    const byId = new Map(geometry.nodes.map((node) => [node.id, node]));
    for (const wall of geometry.walls) {
      const spec = wallSpec(wall, byId);
      if (spec !== undefined) specs.push(spec);
    }
    return specs;
  }

  /**
   * Eine Wand als Mittellinie — gerade als `line`, gebogen als `arcPath`.
   *
   * `undefined` heisst „hier nicht": ein haengender Verweis ist ein Befund des
   * Gates (`UnknownSectionNodeError`), kein Wurf im Zeichenweg. Wer ein
   * kaputtes Modell zeichnet, soll den Rest davon sehen.
   *
   * EIN STRICH DER DICKE `t` AUF EINEM BOGEN **IST** DIE WAND. `arcPath` hat
   * keine Fuellung (`render-core/src/specs.ts` trennt ihn deshalb vom
   * Ringsegment), und das ist fuer eine Mittellinie genau richtig.
   *
   * DIE VORZEICHEN TRAGEN OHNE UMRECHNUNG DURCH, und das ist die eine Stelle,
   * an der drei Drehsinne aufeinandertreffen: `bulge` -> `Arc.sweep` (positiv
   * `+y → +z`, ADR 0031) -> `ArcPathSpec.sweepAngle` (positiv `+u → +v`). Das
   * Mapping dazwischen ist `worldPoint(y, z)`, also die Identitaet. Gepinnt in
   * `tests/node/cross-section.test.ts` — argumentiert reichte hier nicht.
   */
  function wallSpec(
    wall: Wall,
    byId: ReadonlyMap<string, { y: number; z: number }>,
  ): Spec | undefined {
    const start = byId.get(wall.startNodeId);
    const end = byId.get(wall.endNodeId);
    if (start === undefined || end === undefined) return undefined;

    const bulge = wall.bulge ?? 0;
    // t ist PHYSIK (die Wandstaerke), nicht die Strichbreite am Schirm —
    // deshalb skaliert sie mit dem Viewport und die Umrisslinie nicht.
    const strokeWidth = wall.t * vp.scale * STROKE_SCALE;
    const p1 = Point.make(start.y, start.z);
    const p2 = Point.make(end.y, end.z);
    const arcTolerance = getSectionPolicy().arcTolerance;

    if (drawsAsArc(p1, p2, bulge, arcTolerance)) {
      const arc = Bulge.toArc(p1, p2, bulge, arcTolerance);
      return {
        kind: 'arcPath',
        id: wall.id,
        layer: 'section',
        center: worldPoint(arc.center.y, arc.center.z),
        radius: arc.radius,
        startAngle: arc.startAngle,
        sweepAngle: arc.sweep,
        strokeWidth,
        strokeColor: WALL_COLOR,
      };
    }

    // `from`/`to` sind hier die Enden der ZEICHENSTRECKE (`Spec`), nicht die
    // Knotenverweise der Wand — die heissen `startNodeId`/`endNodeId`.
    return {
      kind: 'line',
      id: wall.id,
      layer: 'section',
      from: worldPoint(start.y, start.z),
      to: worldPoint(end.y, end.z),
      strokeWidth,
      strokeColor: WALL_COLOR,
    };
  }

  /**
   * Ob diese Kante als Bogen gezeichnet wird — und DER ZEICHENWEG WIRFT NICHT.
   *
   * Das ist keine Vorsicht, sondern die Regel dieses Moduls: ein kaputtes Modell
   * soll man SEHEN. Ein Wurf hier loeschte Grid, Umriss und jede andere Wand
   * gleich mit, und weil `draw()` auch aus `onViewIntent` laeuft, braeche er
   * mitten im Pan ab.
   *
   * DREI FAELLE FALLEN DESHALB AUF DIE SEHNE ZURUECK:
   *
   *   `bulge === 0`           — die gerade Wand, der Regelfall.
   *   `bulge` nicht endlich   — `Bulge.toArc` wuerfe `InvalidArcError`.
   *                             `NaN` kaeme sogar durch beide Vorpruefungen:
   *                             `NaN !== 0` ist wahr und `NaN <= tolerance`
   *                             falsch, die Kante gaelte also als Bogen.
   *   `|Δ| >= 2π`             — `ArcPathSpec` verlangt `|sweepAngle| < 2π`
   *                             (`render-core/src/specs.ts`), und ab
   *                             `|bulge| ~ 1.6e16` rundet `4·atan(bulge)` genau
   *                             auf `2π`. Der Adapter wiese die Spec zurueck.
   *
   * DAS GATE PRUEFT `bulge` HEUTE NICHT — G1 bis G6 sehen Umriss, doppelte
   * Ids, haengende Verweise, `t > 0`, Nulllaenge und Knick, aber nie die
   * Woelbung selbst; die Knickwarnung rechnet bei `NaN` still `notch = NaN` und
   * schweigt. Beides kann also aus einem Store kommen, ohne dass irgendwer es
   * gemeldet haette. Solange das so ist, faengt es der Zeichenweg ab.
   */
  function drawsAsArc(
    p1: PointType,
    p2: PointType,
    bulge: number,
    arcTolerance: number,
  ): boolean {
    if (bulge === 0 || !Number.isFinite(bulge)) return false;
    if (Math.abs(Bulge.sweep(bulge)) >= 2 * Math.PI) return false;
    // DIESELBE SCHRANKE WIE ANDERSWO: was `Bulge` als Gerade liest, zeichnet
    // der Viewer als Gerade. Ein eigenes Epsilon hier gaebe eine Kante, die
    // gerade gerechnet und krumm gezeichnet wird.
    return !Bulge.isStraight(Point.distance(p1, p2), bulge, arcTolerance);
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
