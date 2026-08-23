import { type StressPoint } from '@baustatik/cross-section';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * 3D-Spannungsbild des dünnwandigen I-Querschnitts mit three.js.
 *
 * Das Modell zeigt die fünf Wandelemente des Wandmodells als extrudierte
 * Bleche entlang der Stabachse. Die Farbe ist über die Dicke `t` KONSTANT und
 * wird nur LAENGS der Wand aus den Spannungspunkten aufgebaut:
 *
 *   - σ linear — sie ist über die Höhe exakt linear;
 *   - τ als PARABEL durch die drei vorzeichenbehafteten Werte des Elements.
 *     `S(s)` ist im Wandmodell auf jedem Element ein Polynom zweiten Grades,
 *     bei konstantem `t` also auch der Schubfluss — drei Stationen legen ihn
 *     exakt fest, und das Vorzeichenwechselbild (Spitze -> Steg) entsteht,
 *     statt es durch Interpolation der Beträge zu glätten;
 *   - σv aus den beiden Feldern komponiert: sqrt(σ² + 3τ²).
 *
 * Jede Dicke-Farbvariation wäre eine zweite Maschine für eine Frage, die die
 * Spannungspunkte so nicht beantworten.
 *
 * Koordinaten: Welt-X = Querschnitt-y, Welt-Y = −Querschnitt-z (Obergurt oben,
 * wie im SVG), Welt-Z = Stabachse zur Kamera. Alles in mm.
 */

/** Eine Spannungsauswertung je Punkt — strukturell die Zeile aus stress.ts. */
export type PointStressValue = {
  readonly point: StressPoint;
  readonly sigma: number;
  readonly tau: number;
  readonly sigmaV: number;
};

export type Viewer3dQuantity = 'sigma' | 'tau' | 'sigmav';

export type IShapeDims = {
  readonly h: number;
  readonly b: number;
  readonly tw: number;
  readonly tf: number;
};

export type StressViewer3dOptions = {
  readonly host: HTMLElement;
  readonly legendBar: HTMLElement;
  readonly legendMin: HTMLElement;
  readonly legendMid: HTMLElement;
  readonly legendMax: HTMLElement;
  /**
   * Container fuer das Hover-Tooltip. Die Werte werden IM 3D-Modell gezeigt
   * und nicht ueber die Tabellen-Auswahl synchronisiert: ein `scrollIntoView`
   * mitten im Drehen waere ein Sprung, den der Betrachter nicht verlangt hat.
   */
  readonly tooltipHost: HTMLElement;
};

export type StressViewer3d = {
  /** Baut die Wände und Marker neu und färbt sie nach `quantity` ein. */
  update(
    dims: IShapeDims,
    points: readonly PointStressValue[],
    quantity: Viewer3dQuantity,
  ): void;
  setActive(pointNr: number | null): void;
  dispose(): void;
};

// Kalt->heiss für Beträge (|τ|, σv), divergierend um 0 für σ. Dieselben
// Stopps zeichnen auch die HTML-Legende, damit Bar und Modell nie auseinanderlaufen.
const SEQUENTIAL_STOPS = [
  '#2c7bb6',
  '#abd9e9',
  '#ffffbf',
  '#fdae61',
  '#d7191c',
] as const;
const DIVERGING_STOPS = [
  '#1d4ed8',
  '#93c5fd',
  '#f8fafc',
  '#fca5a5',
  '#b91c1c',
] as const;

const MARKER_COLOR = new THREE.Color('#2563eb');
const MARKER_ACTIVE_COLOR = new THREE.Color('#ea580c');

function rampColor(stops: readonly string[], t: number): THREE.Color {
  const clamped = Math.min(1, Math.max(0, t));
  const scaled = clamped * (stops.length - 1);
  const i0 = Math.min(Math.floor(scaled), stops.length - 2);
  const f = scaled - i0;
  const a = new THREE.Color(`${stops[i0]}`);
  const b = new THREE.Color(`${stops[i0 + 1]}`);
  return a.lerp(b, f);
}

function cssGradient(stops: readonly string[]): string {
  const parts = stops.map(
    (s, i) => `${s} ${((i / (stops.length - 1)) * 100).toFixed(1)}%`,
  );
  return `linear-gradient(to right, ${parts.join(', ')})`;
}

type Station = { readonly u: number; readonly v: number; readonly nr: number };

