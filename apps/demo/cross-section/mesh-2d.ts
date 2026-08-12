import {
  type CrossSection,
  createSectionGeometry,
  DEFAULT_SECTION_POLICY,
  type Ring,
  type SectionProperties as SectionValues,
  sectionProperties as sectionValues,
  type Vertex,
} from '@baustatik/cross-section';
import {
  CROSS_SECTION_LAYERS,
  type CrossSectionFEMesh,
  createCrossSectionViewer,
} from '@baustatik/cross-section-viewer';
import { createKonvaAdapter as createKonvaDriver } from '@baustatik/konva-adapter';
import type { Mesh2DInput, Mesh2DResult, Mesh2DSwitches } from '@baustatik/mesh-2d-wasm';
import { screenPoint, viewport } from '@baustatik/viewport-2d';
import { generateMesh2D } from './mesh-2d-port';

// ---------------------------------------------------------------------------
// ZWEI BILDER DERSELBEN FIGUR, und das ist der Inhalt dieser Seite.
//
// LINKS der SVG-Prüfstand: er zeichnet, was der Mesher liefert — gefüllte
// Dreiecke und den Rand aus `boundarySegments`. Er kennt keinen Querschnitt,
// nur Punkte und Elemente, und genau deshalb ist er der ehrliche Blick auf das
// Ergebnis von Triangle.
//
// RECHTS derselbe Querschnitt im `cross-section-viewer`: der orange Umriss
// kommt aus dem SATZ (`SectionGeometry.outline`, ADR 0030), das
// hellockerfarbene Drahtgitter aus dem NETZ, und der rote Punkt ist der
// Schwerpunkt aus der Green-Rechnung. Das Netz ist dort ein TRANSIENTES
// Ergebnis (ADR 0039): der Viewer erzeugt es nicht, er bekommt es über
// `getFEMesh` gereicht und zeigt nichts, solange keines da ist.
//
// DER VERGLEICH IST DER ZWECK. Umriss und Netzrand müssen aufeinanderliegen —
// sie kommen aus derselben Ringeingabe, aber über zwei ganz verschiedene Wege.
// Und der rote Schwerpunkt (Green über den Umriss) muss dort sitzen, wo die
// Zahl im Ausdruck steht (Integration über die Dreiecke).
//
// BEIDE BILDER LAUFEN IN DIESELBE RICHTUNG, und das musste hergestellt werden:
// das SVG drehte die y-Achse nach oben, wie es ein generischer Mesh-Betrachter
// tut. Auf dieser Seite sind die Ringe aber ein Querschnitt, und in seiner
// Ebene wächst `z` nach unten (ADR 0031).
//
// DER UMRISS HÄTTE DIE SPIEGELUNG UNBEMERKT ÜBERSTANDEN — die Figur ist
// doppelt symmetrisch. Die Triangulierung ist es nicht: gespiegelt zeigten
// zwei Bilder desselben Netzes zwei verschiedene Muster, und der Vergleich,
// für den die Seite existiert, wäre nicht zu führen gewesen.
//
// Die verbleibenden Unterschiede sind DARSTELLUNG und beabsichtigt: links
// gefüllte Dreiecke mit einem Strich in Welteinheiten, rechts ein reines
// Drahtgitter aus Eckkanten mit screen-konstanter Strichbreite.
// ---------------------------------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';

const generate = element<HTMLButtonElement>('generate');
const output = element<HTMLPreElement>('output');
const tri6Svg = element<SVGSVGElement>('mesh-tri6');
const viewerContainer = element<HTMLDivElement>('viewer');
const maxElementAreaInput = element<HTMLInputElement>('max-area');
const qualityInput = element<HTMLInputElement>('quality');
const qualityValue = element<HTMLOutputElement>('quality-value');
const steinerInput = element<HTMLInputElement>('steiner');
const ccdtInput = element<HTMLInputElement>('ccdt');
const jettisonInput = element<HTMLInputElement>('jettison');
const quietInput = element<HTMLInputElement>('quiet');

/**
 * Die Figur — EINE Quelle für beide Bilder, als flache Koordinatenpaare.
 *
 * Rechteck 200 × 300 mm mit einem mittigen Loch 60 × 120 mm; die Flächensumme
 * muss 52.800 mm² ergeben.
 */
const OUTER = [0, 0, 200, 0, 200, 300, 0, 300];
const HOLE = [70, 90, 130, 90, 130, 210, 70, 210];

const rings: Mesh2DInput['rings'] = [
  { kind: 'material', coordinates: new Float64Array(OUTER) },
  { kind: 'hole', coordinates: new Float64Array(HOLE) },
];

