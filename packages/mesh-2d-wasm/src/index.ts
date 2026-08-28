import { atOrThrow } from '@baustatik/core';
import { BaustatikError } from '@baustatik/errors';
import { registerMesherHeap } from './heap-diagnostics';
import createTriangleModule, { type TriangleModule } from './triangle.mjs';

export type MeshRing2D = {
  readonly kind: 'material' | 'hole';
  /** Flache `[x0, y0, x1, y1, …]`-Koordinaten eines einfachen, geschlossenen Rings. */
  readonly coordinates: Float64Array;
};

/** Die konfigurierbaren Triangle-Switches, ohne die PSLG- und Ausgabe-Invarianten zu öffnen. */
export type Mesh2DSwitches = {
  /** `q`: `true` wählt Triangle-Standard `20`, eine Zahl den Mindestwinkel `(0, 34]` in Grad. */
  readonly quality?: boolean | number;
  /** `D`: verlangt eine conforming constrained Delaunay triangulation. */
  readonly ccdt?: boolean;
  /** `j`: entfernt doppelte oder von Löchern verschluckte Eingabepunkte aus der Ausgabe. */
  readonly jettison?: boolean;
  /** `S`: begrenzt die zusätzlich eingefügten Steiner-Punkte. */
  readonly steiner?: number;
  /** `Q`: unterdrückt Triangle-Ausgaben; voreingestellt `true`. */
  readonly quiet?: boolean;
};

export type Mesh2DInput = {
  readonly rings: readonly MeshRing2D[];
  /** Optionale innere Punkte `[x0, y0, x1, y1, …]`, die als feste Netzknoten erhalten bleiben. */
  readonly internalPoints?: Float64Array;
  readonly element: 'tri3' | 'tri6';
  readonly maxElementArea: number;
  readonly switches?: Mesh2DSwitches;
};

type MeshResult = {
  readonly points: Float64Array;
  readonly elements: Uint32Array;
  readonly pointMarkers: Int32Array;
  readonly boundarySegments: Uint32Array;
  readonly boundaryMarkers: Int32Array;
};

export type Mesh2DResult =
  | ({ readonly kind: 'tri3' } & MeshResult)
  | ({ readonly kind: 'tri6' } & MeshResult);

export interface Mesher2D {
  generate(input: Mesh2DInput): Mesh2DResult;
}

export class Mesh2DInputError extends BaustatikError {
  readonly ringIndices: readonly number[];

  constructor(message: string, ringIndices: readonly number[] = []) {
    super(message);
    this.ringIndices = Object.freeze([...ringIndices]);
  }
}

type Ring = {
  readonly kind: MeshRing2D['kind'];
  readonly coordinates: Float64Array;
  readonly marker: number;
};

type PreparedInput = {
  readonly rings: readonly Ring[];
  readonly points: Float64Array;
  readonly segments: Int32Array;
  readonly segmentMarkers: Int32Array;
  readonly holePoints: Float64Array;
};

const TRI6_ORDER = [0, 1, 2, 5, 3, 4] as const;
const MAX_MINIMUM_ANGLE = 34;

/** Initialisiert Triangle einmal; die erzeugte Instanz arbeitet danach synchron. */
export async function createMesher2D(): Promise<Mesher2D> {
  const module = await createTriangleModule();
  const mesher = Object.freeze({
    generate: (input: Mesh2DInput) => generate(module, input),
  });
  registerMesherHeap(mesher, module);
  return mesher;
}

