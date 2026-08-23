/**
 * Das Tri6-Element und seine Quadraturen — reine Algebra, kein Querschnitt.
 *
 * TRI6 UND NICHT TRI3, und das ist keine Feinheit: Tri3 hat elementweise
 * KONSTANTE Schubspannung, und kappa ist ein Energieintegral genau darueber.
 * Mit rund 37 000 Tri3-Elementen lag der Feldfehler am Kreis noch bei 0,5 %
 * ([ADR 0045](../../../docs/adr/0045-solid-section-values-are-nu-free-coefficients.md)).
 *
 * DIE KNOTENREIHENFOLGE IST `[v0, v1, v2, m01, m12, m20]` und kommt so aus
 * `@baustatik/mesh-2d-wasm` (`TRI6_ORDER`) — veroeffentlicht und unabhaengig
 * von Triangles interner Ordnung.
 *
 * ZWEI QUADRATUREN, UND DIE WAHL IST MATHEMATIK UND KEINE PRAEFERENZ:
 *
 *   3-Punkt (exakt bis Grad 2) fuer `K`. Die Kanten sind gerade, die Jacobi-
 *   Matrix damit konstant und die Gradienten linear; ihr Produkt ist
 *   quadratisch.
 *
 *   6-Punkt (exakt bis Grad 4) fuer den Lastvektor (`y·N_i`, Grad 3) sowie fuer
 *   `It` und die Trefftz-Projektion. Die Schubenergie traegt ueber `z²/(2·Iy)`
 *   einen Integranden vom Grad 4 — das ist die schaerfste Forderung.
 *
 * DANEBEN STEHEN ZWEI ABTASTREGELN UND KEINE QUADRATUREN: `TRIANGLE_NODES` und
 * `TRIANGLE_CENTROID` sind Orte, an denen die Spannungsrueckrechnung das
 * geloeste Feld abliest (ADR 0061). Ihre Gewichte tragen den Vertrag „Summe 1"
 * beziehungsweise die Elementflaeche — integriert wird mit ihnen nicht.
 *
 * ISOPARAMETRISCH GERECHNET, obwohl die Jacobi-Matrix bei geraden Kanten
 * konstant ist: der Mehraufwand ist ein 2x2-Inverses je Quadraturpunkt, und
 * dafuer haengt keine Zahl an der Annahme, dass Triangle seine Mittelknoten
 * exakt auf die Kantenmitte setzt.
 */

import { atOrThrow } from '@baustatik/core';

/** Ein Quadraturpunkt in Flaechenkoordinaten. */
export type TrianglePoint = {
  /** `[L0, L1, L2]`, Summe 1. */
  readonly L: readonly [number, number, number];
  /** Gewicht, Summe ueber die Regel ist 1. */
  readonly w: number;
};

/** Dreipunktregel, exakt bis Grad 2. */
export const TRIANGLE_3: readonly TrianglePoint[] = Object.freeze([
  { L: [2 / 3, 1 / 6, 1 / 6], w: 1 / 3 },
  { L: [1 / 6, 2 / 3, 1 / 6], w: 1 / 3 },
  { L: [1 / 6, 1 / 6, 2 / 3], w: 1 / 3 },
] as const);

/**
 * Sechspunktregel, exakt bis Grad 4 (Dunavant, Ordnung 4).
 *
 * Die Zahlen sind Wurzeln eines quadratischen Polynoms und stehen deshalb als
 * Dezimalbruch da; sie werden nicht aus einer geschlossenen Form gerechnet,
 * weil die geschlossene Form laenger waere als die Zahl.
 */
