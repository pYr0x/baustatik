/**
 * Die Assemblierung — REIN UND SYNCHRON, kein WASM, kein Worker.
 *
 * Sie ist die Naht, die ADR 0047 als INTERNES Detail behaelt: Assemblierung und
 * Auswertung sind ohne Loeser pruefbar, aber niemand ausserhalb dieses Packages
 * muss die Naht kennen.
 *
 * DREI DINGE, DIE HIER ENTSCHIEDEN WERDEN:
 *
 *   1. `K` ist ROTATIONSINVARIANT. `∫∇N_i·∇N_j dA` aendert sich unter einer
 *      Drehung des Bezugssystems nicht, weil die Drehung orthogonal ist. Beide
 *      Lastrichtungen laufen deshalb auf EINER Matrix und EINER Zerlegung —
 *      `2·(2 + h)` rechte Seiten statt zweier Faktorisierungen.
 *   2. GERECHNET WIRD IN DEN HAUPTACHSEN. Die Herleitung setzt sie voraus:
 *      `σ_x = M·z/Iy` gilt nur dort, und `∮z²dy` ist nur dort das richtige
 *      Randdatum. Gedreht wird nach dem Vernetzen — die Topologie bleibt, nur
 *      die Koordinaten drehen sich.
 *   3. DER RANDSCHLUSS IST DIE PRUEFUNG. `∮dΦ = (1/Iy)·∫∫_D z dA` verschwindet
 *      genau dann, wenn der Schwerpunkt jedes Lochs auf der Biegeachse liegt.
 *      Sonst ist Φ mehrdeutig und als FE-Feld nicht darstellbar — und der
 *      Restfluss zeigt das NICHT an (ADR 0045).
 */

import { atOrThrow } from '@baustatik/core';
import { type BoundaryLoop, elementNodes, type FESection } from './prepare';
import { elementPoints, TRIANGLE_3, TRIANGLE_6 } from './tri6';

/** Die Steifigkeitsmatrix auf den freien Knoten, plus die Elementmatrizen. */
export type StiffnessSystem = {
  readonly free: number;
  /** Netzknoten -> Zeile, oder `-1` fuer einen gebundenen Knoten. */
  readonly freeIndex: Int32Array;
  readonly rows: Uint32Array;
  readonly cols: Uint32Array;
  readonly values: Float64Array;
  /** `36` Werte je Element, zeilenweise — fuer `K·Φ` ueber ALLE Knoten. */
  readonly elementK: Float64Array;
};

/** Ein gedrehtes Bezugssystem samt allem, was daran haengt. */
export type Frame = {
  /** Drehwinkel gegen das Eingabesystem [rad]. */
  readonly theta: number;
  /** Gedrehte, schwerpunktsbezogene Knotenkoordinaten. */
  readonly y: Float64Array;
  readonly z: Float64Array;
  /** `∫z²dA` IN DIESEM System. */
  readonly Iy: number;
  /** Das Dirichlet-Randdatum `g`, Basis null je Schleife. */
  readonly boundaryValues: Float64Array;
  /** Je Innenrand ein Indikatorfeld — die Dirichlet-Daten der Zusatzfelder. */
  readonly holeIndicator: readonly Float64Array[];
  /**
   * Der Randschluss je Schleife, bezogen auf die Spannweite des Datums.
   * Ueber der Schranke ist die Figur ausserhalb der Formulierung.
   */
  readonly closure: number;
  /** `−Σ K_ij·g_j` ueber die gebundenen Knoten. */
  readonly rhsDirichlet: Float64Array;
  /** `(1/Iy)·∫y·N_i dA`, ohne den Faktor `m`. */
  readonly rhsLoad: Float64Array;
  /** Je Innenrand `−Σ K_ij·ind_j`. */
  readonly rhsHole: readonly Float64Array[];
  /** Derselbe Lastvektor ueber ALLE Knoten — die Randzeilen braucht der Fluss. */
  readonly loadFull: Float64Array;
};

/**
 * Ab wann der Randschluss als gebrochen gilt, bezogen auf die Spannweite des
 * Randdatums.
 *
 * DIE ZAHL IST GROSSZUEGIG, WEIL DER FEHLER GROB IST: fuer ein Polygon ist
 * `∮z²dy` exakt gleich `−2∫∫z dA`, jede Kante wird exakt integriert, und was
 * bleibt, ist Gleitkommarauschen. Gemessen wurde ein echter Verstoss mit
 * 16,4 % der Spannweite — vier Zehnerpotenzen ueber dieser Schranke
 * (ADR 0045).
 */