function generate(module: TriangleModule, input: Mesh2DInput): Mesh2DResult {
  const prepared = prepare(input);
  const switches = triangleSwitches(input);
  let pointsPointer = 0;
  let segmentsPointer = 0;
  let segmentMarkersPointer = 0;
  let holesPointer = 0;
  let switchesPointer = 0;

  try {
    // Die folgenden Puffer gehören dem WASM-Heap. Sie müssen auch dann frei
    // werden, wenn Triangle wirft oder nur eine spätere Allokation scheitert.
    pointsPointer = copyFloat64(module, prepared.points);
    segmentsPointer = copyInt32(module, prepared.segments);
    segmentMarkersPointer = copyInt32(module, prepared.segmentMarkers);
    holesPointer = copyFloat64(module, prepared.holePoints);
    switchesPointer = module.stringToNewUTF8(switches);
    if (switchesPointer === 0) {
      throw new Error(
        'WASM-Speicher für Triangle-Switches konnte nicht angefordert werden.',
      );
    }
    const resultPointer = module._mesh_2d_generate(
      pointsPointer,
      prepared.points.length / 2,
      segmentsPointer,
      segmentMarkersPointer,
      prepared.segments.length / 2,
      holesPointer,
      prepared.holePoints.length / 2,
      switchesPointer,
    );
    if (resultPointer === 0)
      throw new Error('Triangle konnte keinen Ergebnisspeicher anfordern.');

    try {
      const pointCount = module._mesh_2d_result_point_count(resultPointer);
      const elementCount = module._mesh_2d_result_element_count(resultPointer);
      const elementWidth = module._mesh_2d_result_element_width(resultPointer);
      const boundarySegmentCount =
        module._mesh_2d_result_boundary_segment_count(resultPointer);
      const expectedWidth = input.element === 'tri3' ? 3 : 6;
      if (elementWidth !== expectedWidth) {
        throw new Error(
          `Triangle lieferte ${elementWidth} Knoten je Element statt ${expectedWidth}.`,
        );
      }

      // Triangle besitzt dieses Ergebnis. Vor `mesh_2d_result_free()` werden
      // deshalb neue Arrays angelegt, die außerhalb des WASM-Heaps gültig sind.
      const points = copyFloat64From(
        module,
        module._mesh_2d_result_points(resultPointer),
        pointCount * 2,
      );
      const elements = copyUint32From(
        module,
        module._mesh_2d_result_elements(resultPointer),
        elementCount * elementWidth,
      );
      const pointMarkers = copyInt32From(
        module,
        module._mesh_2d_result_point_markers(resultPointer),
        pointCount,
      );
      const boundarySegments = copyUint32From(
        module,
        module._mesh_2d_result_boundary_segments(resultPointer),
        boundarySegmentCount * 2,
      );
      const boundaryMarkers = copyInt32From(
        module,
        module._mesh_2d_result_boundary_markers(resultPointer),
        boundarySegmentCount,
      );

      return Object.freeze({
        kind: input.element,
        points,
        elements: input.element === 'tri6' ? normaliseTri6(elements) : elements,
        pointMarkers,
        boundarySegments,
        boundaryMarkers,
      });
    } finally {
      module._mesh_2d_result_free(resultPointer);
    }
  } finally {
    if (pointsPointer !== 0) module._free(pointsPointer);
    if (segmentsPointer !== 0) module._free(segmentsPointer);
    if (segmentMarkersPointer !== 0) module._free(segmentMarkersPointer);
    if (holesPointer !== 0) module._free(holesPointer);
    if (switchesPointer !== 0) module._free(switchesPointer);
  }
}