export const TRIANGLE_6: readonly TrianglePoint[] = (() => {
  const a1 = 0.816847572980459;
  const b1 = 0.091576213509771;
  const w1 = 0.109951743655322;
  const a2 = 0.10810301816807;
  const b2 = 0.445948490915965;
  const w2 = 0.223381589678011;
  return Object.freeze([
    { L: [a1, b1, b1] as const, w: w1 },
    { L: [b1, a1, b1] as const, w: w1 },
    { L: [b1, b1, a1] as const, w: w1 },
    { L: [a2, b2, b2] as const, w: w2 },
    { L: [b2, a2, b2] as const, w: w2 },
    { L: [b2, b2, a2] as const, w: w2 },
  ]);
})();

/**
 * Die SECHS KNOTEN des Elements als Abtastregel — keine Quadratur (ADR 0061).
 *
 * Die Reihenfolge ist die des Elements, `[v0, v1, v2, m01, m12, m20]`, damit
 * `elementPoints(TRIANGLE_NODES, …)[i]` zum `i`-ten Knoten aus `elementNodes`
 * gehoert. Genau diese Zuordnung ist der Grund fuer die Regel: die Knotenwerte
 * der Spannung entstehen als flaechengewichtetes Mittel der ELEMENTWERTE AN
 * DIESEM KNOTEN, und der groesste Abstand dazwischen ist die Sprungdiagnose.
 *
 * DIE GEWICHTE STEHEN NUR DA, DAMIT DER VERTRAG „SUMME 1" HAELT; benutzt werden
 * sie nicht. Als Quadratur waere die Regel unbrauchbar — sie taeuscht Grad 1
 * vor, und der Integrand eines Randknotens liegt genau dort, wo `∇ψ` am
 * schlechtesten ist.
 */
export const TRIANGLE_NODES: readonly TrianglePoint[] = Object.freeze([
  { L: [1, 0, 0], w: 1 / 6 },
  { L: [0, 1, 0], w: 1 / 6 },
  { L: [0, 0, 1], w: 1 / 6 },
  { L: [1 / 2, 1 / 2, 0], w: 1 / 6 },
  { L: [0, 1 / 2, 1 / 2], w: 1 / 6 },
  { L: [1 / 2, 0, 1 / 2], w: 1 / 6 },
] as const);

/**
 * Der Elementschwerpunkt als einziger Punkt.
 *
 * Mit `w = 1` ist sein `weight` genau `detJ/2`, also die ELEMENTFLAECHE — und
 * das ist zugleich das Gewicht der Knotenmittelung. Ein Ort und ein Gewicht aus
 * einem Aufruf.
 *
 * ALS QUADRATUR IST DAS DIE EINPUNKTREGEL, exakt bis Grad 1. Sie wird hier
 * nicht integriert, sondern ABGETASTET: ein Wert je Dreieck, ungeglaettet
 * (ADR 0061).
 */
export const TRIANGLE_CENTROID: readonly TrianglePoint[] = Object.freeze([
  { L: [1 / 3, 1 / 3, 1 / 3], w: 1 },
] as const);

/**
 * Drei-Punkt-Gauss auf `[-1, 1]`, exakt bis Grad 5.
 *
 * Fuer das Randintegral der Torsion: der Integrand `(z·n_y − y·n_z)·N_i` ist
 * laengs einer quadratischen Kante vom Grad 3.
 */
export const GAUSS_3: readonly { readonly t: number; readonly w: number }[] =
  Object.freeze([
    { t: -Math.sqrt(3 / 5), w: 5 / 9 },
    { t: 0, w: 8 / 9 },
    { t: Math.sqrt(3 / 5), w: 5 / 9 },
  ]);

/** Die sechs Formfunktionen an einem Punkt in Flaechenkoordinaten. */
export function shape(L: readonly [number, number, number]): Float64Array {
  const [L0, L1, L2] = L;
  return Float64Array.of(
    L0 * (2 * L0 - 1),
    L1 * (2 * L1 - 1),
    L2 * (2 * L2 - 1),
    4 * L0 * L1,
    4 * L1 * L2,
    4 * L2 * L0,
  );
}

