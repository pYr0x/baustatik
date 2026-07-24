/**
 * 3-Punkt-Gauss-Legendre-Integration ueber ein beliebiges Intervall.
 *
 * Package-intern: NICHT aus src/index.ts exportiert. Der Integrator ist ein
 * Detail der Elementmathematik; ein oeffentliches Numerik-Utility wuerde andere
 * Packages einladen, fem-element aus Gruenden zu importieren, die nichts mit
 * Elementen zu tun haben, und die Signatur an semver binden.
 *
 * WARUM DREI PUNKTE GENUEGEN: 3-Punkt-Gauss ist exakt bis Polynomgrad 5. Der
 * hoechste hier auftretende Integrandgrad ist `Nw` (kubisch) mal `q` (linear
 * ueber einen Abschnitt) = 4. Der konsistente Lastvektor ist damit EXAKT und
 * nicht genaehert; ebenso die integrierte Steifigkeit (hoechster Grad 2, weil
 * `dNtheta` linear ist). Vergleichstests duerfen deshalb auf Rundungsniveau
 * pruefen statt mit weichen Toleranzen.
 */

/** Stuetzstelle mit bereits eingerechneter Jacobi-Determinante. */
export type GaussPoint = {
  /** Position in Original-Koordinaten (lokale x-Achse [m]). */
  x: number;
  /** Gewicht inklusive Intervall-Jacobi (to - from) / 2. */
  w: number;
};

/** Stuetzstellen auf [-1, 1]: 0 und +-sqrt(3/5). */
const XI = [-Math.sqrt(3 / 5), 0, Math.sqrt(3 / 5)];
/** Zugehoerige Gewichte: 5/9, 8/9, 5/9. */
const W = [5 / 9, 8 / 9, 5 / 9];

/**
 * Liefert die drei Stuetzstellen fuer das Intervall `[from, to]`. Ein Integral
 * ist damit `sum(p.w * f(p.x))` — die Gewichte tragen die Jacobi-Determinante
 * bereits, sodass der Aufrufer nur noch summiert.
 *
 * Bei `from === to` (entartetes Segment) sind alle Gewichte 0; der Aufrufer
 * darf solche Abschnitte auch vorher ueberspringen.
 */
export function gauss3(from: number, to: number): GaussPoint[] {
  const half = (to - from) / 2;
  const mid = (from + to) / 2;

  return XI.map((xi, i) => ({ x: mid + half * xi, w: W[i] * half }));
}
