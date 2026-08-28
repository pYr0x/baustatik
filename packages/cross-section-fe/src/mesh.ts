/**
 * Vom Umriss zum Netzeingang — rein und synchron.
 *
 * MATERIAL UND LOCH STEHEN IM UMLAUFSINN: `signedArea > 0` ist Material, `< 0`
 * ein Loch
 * ([ADR 0034](../../../docs/adr/0034-winding-is-mathematical-and-the-factory-does-not-normalise.md)).
 * Die Umsetzung nach `MeshRing2D.kind` ist deshalb eine VORZEICHENABFRAGE und
 * kein Verschachtelungstest — die Lochsaatpunkte erzeugt der Mesher selbst.
 *
 * UMGERECHNET WIRD HIER, EINMAL: der Umriss fuehrt Millimeter
 * (`SectionGeometry`), die FE rechnet und liefert SI.
 */

import { atOrThrow } from '@baustatik/core';
import type { Polygon, ReinforcementLayer } from '@baustatik/cross-section';
import type { Mesh2DInput, MeshRing2D } from '@baustatik/mesh-2d-wasm';
import { MM_TO_M } from './units';

/**
 * Warum eine Figur gar nicht erst vernetzt wird.
 *
 * `disconnected-areas`: ZWEI GETRENNTE MATERIALFLAECHEN. Der Mesher kann sie,
 * das Stabmodell nicht — wie sich eine Querkraft auf zwei unverbundene Flaechen
 * aufteilt, sagt keine Balkentheorie. Dieselbe Haltung wie
 * `DisconnectedWallGraphWarning` in `@baustatik/cross-section`.
 */
export type MeshRefusal = 'disconnected-areas';

export type MeshPlan =
  | { readonly kind: 'mesh'; readonly input: Mesh2DInput }
  | { readonly kind: 'refused'; readonly reason: MeshRefusal };

/**
 * Der Netzeingang zu einem Umriss.
 *
 * `maxElementArea = A / FEElements` ist RELATIV, und das ist keine Bequemlichkeit:
 * Querschnitte reichen vom cm²- bis in den m²-Bereich, und ein absoluter Wert
 * ergaebe dort 20 und dort 10⁶ Elemente.
 */
export function meshPlan(
  outline: readonly Polygon[],
  elements: number,
  reinforcement?: readonly ReinforcementLayer[],
): MeshPlan {
  const rings: MeshRing2D[] = [];
  let material = 0;
  let A = 0;

  for (const polygon of outline) {
    if (polygon.points.length < 3) continue;
    const coordinates = new Float64Array(polygon.points.length * 2);
    for (let index = 0; index < polygon.points.length; index += 1) {
      const point = atOrThrow(polygon.points, index);
      coordinates[index * 2] = point.y * MM_TO_M;
      coordinates[index * 2 + 1] = point.z * MM_TO_M;
    }
    const area = signedArea(coordinates);
    if (area === 0) continue;
    if (area > 0) material += 1;
    A += area;
    rings.push({ kind: area > 0 ? 'material' : 'hole', coordinates });
  }

  if (material !== 1) return { kind: 'refused', reason: 'disconnected-areas' };
  if (!(Number.isFinite(A) && A > 0)) {
    return { kind: 'refused', reason: 'disconnected-areas' };
  }

  const internalPoints = extractReinforcementPoints(reinforcement);

  return {
    kind: 'mesh',
    input: {
      rings,
      ...(internalPoints !== undefined ? { internalPoints } : {}),
      element: 'tri6',
      maxElementArea: A / elements,
      // `quality: true` ist Triangles `q20`: kein Innenwinkel unter 20°. Ohne
      // sie erzeugt Triangle an einspringenden Ecken Splitter, deren
      // Gradienten die Schubenergie verderben.
      switches: { quality: true },
    },
  };
}

function extractReinforcementPoints(
  reinforcement: readonly ReinforcementLayer[] | undefined,
): Float64Array | undefined {
  if (reinforcement === undefined || reinforcement.length === 0) {
    return undefined;
  }
  const totalCount = reinforcement.reduce(
    (count, layer) => count + layer.elements.length,
    0,
  );
  if (totalCount === 0) return undefined;
  const coordinates = new Float64Array(totalCount * 2);
  let offset = 0;
  for (const layer of reinforcement) {
    for (const element of layer.elements) {
      coordinates[offset * 2] = element.y * MM_TO_M;
      coordinates[offset * 2 + 1] = element.z * MM_TO_M;
      offset += 1;
    }
  }
  return coordinates;
}

function signedArea(coordinates: Float64Array): number {
  let twice = 0;
  const count = coordinates.length / 2;
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    twice +=
      atOrThrow(coordinates, index * 2) * atOrThrow(coordinates, next * 2 + 1) -
      atOrThrow(coordinates, next * 2) * atOrThrow(coordinates, index * 2 + 1);
  }
  return twice / 2;
}
