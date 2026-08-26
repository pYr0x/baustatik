import { atOrThrow } from '@baustatik/core';
import type { FEStressField, StressAtNode } from '@baustatik/cross-section-fe';
import type { Mesh2DResult } from '@baustatik/mesh-2d-wasm';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  DIVERGING_SCALE,
  SEQUENTIAL_SCALE,
  sampleColor,
  type ColorScale,
} from './stress-colormaps';

/**
 * Das Spannungsrelief: σ, |τ| und σv als DREI Höhenfelder über dem
 * Querschnitt, nebeneinander in einer Szene.
 *
 * WARUM EIN RELIEF UND NICHT NUR FARBIGE FLÄCHEN: die Farbe wiederholt nur
 * das Bild der SVG-Karten; die Höhe bringt die zweite Dimension dazu, die im
 * Plan unsichtbar bleibt — WIE die Spannung verteilt ist, als gebirgige
 * Fläche, mit der Nulllinie des σ als Tal zwischen Druck- und Zugberg. Höhe
 * und Farbe sind dieselbe Zahl, verschieden skaliert; es wird nichts erfunden.
 *
 * MORPHING: Bei jeder neuen Auswertung (Schnittgrößen, Modus) wandern die
 * Höhen weich auf ihre Ziele — die Topologie bleibt dabei dieselbe, nur die
 * Z-Koordinaten und Farben ziehen um. Ein Preset- oder Netzdichtewechsel
 * ändert die Knotenzahl und baut die Geometrie neu; auch dann wächst das
 * neue Relief flach aus dem Umriss heraus.
 *
 * KLICKEN UND STREIFEN: Raycasting auf die Flächen; der Streifer zeigt Wert
 * und Ort als Tooltip, ein Klick fixiert ihn und schreibt die volle Zeile —
 * σ, τ-Komponenten, |τ|, σv — ins Infofeld unter der Szene.
 *
 * Koordinaten wie im Schwesterviewer: Welt-X = Querschnitt-y, Welt-Y =
 * −Querschnitt-z (Obergurt oben), Welt-Z = Reliefhöhe. Alles in mm.
 */

export type ReliefEvalMode = 'nodes' | 'elements';

type StressSample = Pick<
  StressAtNode,
  'nr' | 'y' | 'z' | 'sigma' | 'tauY' | 'tauZ' | 'sigmaV'
>;

type QuantityKey = 'sigma' | 'tau' | 'sigmav';

type QuantitySpec = {
  readonly key: QuantityKey;
  readonly label: string;
  readonly scale: ColorScale;
};

const QUANTITIES: readonly QuantitySpec[] = [
  { key: 'sigma', label: '\u03c3', scale: DIVERGING_SCALE },
  { key: 'tau', label: '|\u03c4|', scale: SEQUENTIAL_SCALE },
  { key: 'sigmav', label: '\u03c3v', scale: SEQUENTIAL_SCALE },
];

/** Die vier Subdreiecke eines Tri6 in Knotenindizes [v0,v1,v2,m01,m12,m20]. */
const SUB_TRIANGLES: ReadonlyArray<readonly [number, number, number]> =
  Object.freeze([
    [0, 3, 5],
    [3, 1, 4],
    [5, 4, 2],
    [3, 4, 5],
  ]);

/** Die sechs Punkte eines Tri6 im Umlauf. */
const PERIMETER = [0, 3, 1, 4, 2, 5] as const;

/** Morphgeschwindigkeit je Frame — groß genug, klein genug fürs Auge. */
const MORPH_K = 0.16;

function valueOf(sample: StressSample, key: QuantityKey): number {
  switch (key) {
    case 'sigma':
      return sample.sigma;
    case 'tau':
      return Math.hypot(sample.tauY, sample.tauZ);
    case 'sigmav':
      return sample.sigmaV;
  }
}

function fmt(value: number, digits = 2): string {
  return value.toFixed(digits).replace('.', ',');
}