/** Stückweise lineare Interpolation über aufsteigend nach `u` sortierte Stationen. */
function linearField(stations: readonly Station[]): (u: number) => number {
  return (u: number) => {
    if (stations.length === 0) return 0;
    if (u <= stations[0].u) return stations[0].v;
    for (let i = 1; i < stations.length; i++) {
      if (u <= stations[i].u) {
        const a = stations[i - 1];
        const b = stations[i];
        const f = b.u === a.u ? 0 : (u - a.u) / (b.u - a.u);
        return a.v + f * (b.v - a.v);
      }
    }
    return stations[stations.length - 1].v;
  };
}

/**
 * Die Parabel durch GENAU DREI Stationen — die Lagrange-Form, ohne
 * Stützstellen-Extrapolation: außerhalb wird am Endwert geklemmt. Liefert null,
 * wenn die Stationen keine eindeutige Parabel tragen.
 */
function parabolaField(
  stations: readonly Station[],
): ((u: number) => number) | null {
  if (stations.length !== 3) return null;
  const [a, b, c] = [stations[0], stations[1], stations[2]];
  if (a.u === b.u || b.u === c.u || a.u === c.u) return null;
  return (u: number) => {
    if (u <= a.u) return a.v;
    if (u >= c.u) return c.v;
    const la = ((u - b.u) * (u - c.u)) / ((a.u - b.u) * (a.u - c.u));
    const lb = ((u - a.u) * (u - c.u)) / ((b.u - a.u) * (b.u - c.u));
    const lc = ((u - a.u) * (u - b.u)) / ((c.u - a.u) * (c.u - b.u));
    return a.v * la + b.v * lb + c.v * lc;
  };
}

type WallSpec = {
  readonly wallId: string;
  /** In-Plane-Ausdehnung in Weltkoordinaten [mm], [von, bis]. */
  readonly x: readonly [number, number];
  readonly y: readonly [number, number];
  /** Laufachse der Stationen: 'x' bei den Gurten, 'y' beim Steg. */
  readonly axis: 'x' | 'y';
};

/** Die Wandelemente des Wandmodells, gekachelt wie die Spannungspunkte (ADR 0053). */
function wallSpecs(d: IShapeDims): WallSpec[] {
  const zf = d.h / 2 - d.tf;
  return [
    {
      wallId: 'flange-top-left',
      x: [-d.b / 2, 0],
      y: [zf, d.h / 2],
      axis: 'x',
    },
    {
      wallId: 'flange-top-right',
      x: [0, d.b / 2],
      y: [zf, d.h / 2],
      axis: 'x',
    },
    { wallId: 'web', x: [-d.tw / 2, d.tw / 2], y: [-zf, zf], axis: 'y' },
    {
      wallId: 'flange-bottom-left',
      x: [-d.b / 2, 0],
      y: [-d.h / 2, -zf],
      axis: 'x',
    },
    {
      wallId: 'flange-bottom-right',
      x: [0, d.b / 2],
      y: [-d.h / 2, -zf],
      axis: 'x',
    },
  ];
}