const CLOSURE_TOLERANCE = 1e-8;

/**
 * `K` auf den freien Knoten des SCHUBPROBLEMS — gebunden ist jeder Randknoten.
 *
 * Die Dreipunktregel ist hier EXAKT und nicht sparsam: bei geraden Kanten ist
 * die Jacobi-Matrix konstant, die Gradienten sind linear, ihr Produkt ist
 * quadratisch.
 */
export function assembleShearStiffness(section: FESection): StiffnessSystem {
  const freeIndex = new Int32Array(section.nodeCount).fill(-1);
  let free = 0;
  for (let node = 0; node < section.nodeCount; node += 1) {
    if (atOrThrow(section.isBoundary, node) === 0) freeIndex[node] = free++;
  }
  return assembleStiffness(section, freeIndex, free);
}

/**
 * `K` fuer das TORSIONSPROBLEM: reines Neumann, also haelt genau ein Knoten.
 *
 * FESTGEHALTEN WIRD DER KNOTEN MIT DEM KLEINSTEN INDEX, und zwar SYMMETRISCH —
 * Zeile UND Spalte fallen weg. Nur so bleibt `K` positiv definit, und nur dann
 * traegt die Cholesky-Zerlegung. Ein Lagrange-Multiplikator fuer den
 * Nullmittelwert zerstoerte genau das.
 */
export function assembleTorsionStiffness(section: FESection): StiffnessSystem {
  const freeIndex = new Int32Array(section.nodeCount).fill(-1);
  let free = 0;
  for (let node = 1; node < section.nodeCount; node += 1)
    freeIndex[node] = free++;
  return assembleStiffness(section, freeIndex, free);
}

function assembleStiffness(
  section: FESection,
  freeIndex: Int32Array,
  free: number,
): StiffnessSystem {
  const elementK = new Float64Array(36 * section.elementCount);
  const entries = new Map<number, number>();
  const elementY = new Float64Array(6);
  const elementZ = new Float64Array(6);

  for (let element = 0; element < section.elementCount; element += 1) {
    const nodes = elementNodes(section.mesh, element);
    for (let i = 0; i < 6; i += 1) {
      const node = atOrThrow(nodes, i);
      elementY[i] = atOrThrow(section.y, node);
      elementZ[i] = atOrThrow(section.z, node);
    }
    const points = elementPoints(TRIANGLE_3, elementY, elementZ);
    const offset = 36 * element;
    for (const point of points) {
      for (let i = 0; i < 6; i += 1) {
        for (let j = 0; j < 6; j += 1) {
          elementK[offset + 6 * i + j] +=
            (atOrThrow(point.dNdy, i) * atOrThrow(point.dNdy, j) +
              atOrThrow(point.dNdz, i) * atOrThrow(point.dNdz, j)) *
            point.weight;
        }
      }
    }

    for (let i = 0; i < 6; i += 1) {
      const row = atOrThrow(freeIndex, atOrThrow(nodes, i));
      if (row < 0) continue;
      for (let j = 0; j < 6; j += 1) {
        const column = atOrThrow(freeIndex, atOrThrow(nodes, j));
        // Nur das untere Dreieck — mehr nimmt der Loeser nicht.
        if (column < 0 || column > row) continue;
        const key = row * 0x4000_0000 + column;
        entries.set(
          key,
          (entries.get(key) ?? 0) + atOrThrow(elementK, offset + 6 * i + j),
        );
      }
    }
  }

  const count = entries.size;
  const rows = new Uint32Array(count);
  const cols = new Uint32Array(count);
  const values = new Float64Array(count);
  let at = 0;
  for (const [key, value] of entries) {
    rows[at] = Math.floor(key / 0x4000_0000);
    cols[at] = key % 0x4000_0000;
    values[at] = value;
    at += 1;
  }

  return { free, freeIndex, rows, cols, values, elementK };
}

/**
 * Der Drehwinkel in die Hauptachsen, auf `(−π/4, +π/4]` gebracht.
 *
 * NICHT DIE FASSUNG AUS `principalAxes`: die ordnet `Iu >= Iv` und dreht ein
 * liegendes Rechteck um 90°. Hier soll `y` `y` bleiben und `z` `z` — sonst
 * vertauschten sich `kappaY` und `kappaZ` allein deshalb, weil die Figur breiter
 * als hoch ist.
 */
export function principalRotation(Iy: number, Iz: number, Iyz: number): number {
  let theta = Math.atan2(-2 * Iyz, Iy - Iz) / 2;
  const quarter = Math.PI / 4;
  while (theta > quarter) theta -= Math.PI / 2;
  while (theta <= -quarter) theta += Math.PI / 2;
  return theta;
}

