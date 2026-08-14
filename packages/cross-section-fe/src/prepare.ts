/**
 * Aus `Mesh2DResult` wird ein rechenfertiger Querschnitt — rein und synchron.
 *
 * WAS HIER PASSIERT, IST DIE HAELFTE DER STILLEN FEHLER DIESES VORGANGS:
 * der Umlaufsinn der Randschleifen, die Zuordnung der Mittelknoten und die
 * Verschiebung in den Schwerpunkt. Jedes davon sieht man dem Ergebnis nicht an
 * — ein gespiegelter Schubmittelpunkt sieht plausibel aus.
 *
 * DIE WERTE KOMMEN AUS DEM NETZ und nicht aus der geschlossenen Formel oder
 * aus Green. Nur so bedeutet die Gleichgewichtsprobe `∫τ_z dA = 1` etwas: sie
 * prueft dann die Rechnung und nicht die Uebereinstimmung zweier
 * Flaechenangaben. Dass Netz und Green dieselbe Flaeche liefern, ist ein
 * Orakel und keine Voraussetzung.
 */

import { atOrThrow } from '@baustatik/core';
import type { Mesh2DResult } from '@baustatik/mesh-2d-wasm';
import { elementPoints, TRIANGLE_6 } from './tri6';

/** Eine Kante des Randes: Anfangsecke, Mittelknoten, Endecke. */
export type BoundaryEdge = readonly [number, number, number];

/**
 * Eine geschlossene Randschleife, ORIENTIERT.
 *
 * Der Aussenrand laeuft mathematisch positiv (`signedArea > 0`), jeder
 * Innenrand negativ. Damit zeigt die Normale `n = (dz, −dy)/L` einer Kante
 * `a → b` ueberall AUS DEM MATERIAL HERAUS — am Loch also in das Loch hinein.
 * Ohne diese Festlegung dreht sich der Neumann-Randterm der Torsion am Loch um,
 * und `It` kommt falsch heraus, ohne dass irgendetwas wirft.
 */
export type BoundaryLoop = {
  readonly isOuter: boolean;
  /** In Umlaufrichtung. */
  readonly edges: readonly BoundaryEdge[];
  /** Alle Knoten der Schleife, Ecken UND Mittelknoten. */
  readonly nodes: readonly number[];
  readonly signedArea: number;
};

/** Das vorbereitete Netz — alles, was von `ν` und von der Lastrichtung frei ist. */
export type FESection = {
  readonly mesh: Mesh2DResult;
  readonly nodeCount: number;
  readonly elementCount: number;
  /** Knotenkoordinaten, SCHWERPUNKTSBEZOGEN. */
  readonly y: Float64Array;
  readonly z: Float64Array;
  /** Der Schwerpunkt im EINGABESYSTEM des Netzes. */
  readonly ys: number;
  readonly zs: number;
  /** Aus dem Netz integriert, schwerpunktsbezogen. */
  readonly A: number;
  readonly Iy: number;
  readonly Iz: number;
  readonly Iyz: number;
  readonly loops: readonly BoundaryLoop[];
  readonly holeLoops: readonly BoundaryLoop[];
  /** `1`, wenn der Knoten auf irgendeinem Rand liegt. */
  readonly isBoundary: Uint8Array;
};

/** Die sechs Knoten eines Elements. */
export function elementNodes(mesh: Mesh2DResult, element: number): Uint32Array {
  return mesh.elements.subarray(element * 6, element * 6 + 6);
}

/**
 * Vorbereitung: Koordinaten, Momente, Randschleifen.
 *
 * WIRFT bei einem Netz, das nicht Tri6 ist, oder bei einem Rand, der sich nicht
 * vollstaendig in Schleifen zerlegen laesst. Beides waere ein Bruch der
 * Fassaden-Invariante des Meshers und kein Anwenderfehler.
 */