function prepare(input: Mesh2DInput): PreparedInput {
  // Triangle beendet den laufenden WASM-Kontext bei einigen PSLG-Fehlern. Alle
  // Eingabefehler, die wir selbst entscheiden können, bleiben deshalb davor.
  if (!Number.isFinite(input.maxElementArea) || input.maxElementArea <= 0) {
    throw new Mesh2DInputError(
      'maxElementArea muss endlich und größer als 0 sein.',
    );
  }
  if (input.element !== 'tri3' && input.element !== 'tri6') {
    throw new Mesh2DInputError('element muss tri3 oder tri6 sein.');
  }
  if (input.rings.length === 0)
    throw new Mesh2DInputError('Mindestens ein Materialring ist erforderlich.');

  const rings = input.rings.map((ring, index) => validateRing(ring, index));
  const material = rings.filter((ring) => ring.kind === 'material');
  const holes = rings.filter((ring) => ring.kind === 'hole');
  if (material.length === 0)
    throw new Mesh2DInputError('Mindestens ein Materialring ist erforderlich.');

  validateRingRelations(rings, material, holes);
  const internalPoints = validateInternalPoints(
    input.internalPoints,
    material,
    holes,
  );

  const ringPointCount = rings.reduce(
    (count, ring) => count + ring.coordinates.length / 2,
    0,
  );
  const internalPointCount =
    internalPoints === undefined ? 0 : internalPoints.length / 2;
  const totalPointCount = ringPointCount + internalPointCount;

  const points = new Float64Array(totalPointCount * 2);
  const segments = new Int32Array(ringPointCount * 2);
  const segmentMarkers = new Int32Array(ringPointCount);
  let pointOffset = 0;
  for (const ring of rings) {
    const ringCount = ring.coordinates.length / 2;
    points.set(ring.coordinates, pointOffset * 2);
    for (let index = 0; index < ringCount; index += 1) {
      const segmentOffset = (pointOffset + index) * 2;
      segments[segmentOffset] = pointOffset + index;
      segments[segmentOffset + 1] = pointOffset + ((index + 1) % ringCount);
      // Jede ursprüngliche Ringkante hat einen stabilen Marker. Triangle trägt
      // ihn bei einer Kantenunterteilung auf die daraus entstehenden Teile über.
      segmentMarkers[pointOffset + index] = ring.marker;
    }
    pointOffset += ringCount;
  }

  if (internalPoints !== undefined) {
    points.set(internalPoints, ringPointCount * 2);
  }

  return {
    rings,
    points,
    segments,
    segmentMarkers,
    holePoints: new Float64Array(
      holes.flatMap((ring) => [...holePoint(ring.coordinates)]),
    ),
  };
}

function validateInternalPoints(
  internalPoints: Float64Array | undefined,
  material: readonly Ring[],
  holes: readonly Ring[],
): Float64Array | undefined {
  if (internalPoints === undefined || internalPoints.length === 0) {
    return undefined;
  }
  if (internalPoints.length % 2 !== 0) {
    throw new Mesh2DInputError(
      'internalPoints muss eine gerade Anzahl an Koordinaten enthalten.',
    );
  }
  const coordinates = new Float64Array(internalPoints);
  for (const coordinate of coordinates) {
    if (!Number.isFinite(coordinate)) {
      throw new Mesh2DInputError(
        'internalPoints enthält keine endliche Koordinate.',
      );
    }
  }
  const count = coordinates.length / 2;
  for (let index = 0; index < count; index += 1) {
    const [x, y] = pointAt(coordinates, index);
    const inMaterial = material.some((ring) =>
      pointInRing(x, y, ring.coordinates),
    );
    if (!inMaterial) {
      throw new Mesh2DInputError(
        'Ein innerer Punkt liegt außerhalb aller Materialringe.',
      );
    }
    const inHole = holes.some((hole) => pointInRing(x, y, hole.coordinates));
    if (inHole) {
      throw new Mesh2DInputError(
        'Ein innerer Punkt liegt innerhalb eines Lochs.',
      );
    }
  }
  return coordinates;
}

function validateRing(input: MeshRing2D, index: number): Ring {
  if (input.kind !== 'material' && input.kind !== 'hole') {
    throw new Mesh2DInputError(`Ring ${index} hat keine gültige Art.`, [index]);
  }
  if (input.coordinates.length < 6 || input.coordinates.length % 2 !== 0) {
    throw new Mesh2DInputError(
      `Ring ${index} braucht mindestens drei Koordinatenpaare.`,
      [index],
    );
  }
  const coordinates = new Float64Array(input.coordinates);
  for (const coordinate of coordinates) {
    if (!Number.isFinite(coordinate)) {
      throw new Mesh2DInputError(
        `Ring ${index} enthält keine endliche Koordinate.`,
        [index],
      );
    }
  }
  for (let point = 0; point < coordinates.length / 2; point += 1) {
    if (samePoint(coordinates, point, (point + 1) % (coordinates.length / 2))) {
      throw new Mesh2DInputError(`Ring ${index} enthält eine Nullkante.`, [
        index,
      ]);
    }
  }
  const area = signedArea(coordinates);
  if (!Number.isFinite(area) || area === 0) {
    throw new Mesh2DInputError(`Ring ${index} hat keine endliche Fläche.`, [
      index,
    ]);
  }
  if (hasSelfIntersection(coordinates)) {
    throw new Mesh2DInputError(`Ring ${index} schneidet sich selbst.`, [index]);
  }
  return { kind: input.kind, coordinates, marker: index + 1 };
}