/**
 * Ein gedrehtes Bezugssystem mit Randdatum, Lastvektor und Randschluss.
 *
 * `theta` dreht das SYSTEM: `y' = y·cosθ + z·sinθ`, `z' = −y·sinθ + z·cosθ`.
 */
export function createFrame(
  section: FESection,
  system: StiffnessSystem,
  theta: number,
): Frame {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const y = new Float64Array(section.nodeCount);
  const z = new Float64Array(section.nodeCount);
  for (let node = 0; node < section.nodeCount; node += 1) {
    const y0 = atOrThrow(section.y, node);
    const z0 = atOrThrow(section.z, node);
    y[node] = y0 * cos + z0 * sin;
    z[node] = -y0 * sin + z0 * cos;
  }

  // Analytisch statt neu integriert: dieselbe Zahl, aber ohne einen zweiten
  // Rechenweg fuer dasselbe Moment.
  const Iy =
    section.Iy * cos * cos +
    section.Iz * sin * sin -
    2 * section.Iyz * sin * cos;
  if (!(Number.isFinite(Iy) && Iy > 0)) {
    throw new Error('Das Traegheitsmoment der Lastrichtung ist nicht positiv.');
  }

  const datum = boundaryDatum(section, y, z, Iy);
  const holeIndicator = section.holeLoops.map((loop) => {
    const indicator = new Float64Array(section.nodeCount);
    for (const node of loop.nodes) indicator[node] = 1;
    return indicator;
  });

  const { rhsLoad, loadFull } = loadVector(section, system, y, z, Iy);
  const rhsDirichlet = liftDirichlet(section, system, datum.values);
  const rhsHole = holeIndicator.map((indicator) =>
    liftDirichlet(section, system, indicator),
  );

  return {
    theta,
    y,
    z,
    Iy,
    boundaryValues: datum.values,
    holeIndicator,
    closure: datum.closure,
    rhsDirichlet,
    rhsLoad,
    rhsHole,
    loadFull,
  };
}

/**
 * Das Randdatum `Φ = −1/(2·Iy)·∫z²dy`, je Schleife bei null beginnend.
 *
 * DER MITTELKNOTEN BEKOMMT SEINEN EIGENEN WERT, nicht das Mittel der Ecken:
 * das Datum ist laengs einer geraden Kante ein Polynom dritten Grades in der
 * Bogenlaenge, und ein Tri6-Feld kann davon den quadratischen Anteil tragen.
 *
 * Zurueck kommt ausserdem der groesste Randschluss, bezogen auf die Spannweite
 * des Datums — der ANZEIGER dafuer, ob die Figur ueberhaupt in der Formulierung
 * liegt.
 */
function boundaryDatum(
  section: FESection,
  y: Float64Array,
  z: Float64Array,
  Iy: number,
): { readonly values: Float64Array; readonly closure: number } {
  const values = new Float64Array(section.nodeCount);
  const factor = -1 / (2 * Iy);
  let low = 0;
  let high = 0;
  let worst = 0;

  for (const loop of section.loops) {
    let running = 0;
    for (let at = 0; at < loop.edges.length; at += 1) {
      const [a, middle, b] = atOrThrow(loop.edges, at);
      const ya = atOrThrow(y, a);
      const yb = atOrThrow(y, b);
      const za = atOrThrow(z, a);
      const zb = atOrThrow(z, b);
      const dy = yb - ya;
      // Beide Stammfunktionen von `∫z²dy` laengs der geraden Kante, exakt.
      const toMiddle =
        factor * dy * ((7 * za * za + 4 * za * zb + zb * zb) / 24);
      const toEnd = factor * dy * ((za * za + za * zb + zb * zb) / 3);
      values[middle] = running + toMiddle;
      const closing = at + 1 === loop.edges.length;
      if (closing) worst = Math.max(worst, Math.abs(running + toEnd));
      else values[b] = running + toEnd;
      running += toEnd;
      low = Math.min(low, running, atOrThrow(values, middle));
      high = Math.max(high, running, atOrThrow(values, middle));
    }
  }

  const spread = high - low;
  return { values, closure: spread > 0 ? worst / spread : worst };
}