/**
 * Dieselben Ringe als Querschnittseingabe — und der Umlaufsinn trägt hier
 * BEDEUTUNG.
 *
 * Beim Mesher sagt `kind: 'hole'`, was ein Loch ist; die Wicklung ist ihm egal.
 * In `SectionGeometry` sagt es das VORZEICHEN der Fläche: `signedArea > 0` ist
 * Material, `< 0` ein Loch (ADR 0034). Beide Ringe oben laufen gleich herum —
 * das Loch wird deshalb umgedreht, sonst zählte Green es als zweite Fläche
 * hinzu statt es abzuziehen.
 *
 * `createSectionGeometry` leitet den Umriss unter derselben Policy ab, die
 * daneben gespeichert würde (ADR 0033). Für `kind: 'outline'` heisst das nur:
 * die Bögen in Sehnen zerlegen — hier gibt es keine.
 */
const geometry = createSectionGeometry(
  { kind: 'outline', rings: [ring(OUTER, 'material'), ring(HOLE, 'hole')] },
  DEFAULT_SECTION_POLICY,
);

const section: CrossSection = { kind: 'section-geometry', id: 'mesh-2d', geometry };

/**
 * Das Netz und die Querschnittswerte — TRANSIENT, neben dem Satz und nicht in
 * ihm (ADR 0039).
 *
 * Beide werden vor jedem Lauf verworfen: ein Netz, das zu anderen Einstellungen
 * gehört, wäre eine Behauptung über die gerade gezeigte Figur. Der Viewer zieht
 * sie und zeigt nichts, solange nichts da ist.
 */
let feMesh: CrossSectionFEMesh | undefined;
let values: SectionValues | undefined;

generate.addEventListener('click', () => void mesh());
qualityInput.addEventListener('input', () => {
  qualityValue.textContent = qualityInput.value;
});

async function mesh(): Promise<void> {
  generate.disabled = true;
  output.textContent = 'Worker initialisiert Triangle …';
  tri6Svg.replaceChildren();
  feMesh = undefined;
  values = undefined;
  viewer.requestRender();
  try {
    const maxElementArea = readMaxElementArea();
    const switches = readSwitches();
    const result = await generateMesh2D({ rings, element: 'tri6', maxElementArea, switches });
    const properties = sectionProperties(result);
    output.textContent = summary(result, maxElementArea, switches, properties);
    renderMesh(result, tri6Svg);

    // `Mesh2DResult` passt ohne Umformung in `CrossSectionFEMesh`: der Viewer
    // will Punkte und Elemente, alles Weitere (Marker, `boundarySegments`)
    // gehört der Rechnung. Deshalb hat er auch keine Abhaengigkeit auf den
    // Mesher.
    feMesh = result;
    // Der rote Punkt kommt aus GREEN über den Umriss, die Zahl im Ausdruck aus
    // der Integration über die Dreiecke. Zwei Wege, ein Ort — das ist die
    // Probe, die diese Seite sichtbar macht.
    values = sectionValues(section);
    viewer.requestRender();
  } catch (error) {
    output.textContent = error instanceof Error ? error.message : String(error);
    viewer.requestRender();
  } finally {
    generate.disabled = false;
  }
}

/** Ein flacher Koordinatenpuffer als `Ring`, im verlangten Umlaufsinn. */
function ring(coordinates: readonly number[], sense: 'material' | 'hole'): Ring {
  const vertices: Vertex[] = [];
  for (let offset = 0; offset < coordinates.length; offset += 2) {
    const y = coordinates[offset];
    const z = coordinates[offset + 1];
    if (y === undefined || z === undefined) continue;
    vertices.push({ y, z });
  }
  return { vertices: sense === 'hole' ? vertices.reverse() : vertices };
}

function readMaxElementArea(): number {
  const value = Number(maxElementAreaInput.value);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('maxElementArea muss endlich und größer als 0 sein.');
  }
  return value;
}

function readSwitches(): Mesh2DSwitches | undefined {
  const switches: {
    quality?: boolean | number;
    ccdt?: boolean;
    jettison?: boolean;
    steiner?: number;
    quiet?: boolean;
  } = {};
  switches.quality = Number(qualityInput.value);
  const steiner = steinerInput.value.trim();
  if (steiner !== '') {
    const value = Number(steiner);
    if (!Number.isInteger(value) || value < 0) {
      throw new Error('switches.steiner muss eine ganze Zahl ab 0 sein.');
    }
    switches.steiner = value;
  }
  if (ccdtInput.checked) switches.ccdt = true;
  if (jettisonInput.checked) switches.jettison = true;
  if (!quietInput.checked) switches.quiet = false;
  return Object.keys(switches).length === 0 ? undefined : switches;
}