function validateRingRelations(
  rings: readonly Ring[],
  material: readonly Ring[],
  holes: readonly Ring[],
): void {
  // Kantenkontakte sind vorher ausgeschlossen. Damit entscheidet ein einzelner
  // Ringpunkt eindeutig, ob ein Ring einen anderen enthält.
  for (let first = 0; first < rings.length; first += 1) {
    for (let second = first + 1; second < rings.length; second += 1) {
      const a = atOrThrow(rings, first);
      const b = atOrThrow(rings, second);
      if (ringsIntersect(a.coordinates, b.coordinates)) {
        throw new Mesh2DInputError(
          `Ring ${first} und Ring ${second} schneiden oder berühren sich.`,
          [first, second],
        );
      }
    }
  }
  for (const ring of material) {
    const [x, y] = pointAt(ring.coordinates, 0);
    const containedBy = material.filter(
      (candidate) =>
        candidate !== ring && pointInRing(x, y, candidate.coordinates),
    );
    if (containedBy.length > 0)
      throw new Mesh2DInputError(
        'Materialringe dürfen einander nicht überdecken.',
        [ring.marker - 1],
      );
  }
  for (const hole of holes) {
    const [x, y] = pointAt(hole.coordinates, 0);
    const containingMaterial = material.filter((ring) =>
      pointInRing(x, y, ring.coordinates),
    );
    if (containingMaterial.length !== 1) {
      throw new Mesh2DInputError(
        'Jedes Loch muss in genau einem Materialring liegen.',
        [hole.marker - 1],
      );
    }
    if (
      holes.some(
        (candidate) =>
          candidate !== hole && pointInRing(x, y, candidate.coordinates),
      )
    ) {
      throw new Mesh2DInputError('Löcher dürfen einander nicht überdecken.', [
        hole.marker - 1,
      ]);
    }
  }
}

function hasSelfIntersection(coordinates: Float64Array): boolean {
  const count = coordinates.length / 2;
  for (let first = 0; first < count; first += 1) {
    for (let second = first + 1; second < count; second += 1) {
      if (
        first === second ||
        (first + 1) % count === second ||
        (second + 1) % count === first
      )
        continue;
      if (
        segmentsIntersect(
          coordinates,
          first,
          (first + 1) % count,
          coordinates,
          second,
          (second + 1) % count,
        )
      )
        return true;
    }
  }
  return false;
}

function ringsIntersect(first: Float64Array, second: Float64Array): boolean {
  const firstCount = first.length / 2;
  const secondCount = second.length / 2;
  for (let a = 0; a < firstCount; a += 1) {
    for (let b = 0; b < secondCount; b += 1) {
      if (
        segmentsIntersect(
          first,
          a,
          (a + 1) % firstCount,
          second,
          b,
          (b + 1) % secondCount,
        )
      )
        return true;
    }
  }
  return false;
}

function segmentsIntersect(
  first: Float64Array,
  a: number,
  b: number,
  second: Float64Array,
  c: number,
  d: number,
): boolean {
  const abC = orientation(first, a, b, second, c);
  const abD = orientation(first, a, b, second, d);
  const cdA = orientation(second, c, d, first, a);
  const cdB = orientation(second, c, d, first, b);
  // Berührungen sind ebenso unzulässig wie ein echtes Kreuzen: Triangle würde
  // aus einem solchen PSLG je nach numerischem Pfad verschiedene Netze bilden.
  return (
    (abC === 0 && onSegment(first, a, b, second, c)) ||
    (abD === 0 && onSegment(first, a, b, second, d)) ||
    (cdA === 0 && onSegment(second, c, d, first, a)) ||
    (cdB === 0 && onSegment(second, c, d, first, b)) ||
    (abC > 0 !== abD > 0 && cdA > 0 !== cdB > 0)
  );
}