export function createStressViewer3d(
  options: StressViewer3dOptions,
): StressViewer3d {
  const { host, legendBar, legendMin, legendMid, legendMax } = options;

  // Das Tooltip lebt im Container der Szene und folgt dem Zeiger; es zeigt
  // dieselben Spalten wie die Tabelle, damit das 3D-Modell fuer sich liest.
  const tooltip = document.createElement('div');
  tooltip.style.cssText = [
    'position: absolute',
    'display: none',
    'pointer-events: none',
    'background: rgba(15, 23, 42, 0.92)',
    'color: #f8fafc',
    'padding: 0.45rem 0.65rem',
    'border-radius: 6px',
    'font-family: Inter, ui-sans-serif, system-ui, sans-serif',
    'font-size: 0.74rem',
    'line-height: 1.45',
    'white-space: nowrap',
    'z-index: 10',
    'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25)',
  ].join(';');
  options.tooltipHost.appendChild(tooltip);

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch {
    host.textContent = 'WebGL steht in diesem Browser nicht zur Verfügung.';
    return { update() {}, setActive() {}, dispose() {} };
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(new THREE.Color('#eef2f7'));
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.touchAction = 'none';
  renderer.domElement.style.cursor = 'grab';
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 500);
  camera.position.set(160, 120, 260);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8dee9, 1.15));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.position.set(180, 260, 320);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.55);
  fill.position.set(-220, -80, 140);
  scene.add(fill);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  // Wurzeln: wallsGroup wird je update() komplett neu gebaut, markersGroup ebenso.
  const root = new THREE.Group();
  scene.add(root);

  type PickInfo =
    | { kind: 'marker'; nr: number }
    | { kind: 'wall'; axis: 'x' | 'y'; stations: { u: number; nr: number }[] };

  let span = 300;
  let extrusion = 200;
  let markerRadius = 5;

  const resizeObserver = new ResizeObserver(() => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  });
  resizeObserver.observe(host);

  let dragging = false;
  controls.addEventListener('start', () => {
    dragging = true;
  });
  controls.addEventListener('end', () => {
    dragging = false;
  });

  function clearRoot(): void {
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material))
          obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
    root.clear();
  }

  function frameCamera(): void {
    camera.near = span * 0.02;
    camera.far = span * 60;
    camera.position.set(span * 0.85, span * 0.6, span * 1.65);
    controls.target.set(0, 0, 0);
    camera.updateProjectionMatrix();
    controls.update();
  }

  // Nur das ERSTE update() richtet die Kamera ein; danach gehoert die Ansicht
  // dem Nutzer. Das Seiten-Skript rechnet bei jedem Tastenanschlag (entprellt)
  // neu — eine Kamera, die dabei jedes Mal zuruecksetzt, macht Drehen und
  // Zoomen waehrend der Eingabe unmoeglich.
  let cameraFramed = false;

  function applyStops(quantity: Viewer3dQuantity): readonly string[] {
    return quantity === 'sigma' ? DIVERGING_STOPS : SEQUENTIAL_STOPS;
  }

  function updateLegend(range: {
    lo: number;
    hi: number;
    stops: readonly string[];
  }): void {
    legendBar.style.background = cssGradient(range.stops);
    legendMin.textContent = `${range.lo.toFixed(1)} N/mm²`;
    legendMid.textContent = ((range.lo + range.hi) / 2).toFixed(1);
    legendMax.textContent = `${range.hi.toFixed(1)} N/mm²`;
  }

  type WallRun = {
    readonly spec: WallSpec;
    /** Der angezeigte Wert (σ bzw. |τ| bzw. σv) an der Laufkoordinate der Wand. */
    readonly field: (u: number) => number;
    readonly stations: readonly Station[];
  };

  function stationList(
    spec: WallSpec,
    points: readonly PointStressValue[],
    value: (r: PointStressValue) => number,
  ): Station[] {
    return points
      .filter((r) => r.point.wall === spec.wallId)
      .map((r) => ({
        // Welt-Y ist MINUS Querschnitt-z (Obergurt oben); die Stationen
        // muessen im selben System liegen wie die Vertex-Koordinaten, sonst
        // laeuft das Farbbild des Stegs vertikal verkehrt herum.
        u: spec.axis === 'x' ? r.point.y : -r.point.z,
        v: value(r),
        nr: r.point.nr,
      }))
      .sort((a, b) => a.u - b.u);
  }

  /**
   * Je Wand das Feld aus den Spannungspunkten: σ linear, τ durch die Parabel
   * der drei vorzeichenbehafteten Werte (Fallback: linear), σv komponiert.
   */
  function buildWallRuns(
    dims: IShapeDims,
    points: readonly PointStressValue[],
    quantity: Viewer3dQuantity,
  ): WallRun[] {
    return wallSpecs(dims).map((spec) => {
      const sigma = linearField(stationList(spec, points, (r) => r.sigma));
      const tauStations = stationList(spec, points, (r) => r.tau);
      const tauAt = parabolaField(tauStations) ?? linearField(tauStations);
      const field =
        quantity === 'sigma'
          ? sigma
          : quantity === 'tau'
            ? (u: number) => Math.abs(tauAt(u))
            : (u: number) => Math.hypot(sigma(u), Math.sqrt(3) * tauAt(u));
      const stations = stationList(
        spec,
        points,
        quantity === 'sigma'
          ? (r) => r.sigma
          : quantity === 'tau'
            ? (r) => Math.abs(r.tau)
            : (r) => r.sigmaV,
      );
      return { spec, field, stations };
    });
  }

  /**
   * Der Farbbereich wird über FEIN ABGETASTETE Felder bestimmt und nicht über
   * die Stützwerte: eine Parabel kann zwischen zwei Punkten über sie hinaus
   * wachsen, und Legende wie Farbabbildung müssen dieses Maximum sehen.
   */
  function colorRange(
    quantity: Viewer3dQuantity,
    runs: readonly WallRun[],
  ): { lo: number; hi: number; stops: readonly string[] } {
    let lo = Infinity;
    let hi = -Infinity;
    for (const run of runs) {
      const extent = run.spec.axis === 'x' ? run.spec.x : run.spec.y;
      const steps = 160;
      for (let i = 0; i <= steps; i++) {
        const v = run.field(extent[0] + ((extent[1] - extent[0]) * i) / steps);
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi))
      return { lo: -1, hi: 1, stops: applyStops(quantity) };
    if (quantity === 'sigma') {
      const bound = Math.max(Math.abs(lo), Math.abs(hi), 1e-9);
      return { lo: -bound, hi: bound, stops: DIVERGING_STOPS };
    }
    return { lo: 0, hi: Math.max(hi, 1e-9), stops: SEQUENTIAL_STOPS };
  }

  function buildWallMeshes(
    runs: readonly WallRun[],
    range: { lo: number; hi: number; stops: readonly string[] },
  ): void {
    const wallMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      // Kantenlinien liegen exakt auf der Boxflaeche; der Offset verhindert das Flimmern.
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });

    for (const run of runs) {
      const spec = run.spec;
      const sx = spec.x[1] - spec.x[0];
      const sy = spec.y[1] - spec.y[0];
      const cx = (spec.x[0] + spec.x[1]) / 2;
      const cy = (spec.y[0] + spec.y[1]) / 2;
      const runLength = spec.axis === 'x' ? sx : sy;
      const segments = Math.min(
        64,
        Math.max(4, Math.round((runLength / span) * 40)),
      );

      const geometry =
        spec.axis === 'x'
          ? new THREE.BoxGeometry(sx, sy, extrusion, segments, 1, 1)
          : new THREE.BoxGeometry(sx, sy, extrusion, 1, segments, 1);

      const positionAttr = geometry.getAttribute('position');
      const colors = new Float32Array(positionAttr.count * 3);
      for (let i = 0; i < positionAttr.count; i++) {
        const localU =
          spec.axis === 'x' ? positionAttr.getX(i) : positionAttr.getY(i);
        const worldU = localU + (spec.axis === 'x' ? cx : cy);
        const v = run.field(worldU);
        const t = (v - range.lo) / (range.hi - range.lo);
        rampColor(range.stops, t).toArray(colors, i * 3);
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      const mesh = new THREE.Mesh(geometry, wallMaterial);
      mesh.position.set(cx, cy, 0);
      mesh.userData.pick = {
        kind: 'wall',
        axis: spec.axis,
        stations: [...run.stations],
      } satisfies PickInfo;
      root.add(mesh);

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: 0x334155 }),
      );
      edges.position.copy(mesh.position);
      root.add(edges);
    }
  }

  let currentPoints: readonly PointStressValue[] = [];
  let activeNr: number | null = null;
  let hoveredNr: number | null = null;

  let markerMeshes: THREE.Mesh[] = [];

  function refreshMarkers(): void {
    for (const marker of markerMeshes) {
      const material = marker.material as THREE.MeshLambertMaterial;
      const nr = marker.userData.nr as number;
      if (nr === activeNr) {
        material.color.copy(MARKER_ACTIVE_COLOR);
        marker.scale.setScalar(1.7);
      } else if (nr === hoveredNr) {
        material.color.copy(MARKER_ACTIVE_COLOR);
        marker.scale.setScalar(1.45);
      } else {
        material.color.copy(MARKER_COLOR);
        marker.scale.setScalar(1);
      }
    }
  }

  function buildMarkers(points: readonly PointStressValue[]): void {
    markerMeshes = [];
    const geometry = new THREE.SphereGeometry(markerRadius, 20, 14);
    for (const r of points) {
      const material = new THREE.MeshLambertMaterial({
        color: MARKER_COLOR.clone(),
      });
      const marker = new THREE.Mesh(geometry, material);
      marker.position.set(
        r.point.y,
        -r.point.z,
        extrusion / 2 + markerRadius * 1.2,
      );
      marker.userData.pick = {
        kind: 'marker',
        nr: r.point.nr,
      } satisfies PickInfo;
      marker.userData.nr = r.point.nr;
      root.add(marker);
      markerMeshes.push(marker);
    }
  }

  function hideTooltip(): void {
    tooltip.style.display = 'none';
  }

  function showTooltip(
    r: PointStressValue,
    offsetX: number,
    offsetY: number,
  ): void {
    const p = r.point;
    tooltip.innerHTML = `
      <div style="font-weight: 700; margin-bottom: 0.15rem;">Punkt ${p.nr} &middot; ${p.wall}</div>
      <div style="color:#cbd5e1;">y = ${p.y.toFixed(1)}&ensp;z = ${p.z.toFixed(1)}&ensp;t = ${p.t.toFixed(1)} mm</div>
      <div>&sigma; = <strong>${r.sigma.toFixed(2)}</strong> N/mm²</div>
      <div>&tau; = <strong>${r.tau.toFixed(2)}</strong> N/mm²</div>
      <div style="border-top: 1px solid rgba(248,250,252,0.25); margin-top: 0.2rem; padding-top: 0.2rem;">
        &sigma;<sub>v</sub> = <strong>${r.sigmaV.toFixed(2)}</strong> N/mm²
      </div>
    `;
    tooltip.style.display = 'block';

    // Rechts aus dem Bild laufen lassen ist haesslicher als links vom Zeiger.
    const hostWidth = options.tooltipHost.clientWidth;
    const boxWidth = tooltip.offsetWidth;
    const left =
      offsetX + 16 + boxWidth > hostWidth
        ? offsetX - boxWidth - 12
        : offsetX + 16;
    tooltip.style.left = `${Math.max(4, left)}px`;
    tooltip.style.top = `${Math.max(4, offsetY + 14)}px`;
  }

  const raycaster = new THREE.Raycaster();

  function pickPointAt(
    clientX: number,
    clientY: number,
  ): PointStressValue | null {
    const rect = renderer.domElement.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
    if (Number.isNaN(nx) || Number.isNaN(ny)) return null;
    raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
    const hits = raycaster.intersectObjects(root.children, false);
    for (const hit of hits) {
      const pick = hit.object.userData.pick as PickInfo | undefined;
      if (pick === undefined) continue;
      // Auf der Wand: naechste Station in Laufrichtung der Interpolation.
      let uStation: { u: number; nr: number } | undefined;
      if (pick.kind === 'marker') {
        uStation = { u: 0, nr: pick.nr };
      } else {
        const u = pick.axis === 'x' ? hit.point.x : hit.point.y;
        uStation = pick.stations[0];
        for (const s of pick.stations) {
          if (
            uStation !== undefined &&
            Math.abs(s.u - u) < Math.abs(uStation.u - u)
          ) {
            uStation = s;
          }
        }
      }
      if (uStation === undefined) return null;
      return currentPoints.find((r) => r.point.nr === uStation.nr) ?? null;
    }
    return null;
  }

  renderer.domElement.addEventListener('pointermove', (event: PointerEvent) => {
    if (dragging) {
      hideTooltip();
      return;
    }
    const rect = renderer.domElement.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const found = pickPointAt(event.clientX, event.clientY);

    if (found === null) {
      hoveredNr = null;
      hideTooltip();
    } else {
      hoveredNr = found.point.nr;
      showTooltip(found, offsetX, offsetY);
    }
    refreshMarkers();
  });

  renderer.domElement.addEventListener('pointerleave', () => {
    hoveredNr = null;
    hideTooltip();
    refreshMarkers();
  });

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    update(dims, points, quantity) {
      currentPoints = points;
      hoveredNr = null;
      hideTooltip();
      clearRoot();

      span = Math.max(dims.h, dims.b, 10);
      extrusion = span * 0.65;
      markerRadius = span * 0.02;

      const runs = buildWallRuns(dims, points, quantity);
      const range = colorRange(quantity, runs);
      updateLegend(range);
      buildWallMeshes(runs, range);
      buildMarkers(points);
      refreshMarkers();
      if (!cameraFramed) {
        frameCamera();
        cameraFramed = true;
      }
    },

    setActive(pointNr) {
      activeNr = pointNr;
      refreshMarkers();
    },

    dispose() {
      resizeObserver.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      clearRoot();
      renderer.dispose();
      tooltip.remove();
      renderer.domElement.remove();
    },
  };
}