/** `f_i = (1/Iy)·∫y·N_i dA` — Grad 3, also die Sechspunktregel. */
function loadVector(
  section: FESection,
  system: StiffnessSystem,
  y: Float64Array,
  z: Float64Array,
  Iy: number,
): { readonly rhsLoad: Float64Array; readonly loadFull: Float64Array } {
  const rhsLoad = new Float64Array(system.free);
  const loadFull = new Float64Array(section.nodeCount);
  const elementY = new Float64Array(6);
  const elementZ = new Float64Array(6);

  for (let element = 0; element < section.elementCount; element += 1) {
    const nodes = elementNodes(section.mesh, element);
    for (let i = 0; i < 6; i += 1) {
      const node = atOrThrow(nodes, i);
      elementY[i] = atOrThrow(y, node);
      elementZ[i] = atOrThrow(z, node);
    }
    for (const point of elementPoints(TRIANGLE_6, elementY, elementZ)) {
      for (let i = 0; i < 6; i += 1) {
        const value = (point.y * atOrThrow(point.N, i) * point.weight) / Iy;
        const node = atOrThrow(nodes, i);
        loadFull[node] = atOrThrow(loadFull, node) + value;
        const row = atOrThrow(system.freeIndex, node);
        if (row >= 0) rhsLoad[row] = atOrThrow(rhsLoad, row) + value;
      }
    }
  }
  return { rhsLoad, loadFull };
}

/** `−Σ_j K_ij·d_j` ueber die GEBUNDENEN Knoten `j`. */
function liftDirichlet(
  section: FESection,
  system: StiffnessSystem,
  datum: Float64Array,
): Float64Array {
  const rhs = new Float64Array(system.free);
  for (let element = 0; element < section.elementCount; element += 1) {
    const nodes = elementNodes(section.mesh, element);
    const offset = 36 * element;
    for (let i = 0; i < 6; i += 1) {
      const row = atOrThrow(system.freeIndex, atOrThrow(nodes, i));
      if (row < 0) continue;
      for (let j = 0; j < 6; j += 1) {
        const node = atOrThrow(nodes, j);
        if (atOrThrow(system.freeIndex, node) >= 0) continue;
        rhs[row] =
          atOrThrow(rhs, row) -
          atOrThrow(system.elementK, offset + 6 * i + j) *
            atOrThrow(datum, node);
      }
    }
  }
  return rhs;
}

/**
 * `K·φ` ueber ALLE Knoten, elementweise.
 *
 * Gebraucht wird davon nur die Summe ueber die Knoten einer Randschleife — aber
 * die Randzeilen fehlen im aufgestellten System, also wird hier frisch
 * multipliziert.
 */
export function applyStiffness(
  section: FESection,
  system: StiffnessSystem,
  phi: Float64Array,
): Float64Array {
  const out = new Float64Array(section.nodeCount);
  for (let element = 0; element < section.elementCount; element += 1) {
    const nodes = elementNodes(section.mesh, element);
    const offset = 36 * element;
    for (let i = 0; i < 6; i += 1) {
      let sum = 0;
      for (let j = 0; j < 6; j += 1) {
        sum +=
          atOrThrow(system.elementK, offset + 6 * i + j) *
          atOrThrow(phi, atOrThrow(nodes, j));
      }
      const node = atOrThrow(nodes, i);
      out[node] = atOrThrow(out, node) + sum;
    }
  }
  return out;
}

/**
 * Der Fluss `∮_Γk ∂Φ/∂n ds` je Innenrand, aus der SCHWACHEN FORM.
 *
 * Mit `w` = eins auf `Γk` und null auf allen uebrigen Raendern gilt
 * `∮w·∂Φ/∂n ds = (K·Φ)·w − m·loadFull·w`, also eine Summe ueber die Knoten der
 * Schleife. KEINE Kanten-Element-Zuordnung, keine Normalenrichtung, kein
 * Vorzeichenrisiko.
 */
export function holeFlux(
  section: FESection,
  system: StiffnessSystem,
  frame: Frame,
  phi: Float64Array,
  loadFactor: number,
): Float64Array {
  const stiff = applyStiffness(section, system, phi);
  const flux = new Float64Array(section.holeLoops.length);
  for (let hole = 0; hole < section.holeLoops.length; hole += 1) {
    const loop: BoundaryLoop = atOrThrow(section.holeLoops, hole);
    let sum = 0;
    for (const node of loop.nodes) {
      sum +=
        atOrThrow(stiff, node) - loadFactor * atOrThrow(frame.loadFull, node);
    }
    flux[hole] = sum;
  }
  return flux;
}

/** Ob der Randschluss traegt — sonst ist Φ mehrdeutig (ADR 0045). */
export function closureHolds(frame: Frame): boolean {
  return frame.closure <= CLOSURE_TOLERANCE;
}