function orientation(
  from: Float64Array,
  a: number,
  b: number,
  point: Float64Array,
  c: number,
): number {
  const [ax, ay] = pointAt(from, a);
  const [bx, by] = pointAt(from, b);
  const [cx, cy] = pointAt(point, c);
  const value = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  return Math.sign(value);
}

function onSegment(
  from: Float64Array,
  a: number,
  b: number,
  point: Float64Array,
  c: number,
): boolean {
  const [ax, ay] = pointAt(from, a);
  const [bx, by] = pointAt(from, b);
  const [cx, cy] = pointAt(point, c);
  return (
    cx >= Math.min(ax, bx) &&
    cx <= Math.max(ax, bx) &&
    cy >= Math.min(ay, by) &&
    cy <= Math.max(ay, by)
  );
}

function samePoint(
  coordinates: Float64Array,
  first: number,
  second: number,
): boolean {
  const [firstX, firstY] = pointAt(coordinates, first);
  const [secondX, secondY] = pointAt(coordinates, second);
  return firstX === secondX && firstY === secondY;
}

function signedArea(coordinates: Float64Array): number {
  let twiceArea = 0;
  const count = coordinates.length / 2;
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    const [x0, y0] = pointAt(coordinates, index);
    const [x1, y1] = pointAt(coordinates, next);
    twiceArea += x0 * y1 - x1 * y0;
  }
  return twiceArea / 2;
}

function pointInRing(x: number, y: number, coordinates: Float64Array): boolean {
  let inside = false;
  const count = coordinates.length / 2;
  for (
    let current = 0, previous = count - 1;
    current < count;
    previous = current++
  ) {
    const [currentX, currentY] = pointAt(coordinates, current);
    const [previousX, previousY] = pointAt(coordinates, previous);
    if (currentY > y !== previousY > y) {
      if (
        x <
        ((previousX - currentX) * (y - currentY)) / (previousY - currentY) +
          currentX
      )
        inside = !inside;
    }
  }
  return inside;
}

/** Ein horizontaler Schnitt zwischen zwei Vertexhöhen liefert sicher einen Innenpunkt. */
function holePoint(coordinates: Float64Array): readonly [number, number] {
  const ys = [
    ...new Set(
      Array.from(coordinates, (_, index) =>
        index % 2 === 1 ? coordinates[index] : undefined,
      ).filter((value): value is number => value !== undefined),
    ),
  ].sort((a, b) => a - b);
  for (let index = 0; index < ys.length - 1; index += 1) {
    const low = atOrThrow(ys, index);
    const high = atOrThrow(ys, index + 1);
    const y = (low + high) / 2;
    const intersections: number[] = [];
    for (let point = 0; point < coordinates.length / 2; point += 1) {
      const next = (point + 1) % (coordinates.length / 2);
      const [x0, y0] = pointAt(coordinates, point);
      const [x1, y1] = pointAt(coordinates, next);
      if (y0 > y === y1 > y) continue;
      intersections.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
    }
    intersections.sort((a, b) => a - b);
    if (intersections.length >= 2) {
      const left = atOrThrow(intersections, 0);
      const right = atOrThrow(intersections, 1);
      if (left < right) return [(left + right) / 2, y];
    }
  }
  throw new Mesh2DInputError(
    'Für ein Loch konnte kein innerer Scanline-Punkt erzeugt werden.',
  );
}

function copyFloat64(module: TriangleModule, values: Float64Array): number {
  if (values.byteLength === 0) return 0;
  const pointer = module._malloc(values.byteLength);
  if (pointer === 0)
    throw new Error('WASM-Speicher konnte nicht angefordert werden.');
  module.HEAPF64.set(values, pointer / Float64Array.BYTES_PER_ELEMENT);
  return pointer;
}

