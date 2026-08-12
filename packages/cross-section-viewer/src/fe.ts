/**
 * Das FE-NETZ als Drahtgitter — ein TRANSIENTES Ergebnis, kein Eingabedatum.
 *
 * Der Viewer erzeugt kein Netz und kennt keinen Worker: das Vernetzen ist eine
 * voruebergehende Faehigkeit, die der Aufrufer besitzt und deren Ergebnis er
 * bei jeder Geometrie- oder Policy-Aenderung verwirft
 * ([ADR 0039](../../../docs/adr/0039-meshing-is-a-transient-worker-capability.md)).
 * Weggelassen heisst „noch nicht vernetzt", und dann steht kein Netz im Bild —
 * dasselbe Muster wie die Auflagerreaktionen im FEM-Viewer.
 */

import { assertNever, type Spec } from '@baustatik/render-core';

import { InvalidFEMeshError } from './errors';
import type { CrossSectionStyle } from './style';

export const FE_LAYER = 'fe';

/**
 * Ein Dreiecksnetz, wie es von aussen hereingereicht wird.
 *
 * ABSICHTLICH NUR STRUKTURELL ZU `Mesh2DResult`: ein Ergebnis von
 * `@baustatik/mesh-2d-wasm` passt unveraendert hinein, aber dieses Package
 * importiert den Mesher nicht und kennt weder Worker noch PSLG,
 * `boundarySegments` oder Marker. Was ein Viewer braucht, sind Punkte und
 * Elemente; alles andere gehoert der Rechnung.
 *
 * Die Punkte liegen bereits in `y`/`z`-Millimetern, also im selben System wie
 * Wandknoten und Umriss — es gibt hier nichts umzurechnen.
 */
export type CrossSectionFEMesh = {
  readonly kind: 'tri3' | 'tri6';
  /** Flach `[y0, z0, y1, z1, …]`. */
  readonly points: Float64Array;
  /** Flache Knotenindizes, `3` bzw. `6` je Element. */
  readonly elements: Uint32Array;
};

/**
 * Die abgeleiteten Kanten je Netz, gemerkt am Netzobjekt.
 *
 * PAN UND ZOOM AENDERN NUR DEN VIEWPORT, nicht die Topologie — die
 * Kantenableitung ist der einzige nennenswerte Rechenschritt dieser Lage und
 * liefe sonst bei jedem Frame ueber einige zehntausend Elemente. Eine `WeakMap`
 * und kein Feld im Modul: ein weggeworfenes Netz soll auch den Cache mitnehmen.
 */
const EDGE_CACHE = new WeakMap<CrossSectionFEMesh, Uint32Array>();

/** Knoten je Element, je Elementtyp. */
function elementWidth(kind: CrossSectionFEMesh['kind']): number {
  switch (kind) {
    case 'tri3':
      return 3;
    case 'tri6':
      return 6;
    default:
      return assertNever(kind);
  }
}

export function feSpecs(
  mesh: CrossSectionFEMesh | undefined,
  style: Required<CrossSectionStyle>,
): readonly Spec[] {
  if (mesh === undefined) return [];

  const segments = edgesOf(mesh);
  // Ein Netz ohne Elemente ist kein Fehler, aber auch keine Zeichnung —
  // `SegmentSetSpec` verlangt mindestens eine Strecke.
  if (segments.length === 0) return [];

  return [
    {
      kind: 'segmentSet',
      id: 'cross-section:fe:wireframe',
      layer: FE_LAYER,
      // OHNE KOPIE: die Punkte liegen schon so, wie der Spec sie liest.
      points: mesh.points,
      segments,
      strokeColor: style.feColor,
      strokeWidth: style.feWidthPx,
    },
  ];
}

/**
 * Die drei ungerichteten Eckkanten je Element, jede genau einmal.
 *
 * NUR DIE ECKEN, AUCH BEI TRI6. Ein Tri6 aus Triangle hat die veroeffentlichte
 * Knotenreihenfolge `[v0, v1, v2, m01, m12, m20]`; seine Kanten bleiben
 * geometrisch gerade und die Mittelknoten liegen exakt in deren Mitten. Fuer
 * die DARSTELLUNG traegt ein Mittelknoten deshalb nichts bei — er verdoppelte
 * nur die Streckenzahl.
 *
 * KANONISIERT MIT `min`/`max`: eine von zwei Elementen geteilte Kante laeuft in
 * den beiden Elementen gegenlaeufig. Ohne die Normierung stuende sie zweimal im
 * Puffer, und ein halbtransparenter Strich saehe an jeder Innenkante dunkler
 * aus als am Rand.
 */
function edgesOf(mesh: CrossSectionFEMesh): Uint32Array {
  const cached = EDGE_CACHE.get(mesh);
  if (cached !== undefined) return cached;

  const width = elementWidth(mesh.kind);
  const { elements } = mesh;
  // EIN FEHLERHAFTES NETZ IST EINE GEBROCHENE VORBEDINGUNG und wird nicht still
  // weggezeichnet — anders als der bewusst fehlertolerante Wandgraph, der
  // waehrend der Eingabe unfertig sein DARF. Ein Netz dagegen ist ein
  // Rechenergebnis: passt es nicht zu seinem eigenen `kind`, stimmt etwas an
  // der Rechnung und nicht an der Zeichnung.
  if (elements.length % width !== 0) {
    throw new InvalidFEMeshError(mesh.kind, width, elements.length);
  }

  const seen = new Set<number>();
  const segments: number[] = [];
  const pointCount = mesh.points.length / 2;

  for (let offset = 0; offset < elements.length; offset += width) {
    const v0 = elements[offset];
    const v1 = elements[offset + 1];
    const v2 = elements[offset + 2];
    for (const [a, b] of [
      [v0, v1],
      [v1, v2],
      [v2, v0],
    ] as const) {
      const low = Math.min(a, b);
      const high = Math.max(a, b);
      // Ein Paar in EINE Zahl: `Set<string>` waere je Kante ein String, und bei
      // einigen zehntausend Kanten ist das der teuerste Teil der Schleife.
      const key = low * pointCount + high;
      if (seen.has(key)) continue;
      seen.add(key);
      segments.push(low, high);
    }
  }

  const edges = Uint32Array.from(segments);
  EDGE_CACHE.set(mesh, edges);
  return edges;
}
