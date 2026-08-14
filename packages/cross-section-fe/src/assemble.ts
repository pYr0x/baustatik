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
 *      und seit ADR 0048 auch die Torsion, weil beide Randwertprobleme reines
 *      Neumann sind: EINE Matrix, EINE Zerlegung, fuenf rechte Seiten.
 *   2. GERECHNET WIRD IN DEN HAUPTACHSEN. Die Herleitung setzt sie voraus:
 *      `σ_x = M·z/Iy` gilt nur dort. Gedreht wird nach dem Vernetzen — die
 *      Topologie bleibt, nur die Koordinaten drehen sich.
 *   3. BEIDE RECHTEN SEITEN DES SCHUBS SIND RANDINTEGRALE, und ihre
 *      Vertraeglichkeit ist IDENTISCH erfuellt (ADR 0048):
 *
 *      ```text
 *      ψ₀:  ∮ z²/(2·Iy) dy = −(1/Iy)·∫∫ z dA = 0     (Schwerpunkt)
 *      ψ₁:  ∮ y²/(2·Iy) dy = 0                       (exaktes Differential)
 *      ```
 *
 *      Beide gelten GLOBAL ueber den ganzen Rand und nicht je Schleife. Genau
 *      darum kennt diese Formulierung keine Lochgrenze: `ψ` ist eine
 *      Verschiebung und auf jedem Gebiet eindeutig, waehrend die frueher hier
 *      geloeste Spannungsfunktion `Φ` je Randschleife eine offene Konstante
 *      liess und ihr Randdatum beim Umlauf schliessen musste.
 */

import { atOrThrow } from '@baustatik/core';
import { elementNodes, type FESection } from './prepare';
import {
  edgeShape,
  edgeShapeDerivatives,
  elementPoints,
  GAUSS_3,
  TRIANGLE_3,
} from './tri6';

/** Die Steifigkeitsmatrix auf den freien Knoten. */
export type StiffnessSystem = {
  readonly free: number;
  /** Netzknoten -> Zeile, oder `-1` fuer den einen gehaltenen Knoten. */
  readonly freeIndex: Int32Array;
  readonly rows: Uint32Array;
  readonly cols: Uint32Array;
  readonly values: Float64Array;
};

/** Ein gedrehtes Bezugssystem samt beider rechten Seiten des Schubproblems. */
export type Frame = {
  /** Drehwinkel gegen das Eingabesystem [rad]. */
  readonly theta: number;
  /** Gedrehte, schwerpunktsbezogene Knotenkoordinaten. */
  readonly y: Float64Array;
  readonly z: Float64Array;
  /** `∫z²dA` IN DIESEM System. */
  readonly Iy: number;
  /** `∮ −z²/(2·Iy)·N_i dy` — die rechte Seite des `m⁰`-Feldes. */
  readonly rhsPsi0: Float64Array;
  /** `∮ +y²/(2·Iy)·N_i dy` — die rechte Seite des `m¹`-Feldes. */
  readonly rhsPsi1: Float64Array;
  /**
   * Der Rest der Vertraeglichkeit je rechter Seite, bezogen auf die Summe der
   * Betraege. Beide sind IDENTISCH null; jeder Wert ueber Rauschniveau ist ein
   * Fehler und keine Eigenschaft der Figur (ADR 0048).
   */
  readonly compatibilityPsi0: number;
  readonly compatibilityPsi1: number;
};

/**
 * `K` fuer ein reines NEUMANN-Problem: es haelt genau ein Knoten.
 *
 * SEIT ADR 0048 IST DAS DIE EINZIGE MATRIX DES PACKAGES. Torsion und Schub
 * laufen beide ueber eine Verschiebung mit Neumann-Rand, also ueber dieselbe
 * Matrix und dieselbe Zerlegung.
 *
 * FESTGEHALTEN WIRD DER KNOTEN MIT DEM KLEINSTEN INDEX, und zwar SYMMETRISCH —
 * Zeile UND Spalte fallen weg. Nur so bleibt `K` positiv definit, und nur dann
 * traegt die Cholesky-Zerlegung. Ein Lagrange-Multiplikator fuer den
 * Nullmittelwert zerstoerte genau das. Die Willkuer kostet nichts: `ψ` und `ω`
 * sind bis auf eine Konstante bestimmt, und weder `τ = ∇ψ + p` noch `It` sehen
 * sie.
 *
 * Die Dreipunktregel ist hier EXAKT und nicht sparsam: bei geraden Kanten ist
 * die Jacobi-Matrix konstant, die Gradienten sind linear, ihr Produkt ist
 * quadratisch.
 */