function triangleSwitches(input: Mesh2DInput): string {
  // Diese Switches sind Teil der Fassaden-Invariante, nicht der Anwenderwahl:
  // Ringe sind PSLGs, alle Indizes sind nullbasiert, und `a` beschreibt genau
  // das Pflichtfeld `maxElementArea`. Die Optionalen folgen der Triangle-Tabelle.
  const config = input.switches ?? {};
  const switches = ['p', 'z', `a${triangleDecimal(input.maxElementArea)}`];

  if (config.quality === undefined || config.quality === true) {
    switches.push('q20');
  } else if (typeof config.quality === 'number') {
    if (
      !Number.isFinite(config.quality) ||
      config.quality <= 0 ||
      config.quality > MAX_MINIMUM_ANGLE
    ) {
      throw new Mesh2DInputError(
        `switches.quality muss endlich, größer als 0 und höchstens ${MAX_MINIMUM_ANGLE} sein.`,
      );
    }
    switches.push(`q${triangleDecimal(config.quality)}`);
  }
  if (config.ccdt === true) switches.push('D');
  if (config.jettison === true) switches.push('j');
  if (config.steiner !== undefined) {
    if (!Number.isInteger(config.steiner) || config.steiner < 0) {
      throw new Mesh2DInputError(
        'switches.steiner muss eine ganze Zahl ab 0 sein.',
      );
    }
    switches.push(`S${config.steiner}`);
  }
  if (input.element === 'tri6') switches.push('o2');
  if (config.quiet !== false) switches.push('Q');
  return switches.join('');
}

function triangleDecimal(value: number): string {
  const text = String(value);
  const exponentAt = text.search(/[eE]/);
  if (exponentAt === -1) return text;

  const coefficient = text.slice(0, exponentAt);
  const exponent = Number(text.slice(exponentAt + 1));
  const [whole, fraction = ''] = coefficient.split('.');
  const digits = `${whole}${fraction}`;
  const decimalAt = whole.length + exponent;
  if (decimalAt <= 0) return `0.${'0'.repeat(-decimalAt)}${digits}`;
  if (decimalAt >= digits.length) {
    return `${digits}${'0'.repeat(decimalAt - digits.length)}`;
  }
  return `${digits.slice(0, decimalAt)}.${digits.slice(decimalAt)}`;
}

function copyInt32(module: TriangleModule, values: Int32Array): number {
  if (values.byteLength === 0) return 0;
  const pointer = module._malloc(values.byteLength);
  if (pointer === 0)
    throw new Error('WASM-Speicher konnte nicht angefordert werden.');
  module.HEAP32.set(values, pointer / Int32Array.BYTES_PER_ELEMENT);
  return pointer;
}

function copyFloat64From(
  module: TriangleModule,
  pointer: number,
  length: number,
): Float64Array {
  return new Float64Array(
    module.HEAPF64.slice(
      pointer / Float64Array.BYTES_PER_ELEMENT,
      pointer / Float64Array.BYTES_PER_ELEMENT + length,
    ),
  );
}

function copyInt32From(
  module: TriangleModule,
  pointer: number,
  length: number,
): Int32Array {
  return new Int32Array(
    module.HEAP32.slice(
      pointer / Int32Array.BYTES_PER_ELEMENT,
      pointer / Int32Array.BYTES_PER_ELEMENT + length,
    ),
  );
}

function copyUint32From(
  module: TriangleModule,
  pointer: number,
  length: number,
): Uint32Array {
  return new Uint32Array(copyInt32From(module, pointer, length));
}

function normaliseTri6(elements: Uint32Array): Uint32Array {
  // Triangle führt seine Mittelknoten als m12, m20, m01. Die öffentliche API
  // verspricht hingegen die zu den drei Eckkanten passende Reihenfolge m01, m12, m20.
  const normalised = new Uint32Array(elements.length);
  for (let offset = 0; offset < elements.length; offset += 6) {
    for (let index = 0; index < TRI6_ORDER.length; index += 1) {
      const source = atOrThrow(TRI6_ORDER, index);
      const node = elements[offset + source];
      if (node === undefined) {
        throw new Error('Triangle lieferte ein unvollständiges Tri6-Element.');
      }
      normalised[offset + index] = node;
    }
  }
  return normalised;
}

function pointAt(
  coordinates: Float64Array,
  index: number,
): readonly [number, number] {
  const x = coordinates[index * 2];
  const y = coordinates[index * 2 + 1];
  if (x === undefined || y === undefined) {
    throw new Error('Die interne Ringinvariante ist verletzt.');
  }
  return [x, y];
}