// ---------------------------------------------------------------------------
// Der Vertexstrom beider Modi durch EINEN Emittenten:
// KNOTENMODUS — vier Subdreiecke je Tri6, Eckwerte = Knotenwerte (dieselbe
//   Form wie im SVG, jetzt mit Höhen).
// ELEMENTMODUS — ein Fächer um den Elementschwerpunkt, alle Ecken auf dem
//   Schwerpunktwert: die Platte liegt flach in ihrer eigenen Höhe, und die
//   Stufen zwischen den Platten SIND der Elementsprung, ungeglättet.
//
// Der Emittent liefert Dreiecke als Slots in den Strom, die echten
// Kantenpaare (über Node-IDs entdoppelt) und den ersten Slot je Node-ID —
// daran kleben später die schwarzen Kantenlinien.
// ---------------------------------------------------------------------------

type VertSink = {
  push(
    nodeId: number,
    sy: number,
    sz: number,
    nr: number,
    value: number,
  ): number;
};

type Emitted = {
  readonly triangles: ReadonlyArray<readonly [number, number, number]>;
  readonly edgeNodePairs: ReadonlyArray<readonly [number, number]>;
  readonly slotByNode: ReadonlyMap<number, number>;
};

function emit(
  field: FEStressField,
  mesh: Mesh2DResult,
  mode: ReliefEvalMode,
  key: QuantityKey,
  sink: VertSink,
): Emitted {
  const nodes = field.nodes;
  const elementCount = mesh.elements.length / 6;
  const triangles: [number, number, number][] = [];
  const seenEdges = new Set<string>();
  const edgeNodePairs: [number, number][] = [];
  const slotByNode = new Map<number, number>();

  const track = (nodeId: number, slot: number): void => {
    if (!slotByNode.has(nodeId)) slotByNode.set(nodeId, slot);
  };
  const addEdge = (na: number, nb: number): void => {
    const key = na < nb ? `${na}:${nb}` : `${nb}:${na}`;
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    edgeNodePairs.push([na, nb]);
  };

  for (let element = 0; element < elementCount; element += 1) {
    const base = element * 6;

    const perimeterPairs = (): void => {
      for (let k = 0; k < PERIMETER.length; k += 1) {
        addEdge(
          atOrThrow(mesh.elements, base + atOrThrow(PERIMETER, k)),
          atOrThrow(
            mesh.elements,
            base + atOrThrow(PERIMETER, (k + 1) % PERIMETER.length),
          ),
        );
      }
    };

    if (mode === 'nodes') {
      const corner = (indexOffset: number): number => {
        const nodeId = atOrThrow(mesh.elements, base + indexOffset);
        const node = atOrThrow(nodes, nodeId);
        const slot = sink.push(
          nodeId,
          node.y,
          node.z,
          nodeId,
          valueOf(node, key),
        );
        track(nodeId, slot);
        return slot;
      };
      for (const [a, b, c] of SUB_TRIANGLES) {
        triangles.push([corner(a), corner(b), corner(c)]);
      }
      perimeterPairs();
    } else {
      const sample = field.elements[element];
      if (sample === undefined) continue;
      const value = valueOf(sample, key);
      // Fächer um den Schwerpunkt — alle Ecken tragen denselben Wert.
      const center = sink.push(-1, sample.y, sample.z, sample.nr, value);
      const rim: number[] = [];
      for (const offset of PERIMETER) {
        const nodeId = atOrThrow(mesh.elements, base + offset);
        const node = atOrThrow(nodes, nodeId);
        const slot = sink.push(nodeId, node.y, node.z, sample.nr, value);
        rim.push(slot);
        track(nodeId, slot);
      }
      for (let k = 0; k < rim.length; k += 1) {
        triangles.push([center, rim[k]!, rim[(k + 1) % rim.length]!]);
      }
      perimeterPairs();
    }
  }

  return { triangles, edgeNodePairs, slotByNode };
}

// ---------------------------------------------------------------------------