export function assembleNeumannStiffness(section: FESection): StiffnessSystem {
  const freeIndex = new Int32Array(section.nodeCount).fill(-1);
  let free = 0;
  for (let node = 1; node < section.nodeCount; node += 1)
    freeIndex[node] = free++;

  const entries = new Map<number, number>();
  const elementY = new Float64Array(6);
  const elementZ = new Float64Array(6);
  const local = new Float64Array(36);

  for (let element = 0; element < section.elementCount; element += 1) {
    const nodes = elementNodes(section.mesh, element);
    for (let i = 0; i < 6; i += 1) {
      const node = atOrThrow(nodes, i);
      elementY[i] = atOrThrow(section.y, node);
      elementZ[i] = atOrThrow(section.z, node);
    }
    local.fill(0);
    for (const point of elementPoints(TRIANGLE_3, elementY, elementZ)) {
      for (let i = 0; i < 6; i += 1) {
        for (let j = 0; j < 6; j += 1) {
          local[6 * i + j] +=
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
        entries.set(key, (entries.get(key) ?? 0) + atOrThrow(local, 6 * i + j));
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

  return { free, freeIndex, rows, cols, values };
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
 * Ein gedrehtes Bezugssystem mit beiden rechten Seiten.
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

  const psi0 = shearLoad(
    section,
    system,
    y,
    z,
    (_y, zq) => -(zq * zq) / (2 * Iy),
  );
  const psi1 = shearLoad(section, system, y, z, (yq) => (yq * yq) / (2 * Iy));

  return {
    theta,
    y,
    z,
    Iy,
    rhsPsi0: psi0.rhs,
    rhsPsi1: psi1.rhs,
    compatibilityPsi0: psi0.compatibility,
    compatibilityPsi1: psi1.compatibility,
  };
}

/**
 * Ein Randintegral `∮c(y,z)·N_i dy` ueber ALLE Schleifen, samt seinem
 * Vertraeglichkeitsrest.
 *
 * WOHER DAS `dy` KOMMT. Die schwache Form von `∇²ψ = 0` mit `∂ψ/∂n = g` lautet
 * `∫∇ψ·∇v dA = ∮g·v ds`. Beide Randdaten haben die Gestalt `g = c·n_z`, und mit
 * der Normalenkonvention aus `prepare.ts` (`n = (dz, −dy)/L`, `ds = L·dt`) gilt
 * `n_z·ds = −dy`. Die Kantenlaenge kuerzt sich also heraus — es wird nirgends
 * durch eine Kantenlaenge geteilt, und `c` traegt das Vorzeichen bereits:
 *
 * ```text
 * ψ₀:  ∂ψ₀/∂n = +z²/(2·Iy)·n_z   →   rhs_i = ∮ −z²/(2·Iy)·N_i dy
 * ψ₁:  ∂ψ₁/∂n = −y²/(2·Iy)·n_z   →   rhs_i = ∮ +y²/(2·Iy)·N_i dy
 * ```
 *
 * DREI-PUNKT-GAUSS JE RANDSEGMENT: laengs einer geraden Kante ist der Integrand
 * vom Grad 4, `GAUSS_3` ist exakt bis 5 — Reserve vorhanden.
 *
 * DER RAND LAEUFT UEBER ALLE SCHLEIFEN, auch die der Loecher. Wer nur den
 * Aussenrand nimmt, bekommt fuer den Kreisring Zahlen, die keine Formel
 * bestaetigt — dasselbe gilt fuer `torsionLoad`.
 */
function shearLoad(
  section: FESection,
  system: StiffnessSystem,
  y: Float64Array,
  z: Float64Array,
  coefficient: (y: number, z: number) => number,
): { readonly rhs: Float64Array; readonly compatibility: number } {
  const rhs = new Float64Array(system.free);
  let compatibility = 0;
  let scale = 0;

  for (const loop of section.loops) {
    for (const [a, middle, b] of loop.edges) {
      const nodes: readonly [number, number, number] = [a, middle, b];
      for (const gauss of GAUSS_3) {
        const N = edgeShape(gauss.t);
        const dN = edgeShapeDerivatives(gauss.t);
        let yq = 0;
        let zq = 0;
        let dy = 0;
        for (let i = 0; i < 3; i += 1) {
          const node = atOrThrow(nodes, i);
          yq += atOrThrow(N, i) * atOrThrow(y, node);
          zq += atOrThrow(N, i) * atOrThrow(z, node);
          dy += atOrThrow(dN, i) * atOrThrow(y, node);
        }
        const scaled = gauss.w * coefficient(yq, zq) * dy;
        compatibility += scaled;
        scale += Math.abs(scaled);
        for (let i = 0; i < 3; i += 1) {
          const row = atOrThrow(system.freeIndex, atOrThrow(nodes, i));
          if (row < 0) continue;
          rhs[row] = atOrThrow(rhs, row) + scaled * atOrThrow(N, i);
        }
      }
    }
  }

  return {
    rhs,
    compatibility: scale > 0 ? compatibility / scale : compatibility,
  };
}