// ---------------------------------------------------------------------------
// Der Viewer der rechten Spalte.
//
// Massstab und Bildmitte sind FEST: der Viewer kann heute nicht einpassen
// (`fit` steht als `todo` in `cross-section-viewer/src/viewer.ts`). Die Figur
// ist 200 × 300 mm, ihr Mittelpunkt liegt bei (100, 150) — der Weltursprung
// muss also genau darum nach links oben aus der Bildmitte wandern.
// ---------------------------------------------------------------------------

const stageBounds = viewerContainer.getBoundingClientRect();
const stageSize = {
  width: Math.floor(stageBounds.width),
  height: Math.floor(stageBounds.height),
};

const SCALE = 1.15;
const CENTRE_Y = 100;
const CENTRE_Z = 150;

const viewer = createCrossSectionViewer({
  driver: createKonvaDriver({
    container: viewerContainer,
    width: stageSize.width,
    height: stageSize.height,
    layers: CROSS_SECTION_LAYERS,
  }),
  initialViewport: viewport(
    screenPoint(
      stageSize.width / 2 - CENTRE_Y * SCALE,
      stageSize.height / 2 - CENTRE_Z * SCALE,
    ),
    SCALE,
  ),
  getGeometry: () => geometry,
  getSectionPolicy: () => DEFAULT_SECTION_POLICY,
  getScreenSize: () => stageSize,
  // DIE DREI ERGEBNIS-PULLS. Ein weggelassener Pull und ein Pull mit
  // `undefined` sind derselbe Aus-Zustand — vor dem ersten „Netz erzeugen"
  // steht deshalb nur der Umriss im Bild.
  //
  // Spannungspunkte bleiben aus: für eine freie `SectionGeometry` liefert
  // `stressPoints` heute `undefined`, es gibt noch keine Vorlage.
  getFEMesh: () => feMesh,
  getProperties: () => values,
  grid: { spacing: 50 }, // Weltkoordinaten in mm
});

// Der Umriss steht sofort, das Netz erst nach dem ersten Lauf.
viewer.requestRender();

function renderMesh(result: Mesh2DResult, svg: SVGSVGElement): void {
  svg.replaceChildren();
  const { minX, minY, maxX, maxY } = bounds(result);
  const padding = 12;
  // NICHT GESPIEGELT, und das ist der Unterschied zu einem generischen
  // Mesh-Betrachter: die Ringe dieser Seite sind ein QUERSCHNITT, und in seiner
  // Ebene laeuft `z` nach unten (ADR 0031) — dieselbe Richtung, in die
  // SVG-Koordinaten ohnehin wachsen.
  //
  // Ein `-y` hier drehte nur das linke Bild um. Der Umriss ueberstuende das
  // unbemerkt, weil die Figur doppelt symmetrisch ist; die Triangulierung ist
  // es NICHT, und dann zeigten zwei Bilder desselben Netzes zwei verschiedene
  // Muster. Genau der Vergleich ist aber der Zweck dieser Seite.
  svg.setAttribute(
    'viewBox',
    `${minX - padding} ${minY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}`,
  );

  const width = result.kind === 'tri3' ? 3 : 6;
  for (let offset = 0; offset < result.elements.length; offset += width) {
    const a = result.elements[offset];
    const b = result.elements[offset + 1];
    const c = result.elements[offset + 2];
    if (a === undefined || b === undefined || c === undefined) continue;
    const polygon = document.createElementNS(SVG_NS, 'polygon');
    polygon.setAttribute('points', `${point(result, a)} ${point(result, b)} ${point(result, c)}`);
    polygon.setAttribute('fill', '#eef7f1');
    polygon.setAttribute('stroke', '#a9c9b4');
    polygon.setAttribute('stroke-width', '0.6');
    polygon.setAttribute('stroke-linejoin', 'round');
    svg.append(polygon);
  }

  const boundary = document.createElementNS(SVG_NS, 'path');
  let d = '';
  for (let offset = 0; offset < result.boundarySegments.length; offset += 2) {
    const a = result.boundarySegments[offset];
    const b = result.boundarySegments[offset + 1];
    if (a === undefined || b === undefined) continue;
    d += `M${point(result, a)} L${point(result, b)}`;
  }
  boundary.setAttribute('d', d);
  boundary.setAttribute('fill', 'none');
  boundary.setAttribute('stroke', '#1c1f24');
  boundary.setAttribute('stroke-width', '1.6');
  boundary.setAttribute('stroke-linejoin', 'round');
  svg.append(boundary);
}