export function prepareSection(mesh: Mesh2DResult): FESection {
  if (mesh.kind !== 'tri6') {
    throw new Error(`Die FE braucht ein Tri6-Netz (war: ${mesh.kind}).`);
  }

  const nodeCount = mesh.points.length / 2;
  const elementCount = mesh.elements.length / 6;
  const y = new Float64Array(nodeCount);
  const z = new Float64Array(nodeCount);
  for (let node = 0; node < nodeCount; node += 1) {
    y[node] = atOrThrow(mesh.points, node * 2);
    z[node] = atOrThrow(mesh.points, node * 2 + 1);
  }

  const { A, Sy, Sz } = firstMoments(mesh, elementCount, y, z);
  const ys = Sy / A;
  const zs = Sz / A;
  for (let node = 0; node < nodeCount; node += 1) {
    y[node] = atOrThrow(y, node) - ys;
    z[node] = atOrThrow(z, node) - zs;
  }

  const second = secondMoments(mesh, elementCount, y, z);
  const loops = boundaryLoops(mesh, elementCount, y, z);

  const isBoundary = new Uint8Array(nodeCount);
  for (const loop of loops) {
    for (const node of loop.nodes) isBoundary[node] = 1;
  }

  return {
    mesh,
    nodeCount,
    elementCount,
    y,
    z,
    ys,
    zs,
    A,
    Iy: second.Iy,
    Iz: second.Iz,
    Iyz: second.Iyz,
    loops,
    holeLoops: loops.filter((loop) => !loop.isOuter),
    isBoundary,
  };
}

function firstMoments(
  mesh: Mesh2DResult,
  elementCount: number,
  y: Float64Array,
  z: Float64Array,
): { readonly A: number; readonly Sy: number; readonly Sz: number } {
  let A = 0;
  let Sy = 0;
  let Sz = 0;
  const elementY = new Float64Array(6);
  const elementZ = new Float64Array(6);
  for (let element = 0; element < elementCount; element += 1) {
    const nodes = elementNodes(mesh, element);
    for (let i = 0; i < 6; i += 1) {
      const node = atOrThrow(nodes, i);
      elementY[i] = atOrThrow(y, node);
      elementZ[i] = atOrThrow(z, node);
    }
    for (const point of elementPoints(TRIANGLE_6, elementY, elementZ)) {
      A += point.weight;
      Sy += point.y * point.weight;
      Sz += point.z * point.weight;
    }
  }
  if (!(Number.isFinite(A) && A > 0)) {
    throw new Error('Das Netz traegt keine positive Flaeche.');
  }
  return { A, Sy, Sz };
}

function secondMoments(
  mesh: Mesh2DResult,
  elementCount: number,
  y: Float64Array,
  z: Float64Array,
): { readonly Iy: number; readonly Iz: number; readonly Iyz: number } {
  let Iy = 0;
  let Iz = 0;
  let Iyz = 0;
  const elementY = new Float64Array(6);
  const elementZ = new Float64Array(6);
  for (let element = 0; element < elementCount; element += 1) {
    const nodes = elementNodes(mesh, element);
    for (let i = 0; i < 6; i += 1) {
      const node = atOrThrow(nodes, i);
      elementY[i] = atOrThrow(y, node);
      elementZ[i] = atOrThrow(z, node);
    }
    for (const point of elementPoints(TRIANGLE_6, elementY, elementZ)) {
      Iy += point.z * point.z * point.weight;
      Iz += point.y * point.y * point.weight;
      Iyz += point.y * point.z * point.weight;
    }
  }
  return { Iy, Iz, Iyz };
}

/**
 * Die Randschleifen mit ihren Mittelknoten.
 *
 * `boundarySegments` fuehrt nur die beiden ECKEN einer Randkante — der
 * Mittelknoten steht allein in der Elementliste. Er wird deshalb ueber die
 * Kanten der Elemente nachgeschlagen: `[v0, v1, v2, m01, m12, m20]` sagt genau,
 * welcher Mittelknoten zu welchem Eckenpaar gehoert.
 */