type SurfaceRuntime = {
  readonly spec: QuantitySpec;
  group: THREE.Group;
  mesh?: THREE.Mesh;
  geo?: THREE.BufferGeometry;
  posAttr?: THREE.BufferAttribute;
  colAttr?: THREE.BufferAttribute;
  edges?: THREE.LineSegments;
  edgeGeo?: THREE.BufferGeometry;
  edgePosAttr?: THREE.BufferAttribute;
  sprite?: THREE.Sprite;
  /** Slot-Paare in die Positionsattribute — die Linien kleben am Morph. */
  edgeSlots: Int32Array;
  targetPos: Float64Array;
  targetCol: Float64Array;
  metaNr: Int32Array;
  metaY: Float64Array;
  metaZ: Float64Array;
  metaVal: Float64Array;
  range: { min: number; max: number };
  maxAbs: number;
  offsetX: number;
  settled: boolean;
};

export type StressFeReliefOptions = {
  readonly host: HTMLElement;
  readonly infoHost: HTMLElement;
};

export type StressFeRelief = {
  setData(field: FEStressField, mesh: Mesh2DResult): void;
  refresh(mode: ReliefEvalMode): void;
  setEdgesVisible(visible: boolean): void;
  dispose(): void;
};

export function createStressFeRelief(
  options: StressFeReliefOptions,
): StressFeRelief {
  const { host, infoHost } = options;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 1, 40000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setClearColor('#eef2f7');
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.cursor = 'grab';
  host.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.9;

  // Tooltip IM Modell — derselbe Grundgedanke wie im Schwesterviewer: Werte
  // am Objekt, nicht als Sprung irgendwo auf der Seite.
  const tooltip = document.createElement('div');
  tooltip.style.cssText =
    'position:absolute;pointer-events:none;display:none;z-index:2;' +
    'background:rgba(15,23,42,.92);color:#fff;padding:.3rem .55rem;' +
    'border-radius:4px;font-family:ui-monospace,Menlo,Consolas,monospace;' +
    'font-size:.72rem;line-height:1.45;white-space:pre;';
  host.appendChild(tooltip);

  const root = new THREE.Group();
  scene.add(root);

  const grid = new THREE.GridHelper(6000, 30, '#cbd5e1', '#e2e8f0');
  scene.add(grid);

  const surfaces: SurfaceRuntime[] = QUANTITIES.map((spec) => ({
    spec,
    group: new THREE.Group(),
    targetPos: new Float64Array(0),
    targetCol: new Float64Array(0),
    edgeSlots: new Int32Array(0),
    metaNr: new Int32Array(0),
    metaY: new Float64Array(0),
    metaZ: new Float64Array(0),
    metaVal: new Float64Array(0),
    range: { min: 0, max: 0 },
    maxAbs: 1,
    offsetX: 0,
    settled: true,
  }));
  for (const rt of surfaces) root.add(rt.group);

  const hoverMarker = new THREE.Mesh(
    new THREE.SphereGeometry(6, 16, 12),
    new THREE.MeshBasicMaterial({ color: '#2563eb' }),
  );
  const pinMarker = new THREE.Mesh(
    new THREE.SphereGeometry(7, 16, 12),
    new THREE.MeshBasicMaterial({ color: '#dc2626' }),
  );
  hoverMarker.visible = false;
  pinMarker.visible = false;
  scene.add(hoverMarker, pinMarker);

  let field: FEStressField | null = null;
  let mesh: Mesh2DResult | null = null;
  let mode: ReliefEvalMode = 'nodes';
  let builtMode: ReliefEvalMode | null = null;
  let topologyDirty = true;
  let edgesVisible = false;
  let span = 100;
  let reliefHeight = 80;
  let sectionTopWorldY = 0;
  let sectionBottomWorldY = 0;

  function clearSurfaces(): void {
    for (const rt of surfaces) {
      rt.group.clear();
      rt.geo?.dispose();
      rt.edgeGeo?.dispose();
      rt.mesh = undefined;
      rt.edges = undefined;
      rt.geo = undefined;
      rt.posAttr = undefined;
      rt.colAttr = undefined;
      rt.edgeGeo = undefined;
      rt.edgePosAttr = undefined;
      rt.edgeSlots = new Int32Array(0);
      rt.settled = true;
    }
    hoverMarker.visible = false;
    pinMarker.visible = false;
  }

  /** Ein Label-Sprite aus Canvas — Text, der mit der Kamera mitdreht. */
  function makeLabel(text: string, x: number, y: number): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx !== null) {
      ctx.font = '700 88px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#334155';
      ctx.fillText(text, 128, 68);
    }
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(canvas),
        depthTest: false,
        transparent: true,
      }),
    );
    sprite.scale.set(span * 0.34, span * 0.17, 1);
    sprite.position.set(x, y, 0);
    return sprite;
  }

  /** Baut die Topologie des AKTUELLEN Modus neu — flach, Höhe kommt per Morph. */
  function rebuildTopology(): void {
    if (field === null || mesh === null) return;
    builtMode = mode;
    topologyDirty = false;
    clearSurfaces();

    let yMin = Infinity;
    let yMax = -Infinity;
    let zMin = Infinity;
    let zMax = -Infinity;
    for (const node of field.nodes) {
      if (node.y < yMin) yMin = node.y;
      if (node.y > yMax) yMax = node.y;
      if (node.z < zMin) zMin = node.z;
      if (node.z > zMax) zMax = node.z;
    }
    span = Math.max(yMax - yMin, zMax - zMin, 10);
    reliefHeight = span * 0.85;
    sectionTopWorldY = -zMin;
    sectionBottomWorldY = -zMax;
    const surfWidth = Math.max(yMax - yMin, 10);
    const gap = span * 0.62;
    surfaces[0]!.offsetX = -(surfWidth + gap);
    surfaces[1]!.offsetX = 0;
    surfaces[2]!.offsetX = surfWidth + gap;

    for (const rt of surfaces) {
      // Erster Durchgang: Vertexzahl zählen.
      let count = 0;
      emit(field, mesh, mode, rt.spec.key, {
        push: () => (count++, count - 1),
      });

      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const metaNr = new Int32Array(count);
      const metaY = new Float64Array(count);
      const metaZ = new Float64Array(count);
      const metaVal = new Float64Array(count);
      let slot = 0;
      const emitted = emit(field, mesh, mode, rt.spec.key, {
        push: (nodeId, sy, sz, nr, value) => {
          const i = slot++;
          // FLACH: Höhe 0, neutrale Mitte — beides zieht per Morph aufs Ziel,
          // die Fläche wächst beim Laden aus dem Umriss heraus.
          positions[i * 3] = rt.offsetX + sy;
          positions[i * 3 + 1] = -sz;
          positions[i * 3 + 2] = 0;
          const c = new THREE.Color(sampleColor(rt.spec.scale.stops, 0.5));
          colors[i * 3] = c.r;
          colors[i * 3 + 1] = c.g;
          colors[i * 3 + 2] = c.b;
          metaNr[i] = nr;
          metaY[i] = sy;
          metaZ[i] = sz;
          metaVal[i] = value;
          return i;
        },
      });

      const indices = new Uint32Array(emitted.triangles.length * 3);
      emitted.triangles.forEach((tri, t) => {
        indices[t * 3] = tri[0];
        indices[t * 3 + 1] = tri[1];
        indices[t * 3 + 2] = tri[2];
      });

      const geo = new THREE.BufferGeometry();
      const posAttr = new THREE.BufferAttribute(positions, 3);
      const colAttr = new THREE.BufferAttribute(colors, 3);
      posAttr.setUsage(THREE.DynamicDrawUsage);
      colAttr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', posAttr);
      geo.setAttribute('color', colAttr);
      geo.setIndex(new THREE.BufferAttribute(indices, 1));
      const surfaceMesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          vertexColors: true,
          side: THREE.DoubleSide,
        }),
      );
      rt.group.add(surfaceMesh);
      rt.geo = geo;
      rt.posAttr = posAttr;
      rt.colAttr = colAttr;
      rt.mesh = surfaceMesh;

      // Die echten Tri6-Kanten als schwarze Linien auf den Scheitel-Slots —
      // sie werden pro Frame aus denselben Positionen nachgezogen und kleben
      // damit am Morph.
      const pairCount = emitted.edgeNodePairs.length;
      const edgeSlots = new Int32Array(pairCount * 2);
      let written = 0;
      for (const [na, nb] of emitted.edgeNodePairs) {
        const sa = emitted.slotByNode.get(na);
        const sb = emitted.slotByNode.get(nb);
        if (sa === undefined || sb === undefined) continue;
        edgeSlots[written * 2] = sa;
        edgeSlots[written * 2 + 1] = sb;
        written += 1;
      }
      const edgeGeo = new THREE.BufferGeometry();
      const edgePosAttr = new THREE.BufferAttribute(
        new Float32Array(written * 6),
        3,
      );
      edgePosAttr.setUsage(THREE.DynamicDrawUsage);
      edgeGeo.setAttribute('position', edgePosAttr);
      const edges = new THREE.LineSegments(
        edgeGeo,
        new THREE.LineBasicMaterial({
          color: '#000000',
          transparent: true,
          opacity: 0.38,
        }),
      );
      edges.visible = edgesVisible;
      rt.group.add(edges);
      rt.edges = edges;
      rt.edgeGeo = edgeGeo;
      rt.edgePosAttr = edgePosAttr;
      rt.edgeSlots = edgeSlots.slice(0, written * 2);

      rt.targetPos = new Float64Array(count * 3);
      rt.targetCol = new Float64Array(count * 3);
      rt.metaNr = metaNr;
      rt.metaY = metaY;
      rt.metaZ = metaZ;
      rt.metaVal = metaVal;

      // Grundriss: der Rand in Höhe 0 — die Silhouette der Figur.
      const outlinePositions: number[] = [];
      for (let s = 0; s < mesh.boundarySegments.length; s += 2) {
        const a = atOrThrow(field.nodes, atOrThrow(mesh.boundarySegments, s));
        const b = atOrThrow(
          field.nodes,
          atOrThrow(mesh.boundarySegments, s + 1),
        );
        outlinePositions.push(
          rt.offsetX + a.y,
          -a.z,
          0,
          rt.offsetX + b.y,
          -b.z,
          0,
        );
      }
      const outlineGeo = new THREE.BufferGeometry();
      outlineGeo.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(outlinePositions), 3),
      );
      rt.group.add(
        new THREE.LineSegments(
          outlineGeo,
          new THREE.LineBasicMaterial({ color: '#0f172a' }),
        ),
      );

      rt.sprite = makeLabel(
        rt.spec.label,
        rt.offsetX,
        sectionTopWorldY + reliefHeight + span * 0.14,
      );
      rt.group.add(rt.sprite);
    }

    grid.position.y = sectionBottomWorldY - span * 0.08;
    fitCamera();
  }

  function fitCamera(): void {
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const distance =
      Math.max(size.x, size.y, size.z) * 1.45 + reliefHeight + span * 0.5;
    camera.position.set(center.x, center.y - distance * 0.55, distance);
    controls.target.copy(center);
    controls.update();
  }

  function computeTargets(): void {
    if (field === null || mesh === null) return;
    const samples: readonly StressSample[] =
      mode === 'nodes' ? field.nodes : field.elements;
    for (const rt of surfaces) {
      let min = Infinity;
      let max = -Infinity;
      for (const sample of samples) {
        const v = valueOf(sample, rt.spec.key);
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (!Number.isFinite(min)) {
        min = 0;
        max = 0;
      }
      rt.range = { min, max };
      // maxAbs mindestens epsilon: eine Nullspanne darf keine NaN-Höhe bauen.
      rt.maxAbs = Math.max(Math.abs(min), Math.abs(max), 1e-12);

      for (let i = 0; i < rt.metaVal.length; i += 1) {
        const value = atOrThrow(rt.metaVal, i);
        const height =
          rt.spec.key === 'sigma'
            ? (value / rt.maxAbs) * reliefHeight
            : (Math.max(value, 0) / Math.max(max, 1e-12)) * reliefHeight;
        rt.targetPos[i * 3] = rt.offsetX + atOrThrow(rt.metaY, i);
        rt.targetPos[i * 3 + 1] = -atOrThrow(rt.metaZ, i);
        rt.targetPos[i * 3 + 2] = height;
        const c = new THREE.Color(
          sampleColor(
            rt.spec.scale.stops,
            rt.spec.scale.normalize(value, rt.range),
          ),
        );
        rt.targetCol[i * 3] = c.r;
        rt.targetCol[i * 3 + 1] = c.g;
        rt.targetCol[i * 3 + 2] = c.b;
      }
      rt.settled = false;
    }
  }

  function lerpSurfaces(): boolean {
    let moving = false;
    for (const rt of surfaces) {
      if (rt.settled || rt.posAttr === undefined || rt.colAttr === undefined)
        continue;
      const pos = rt.posAttr.array as Float32Array;
      const col = rt.colAttr.array as Float32Array;
      let surfaceMoving = false;
      for (let i = 0; i < pos.length; i += 1) {
        const d = rt.targetPos[i]! - pos[i]!;
        if (Math.abs(d) > 1e-3 * reliefHeight * 0.01) {
          pos[i] += d * MORPH_K;
          surfaceMoving = true;
        } else {
          pos[i] = rt.targetPos[i]!;
        }
      }
      for (let i = 0; i < col.length; i += 1) {
        const d = rt.targetCol[i]! - col[i]!;
        if (Math.abs(d) > 0.002) {
          col[i] += d * MORPH_K;
          surfaceMoving = true;
        } else {
          col[i] = rt.targetCol[i]!;
        }
      }
      if (!surfaceMoving) rt.settled = true;
      moving = moving || surfaceMoving;
      rt.posAttr.needsUpdate = true;
      rt.colAttr.needsUpdate = true;

      // Die Kantenlinien von denselben Positionen nachziehen.
      if (rt.edgePosAttr !== undefined && rt.edgeSlots.length > 0) {
        const ep = rt.edgePosAttr.array as Float32Array;
        for (let e = 0; e < rt.edgeSlots.length; e += 1) {
          const src = rt.edgeSlots[e]! * 3;
          ep[e * 3] = pos[src]!;
          ep[e * 3 + 1] = pos[src + 1]!;
          ep[e * 3 + 2] = pos[src + 2]!;
        }
        rt.edgePosAttr.needsUpdate = true;
      }
    }
    return moving;
  }

  function resize(): void {
    const w = host.clientWidth;
    const h = Math.max(host.clientHeight, 1);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(() => resize());
  observer.observe(host);
  resize();

  // --- Picking -------------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  let pointerClientX = 0;
  let pointerClientY = 0;
  let pointerInside = false;
  let downX = 0;
  let downY = 0;

  function readNdc(event: PointerEvent): void {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNdc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    pointerClientX = event.clientX;
    pointerClientY = event.clientY;
  }

  interface Hit {
    readonly rt: SurfaceRuntime;
    readonly slot: number;
    readonly point: THREE.Vector3;
  }

  function activeMeshes(): THREE.Mesh[] {
    const list: THREE.Mesh[] = [];
    for (const rt of surfaces) if (rt.mesh !== undefined) list.push(rt.mesh);
    return list;
  }

  function pick(): Hit | null {
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObjects(activeMeshes(), false);
    const hit = hits[0];
    if (hit === undefined || hit.face === null) return null;
    const rt = surfaces.find((s) => s.mesh === hit.object);
    if (rt === undefined) return null;
    const base = (hit.faceIndex ?? 0) * 3;
    // Der dem Treffer nächste Scheitel des getroffenen Dreiecks — fürs
    // Tooltip genau genug; die volle Zeile kommt ohnehin über die Nummer.
    let best = base;
    let bestDist = Infinity;
    for (let k = 0; k < 3; k += 1) {
      const slot = base + k;
      const dx = atOrThrow(rt.metaY, slot) + rt.offsetX - hit.point.x;
      const dy = -atOrThrow(rt.metaZ, slot) - hit.point.y;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = slot;
      }
    }
    return { rt, slot: best, point: hit.point.clone() };
  }

  renderer.domElement.addEventListener('pointermove', (event) => {
    readNdc(event);
    pointerInside = true;
  });
  renderer.domElement.addEventListener('pointerleave', () => {
    pointerInside = false;
    hoverMarker.visible = false;
    tooltip.style.display = 'none';
  });
  renderer.domElement.addEventListener('pointerdown', (event) => {
    downX = event.clientX;
    downY = event.clientY;
    controls.autoRotate = false;
  });
  renderer.domElement.addEventListener('pointerup', (event) => {
    // Ein DRAG ist keine Auswahl — erst unter wenigen Pixeln klickt es.
    if (Math.hypot(event.clientX - downX, event.clientY - downY) > 6) return;
    readNdc(event);
    const hit = pick();
    if (hit === null) return;
    pinMarker.position.copy(hit.point);
    pinMarker.visible = true;
    infoHost.innerHTML = `<strong>${hit.rt.spec.label}-Fl\u00e4che fixiert</strong> \u2014 ${fullRowText(atOrThrow(hit.rt.metaNr, hit.slot))}`;
  });

  function fullRowText(nr: number): string {
    if (field === null) return '';
    const rows: readonly StressSample[] =
      mode === 'nodes' ? field.nodes : field.elements;
    const row = rows.find((r) => r.nr === nr);
    if (row === undefined) return '';
    return [
      `${mode === 'nodes' ? 'Knoten' : 'Element'} Nr. ${row.nr} \u00b7 y = ${fmt(row.y, 1)} mm, z = ${fmt(row.z, 1)} mm`,
      `\u03c3 = ${fmt(row.sigma)} N/mm\u00b2`,
      `\u03c4 = (${fmt(row.tauY)}, ${fmt(row.tauZ)}) \u2192 |\u03c4| = ${fmt(Math.hypot(row.tauY, row.tauZ))} N/mm\u00b2`,
      `\u03c3v = ${fmt(row.sigmaV)} N/mm\u00b2`,
    ].join('<br>');
  }

  // --- Schleife ------------------------------------------------------------
  let raf = 0;
  function tick(): void {
    raf = requestAnimationFrame(tick);
    lerpSurfaces();
    if (pointerInside && !topologyDirty) {
      const hit = pick();
      if (hit === null) {
        hoverMarker.visible = false;
        tooltip.style.display = 'none';
        renderer.domElement.style.cursor = 'grab';
      } else {
        hoverMarker.position.copy(hit.point);
        hoverMarker.visible = true;
        renderer.domElement.style.cursor = 'pointer';
        tooltip.textContent =
          `${hit.rt.spec.label} = ${fmt(atOrThrow(hit.rt.metaVal, hit.slot))} N/mm\u00b2\n` +
          `${mode === 'nodes' ? 'Knoten' : 'Element'} Nr. ${atOrThrow(hit.rt.metaNr, hit.slot)} \u00b7 y ${fmt(atOrThrow(hit.rt.metaY, hit.slot), 1)}, z ${fmt(atOrThrow(hit.rt.metaZ, hit.slot), 1)} mm`;
        tooltip.style.display = 'block';
        const rect = renderer.domElement.getBoundingClientRect();
        tooltip.style.left = `${Math.min(pointerClientX - rect.left + 14, rect.width - 180)}px`;
        tooltip.style.top = `${Math.max(pointerClientY - rect.top - 52, 4)}px`;
      }
    }
    controls.update();
    renderer.render(scene, camera);
  }
  tick();

  // --- Öffentliche Türen ---------------------------------------------------

  return {
    setData(nextField, nextMesh) {
      const topologyChanged =
        field === null ||
        mesh === null ||
        nextMesh !== mesh ||
        nextMesh.elements.length !== mesh.elements.length ||
        nextField.nodes.length !== (field?.nodes.length ?? -1);
      field = nextField;
      mesh = nextMesh;
      if (topologyChanged) topologyDirty = true;
      if (topologyDirty || builtMode !== mode) rebuildTopology();
      computeTargets();
    },
    refresh(nextMode) {
      mode = nextMode;
      if (
        field === null ||
        mesh === null ||
        topologyDirty ||
        builtMode !== mode
      ) {
        rebuildTopology();
      }
      computeTargets();
    },
    setEdgesVisible(visible) {
      edgesVisible = visible;
      for (const rt of surfaces) {
        if (rt.edges !== undefined) rt.edges.visible = visible;
      }
    },
    dispose() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      tooltip.remove();
    },
  };
}