function bounds(
  result: Mesh2DResult,
): { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let index = 0; index < result.points.length / 2; index += 1) {
    const x = result.points[index * 2];
    const y = result.points[index * 2 + 1];
    if (x === undefined || y === undefined) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

function point(result: Mesh2DResult, index: number): string {
  const x = result.points[index * 2];
  const y = result.points[index * 2 + 1];
  if (x === undefined || y === undefined) {
    throw new Error('Das Mesh verweist auf einen fehlenden Knoten.');
  }
  return `${x},${y}`;
}

type SectionProperties = {
  /** Fläche in mm². */
  readonly A: number;
  /** Schwerpunkt-x (bezüglich der Eingabekoordinaten) in mm. */
  readonly xs: number;
  /** Schwerpunkt-y in mm. */
  readonly ys: number;
  /** Flächenträgheitsmoment um die x-Achse durch den Schwerpunkt [mm⁴]. */
  readonly Ix: number;
  /** Flächenträgheitsmoment um die y-Achse durch den Schwerpunkt [mm⁴]. */
  readonly Iy: number;
  /** Zentrifugalmoment [mm⁴]. */
  readonly Ixy: number;
};

function sectionProperties(result: Mesh2DResult): SectionProperties {
  // Integrale über das Triangulierungsnetz: Das Loch ist im Netz gar nicht
  // enthalten, jedes Dreieck trägt nur Materialfläche. Die Elemente sind per
  // Fassaden-Invariante positiv orientiert, die Flächenbeiträge addieren sich.
  let area = 0;
  let firstMomentX = 0;
  let firstMomentY = 0;
  let secondMomentX = 0;
  let secondMomentY = 0;
  let crossMoment = 0;
  const width = result.kind === 'tri3' ? 3 : 6;
  for (let offset = 0; offset < result.elements.length; offset += width) {
    const a = result.elements[offset];
    const b = result.elements[offset + 1];
    const c = result.elements[offset + 2];
    if (a === undefined || b === undefined || c === undefined) continue;
    const x0 = result.points[a * 2]!;
    const y0 = result.points[a * 2 + 1]!;
    const x1 = result.points[b * 2]!;
    const y1 = result.points[b * 2 + 1]!;
    const x2 = result.points[c * 2]!;
    const y2 = result.points[c * 2 + 1]!;
    const triangleArea = ((x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0)) / 2;
    area += triangleArea;
    firstMomentX += (triangleArea * (x0 + x1 + x2)) / 3;
    firstMomentY += (triangleArea * (y0 + y1 + y2)) / 3;
    secondMomentX +=
      (triangleArea *
        (x0 * x0 + x1 * x1 + x2 * x2 + x0 * x1 + x1 * x2 + x2 * x0)) /
      6;
    secondMomentY +=
      (triangleArea *
        (y0 * y0 + y1 * y1 + y2 * y2 + y0 * y1 + y1 * y2 + y2 * y0)) /
      6;
    crossMoment +=
      (triangleArea *
        (2 * (x0 * y0 + x1 * y1 + x2 * y2) +
          x0 * y1 +
          x1 * y0 +
          x1 * y2 +
          x2 * y1 +
          x2 * y0 +
          x0 * y2)) /
      12;
  }
  const xs = firstMomentX / area;
  const ys = firstMomentY / area;
  // Steiner: Die über den Koordinatenursprung integrierten Momente werden auf
  // Schwerachsen verschoben.
  return {
    A: area,
    xs,
    ys,
    Ix: secondMomentY - area * ys * ys,
    Iy: secondMomentX - area * xs * xs,
    Ixy: crossMoment - area * xs * ys,
  };
}

function summary(
  result: Mesh2DResult,
  maxElementArea: number,
  switches: Mesh2DSwitches | undefined,
  properties: SectionProperties,
): string {
  return [
    result.kind.toUpperCase(),
    `Knoten: ${result.points.length / 2}`,
    `Elemente: ${result.elements.length / 6}`,
    `Flächensumme: ${properties.A.toFixed(3)} mm²`,
    `maxElementArea: ${maxElementArea}`,
    switches === undefined ? undefined : `Switches: ${formatSwitches(switches)}`,
    `Schwerpunkt: (${properties.xs.toFixed(1)}, ${properties.ys.toFixed(1)}) mm`,
    `Ix, Iy, Ixy (Schwerachsen): ${Math.round(properties.Ix)}, ${Math.round(properties.Iy)}, ${Math.round(properties.Ixy)} mm⁴`,
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n');
}

function formatSwitches(switches: Mesh2DSwitches): string {
  const parts: string[] = [];
  if (switches.quality === false) {
    parts.push('q aus');
  } else if (switches.quality !== undefined) {
    parts.push(`q${switches.quality === true ? 20 : switches.quality}`);
  }
  if (switches.ccdt === true) parts.push('D');
  if (switches.jettison === true) parts.push('j');
  if (switches.steiner !== undefined) parts.push(`S${switches.steiner}`);
  if (switches.quiet === false) parts.push('Q aus');
  return parts.join(', ');
}

function element<T extends Element>(id: string): T {
  const found = document.getElementById(id);
  if (found === null) throw new Error(`Element #${id} fehlt in mesh-2d.html.`);
  return found as unknown as T;
}