/**
 * Die Ableitungen nach den Referenzkoordinaten `ξ = L1`, `η = L2`.
 *
 * Zurueck kommen zwoelf Zahlen: erst die sechs `∂N/∂ξ`, dann die sechs
 * `∂N/∂η`.
 */
export function shapeDerivatives(
  L: readonly [number, number, number],
): Float64Array {
  const [L0, L1, L2] = L;
  return Float64Array.of(
    // ∂N/∂ξ
    1 - 4 * L0,
    4 * L1 - 1,
    0,
    4 * (L0 - L1),
    4 * L2,
    -4 * L2,
    // ∂N/∂η
    1 - 4 * L0,
    0,
    4 * L2 - 1,
    -4 * L1,
    4 * L1,
    4 * (L0 - L2),
  );
}

/** Was ein Quadraturpunkt eines Elements beitraegt. */
export type ElementPoint = {
  /** `∂N_i/∂y`, sechs Werte. */
  readonly dNdy: Float64Array;
  /** `∂N_i/∂z`, sechs Werte. */
  readonly dNdz: Float64Array;
  /** Die Formfunktionen selbst, sechs Werte. */
  readonly N: Float64Array;
  /** Lage des Punktes. */
  readonly y: number;
  readonly z: number;
  /**
   * Das Flaechengewicht `w · detJ / 2` — so, dass `Σ gewicht · f` bereits
   * `∫f dA` ist.
   */
  readonly weight: number;
};

/**
 * Die Auswertung eines Elements an allen Punkten einer Regel.
 *
 * `y`/`z` sind die sechs Knotenkoordinaten in der Reihenfolge des Elements.
 */
export function elementPoints(
  rule: readonly TrianglePoint[],
  y: Float64Array,
  z: Float64Array,
): readonly ElementPoint[] {
  const points: ElementPoint[] = [];
  for (const point of rule) {
    const N = shape(point.L);
    const d = shapeDerivatives(point.L);

    let dydXi = 0;
    let dzdXi = 0;
    let dydEta = 0;
    let dzdEta = 0;
    for (let i = 0; i < 6; i += 1) {
      const yi = atOrThrow(y, i);
      const zi = atOrThrow(z, i);
      dydXi += atOrThrow(d, i) * yi;
      dzdXi += atOrThrow(d, i) * zi;
      dydEta += atOrThrow(d, 6 + i) * yi;
      dzdEta += atOrThrow(d, 6 + i) * zi;
    }
    const detJ = dydXi * dzdEta - dzdXi * dydEta;
    if (!(Number.isFinite(detJ) && detJ > 0)) {
      throw new Error(
        'Ein Tri6-Element ist entartet oder verkehrt orientiert (detJ <= 0).',
      );
    }

    const dNdy = new Float64Array(6);
    const dNdz = new Float64Array(6);
    let py = 0;
    let pz = 0;
    for (let i = 0; i < 6; i += 1) {
      const dXi = atOrThrow(d, i);
      const dEta = atOrThrow(d, 6 + i);
      dNdy[i] = (dXi * dzdEta - dEta * dzdXi) / detJ;
      dNdz[i] = (dEta * dydXi - dXi * dydEta) / detJ;
      py += atOrThrow(N, i) * atOrThrow(y, i);
      pz += atOrThrow(N, i) * atOrThrow(z, i);
    }

    points.push({
      dNdy,
      dNdz,
      N,
      y: py,
      z: pz,
      weight: (point.w * detJ) / 2,
    });
  }
  return points;
}

/** Die drei quadratischen Formfunktionen einer Kante `[a, mitte, b]`. */
export function edgeShape(t: number): readonly [number, number, number] {
  return [(t * (t - 1)) / 2, 1 - t * t, (t * (t + 1)) / 2];
}

/** Ihre Ableitungen nach `t`. */
export function edgeShapeDerivatives(
  t: number,
): readonly [number, number, number] {
  return [(2 * t - 1) / 2, -2 * t, (2 * t + 1) / 2];
}
