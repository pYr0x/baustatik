import type { Mesh2DInput, Mesh2DResult, Mesh2DSwitches } from '@baustatik/mesh-2d-wasm';
import { generateMesh2D } from './mesh-2d-port';

const SVG_NS = 'http://www.w3.org/2000/svg';

const generate = element<HTMLButtonElement>('generate');
const output = element<HTMLPreElement>('output');
const tri6Svg = element<SVGSVGElement>('mesh-tri6');
const maxElementAreaInput = element<HTMLInputElement>('max-area');
const qualityInput = element<HTMLInputElement>('quality');
const qualityValue = element<HTMLOutputElement>('quality-value');
const steinerInput = element<HTMLInputElement>('steiner');
const ccdtInput = element<HTMLInputElement>('ccdt');
const jettisonInput = element<HTMLInputElement>('jettison');
const quietInput = element<HTMLInputElement>('quiet');

const rings: Mesh2DInput['rings'] = [
  { kind: 'material', coordinates: new Float64Array([0, 0, 200, 0, 200, 300, 0, 300]) },
  { kind: 'hole', coordinates: new Float64Array([70, 90, 130, 90, 130, 210, 70, 210]) },
];

generate.addEventListener('click', () => void mesh());
qualityInput.addEventListener('input', () => {
  qualityValue.textContent = qualityInput.value;
});

async function mesh(): Promise<void> {
  generate.disabled = true;
  output.textContent = 'Worker initialisiert Triangle …';
  tri6Svg.replaceChildren();
  try {
    const maxElementArea = readMaxElementArea();
    const switches = readSwitches();
    const result = await generateMesh2D({ rings, element: 'tri6', maxElementArea, switches });
    const properties = sectionProperties(result);
    output.textContent = summary(result, maxElementArea, switches, properties);
    renderMesh(result, tri6Svg);
  } catch (error) {
    output.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    generate.disabled = false;
  }
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

function renderMesh(result: Mesh2DResult, svg: SVGSVGElement): void {
  svg.replaceChildren();
  const { minX, minY, maxX, maxY } = bounds(result);
  const padding = 12;
  // SVG-Koordinaten wachsen nach unten; die y-Achse des Modells wird gespiegelt.
  svg.setAttribute(
    'viewBox',
    `${minX - padding} ${-maxY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}`,
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
  return `${x},${-y}`;
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