function boundaryLoops(
  mesh: Mesh2DResult,
  elementCount: number,
  y: Float64Array,
  z: Float64Array,
): readonly BoundaryLoop[] {
  const midNodes = midsideByCornerPair(mesh, elementCount);

  const neighbours = new Map<number, number[]>();
  const segmentCount = mesh.boundarySegments.length / 2;
  for (let segment = 0; segment < segmentCount; segment += 1) {
    const a = atOrThrow(mesh.boundarySegments, segment * 2);
    const b = atOrThrow(mesh.boundarySegments, segment * 2 + 1);
    push(neighbours, a, b);
    push(neighbours, b, a);
  }

  const visited = new Set<number>();
  const walks: number[][] = [];
  for (const start of neighbours.keys()) {
    if (visited.has(start)) continue;
    const nodes = [start];
    visited.add(start);
    let previous = -1;
    let current = start;
    for (;;) {
      const next = neighbourOf(neighbours, current).find(
        (node) => node !== previous && !visited.has(node),
      );
      if (next === undefined) break;
      nodes.push(next);
      visited.add(next);
      previous = current;
      current = next;
    }
    walks.push(nodes);
  }
  if (visited.size !== neighbours.size) {
    throw new Error(
      'Der Rand liess sich nicht vollstaendig in geschlossene Schleifen zerlegen.',
    );
  }

  const areas = walks.map((nodes) => shoelace(nodes, y, z));
  let outer = 0;
  for (let index = 1; index < areas.length; index += 1) {
    if (Math.abs(atOrThrow(areas, index)) > Math.abs(atOrThrow(areas, outer))) {
      outer = index;
    }
  }

  return walks.map((nodes, index) => {
    const isOuter = index === outer;
    const signedArea = atOrThrow(areas, index);
    // Aussen mathematisch positiv, innen negativ — siehe `BoundaryLoop`.
    const walk =
      Math.sign(signedArea) === (isOuter ? 1 : -1)
        ? nodes
        : [...nodes].reverse();

    const edges: BoundaryEdge[] = [];
    const loopNodes: number[] = [];
    for (let at = 0; at < walk.length; at += 1) {
      const a = atOrThrow(walk, at);
      const b = atOrThrow(walk, (at + 1) % walk.length);
      const middle = midNodes.get(pairKey(a, b));
      if (middle === undefined) {
        throw new Error(
          'Zu einer Randkante fehlt der Tri6-Mittelknoten im Elementnetz.',
        );
      }
      edges.push([a, middle, b]);
      loopNodes.push(a, middle);
    }

    return {
      isOuter,
      edges,
      nodes: loopNodes,
      signedArea: isOuter ? Math.abs(signedArea) : -Math.abs(signedArea),
    };
  });
}

function midsideByCornerPair(
  mesh: Mesh2DResult,
  elementCount: number,
): Map<number, number> {
  const map = new Map<number, number>();
  for (let element = 0; element < elementCount; element += 1) {
    const nodes = elementNodes(mesh, element);
    const v0 = atOrThrow(nodes, 0);
    const v1 = atOrThrow(nodes, 1);
    const v2 = atOrThrow(nodes, 2);
    map.set(pairKey(v0, v1), atOrThrow(nodes, 3));
    map.set(pairKey(v1, v2), atOrThrow(nodes, 4));
    map.set(pairKey(v2, v0), atOrThrow(nodes, 5));
  }
  return map;
}

/** Der Schluessel ist ungerichtet: dieselbe Kante aus zwei Elementen ist eine. */
function pairKey(a: number, b: number): number {
  return a < b ? a * 0x4000_0000 + b : b * 0x4000_0000 + a;
}

function push(map: Map<number, number[]>, key: number, value: number): void {
  const found = map.get(key);
  if (found === undefined) map.set(key, [value]);
  else found.push(value);
}

function neighbourOf(
  map: Map<number, number[]>,
  key: number,
): readonly number[] {
  const found = map.get(key);
  if (found === undefined) {
    throw new Error('Ein Randknoten hat keine Nachbarn.');
  }
  return found;
}

function shoelace(
  nodes: readonly number[],
  y: Float64Array,
  z: Float64Array,
): number {
  let twiceArea = 0;
  for (let at = 0; at < nodes.length; at += 1) {
    const a = atOrThrow(nodes, at);
    const b = atOrThrow(nodes, (at + 1) % nodes.length);
    twiceArea +=
      atOrThrow(y, a) * atOrThrow(z, b) - atOrThrow(y, b) * atOrThrow(z, a);
  }
  return twiceArea / 2;
}
