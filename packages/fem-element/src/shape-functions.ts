/**
 * Ansatzfunktionen des locking-freien IIE (Interdependent Interpolation
 * Element) fuer den ebenen Timoshenko-Stab, samt Ableitungen nach x.
 *
 * Package-intern: NICHT aus src/index.ts exportiert. Die oeffentliche Methode
 * `PreparedElement.shapeFunctions(x)` projiziert nur die Werte heraus; die
 * Ableitungen brauchen ausschliesslich `gaussStiffness` (jetzt) und
 * `internalForces` (spaeteres Inkrement). Sie koennen jederzeit oeffentlich
 * werden — der umgekehrte Weg waere ein Breaking Change.
 *
 * LAENGE-6-KONTRAKT: alle sechs Arrays laufen ueber die volle DOF-Reihenfolge
 * `[u1, w1, theta1, u2, w2, theta2]` mit Nullen an den nicht beteiligten
 * Stellen. Damit ist `dot(Nw, d) = w(x)`, `dot(Ntheta, d) = theta(x)` und
 * `dot(Nu, d) = u(x)` — kein Aufrufer muss die DOF-Indexabbildung kennen.
 *
 * INTERDEPENDENZ: `w` ist kubisch, `theta` quadratisch, und beide sind ueber
 * phi gekoppelt. Die definierende Eigenschaft ist, dass die Schubverzerrung
 * `gamma = w' - theta` KONSTANT ueber das Element ist — genau das macht das
 * Element locking-frei. Bei phi = 0 gehen `Nw` in die Hermite-Polynome und
 * `Ntheta` exakt in deren Ableitung ueber; theta ist dann kein unabhaengiges
 * Feld mehr, sondern die Neigung der Biegelinie (Euler-Bernoulli).
 */

/** Ansatzfunktionen und ihre x-Ableitungen an einer Stelle, je Laenge 6. */
export type ShapeFunctions = {
  /** Axial: `dot(Nu, d) = u(x)`. */
  Nu: number[];
  /** Durchbiegung: `dot(Nw, d) = w(x)`. */
  Nw: number[];
  /** Verdrehung: `dot(Ntheta, d) = theta(x)`. */
  Ntheta: number[];
  /** `dot(dNu, d) = du/dx` (Dehnung). */
  dNu: number[];
  /** `dot(dNw, d) = dw/dx` (Neigung der Biegelinie). */
  dNw: number[];
  /** `dot(dNtheta, d) = dtheta/dx` (Kruemmung). */
  dNtheta: number[];
};

/**
 * Wertet alle Ansatzfunktionen an der lokalen Stelle `x` aus.
 *
 * @param x Lokale Koordinate [m] entlang der Stabachse, 0..L.
 * @param L Elementlaenge [m].
 * @param phi Schubparameter (0 = schubstarr), von `prepare()` normalisiert.
 */
export function shapeFunctionsAt(
  x: number,
  L: number,
  phi: number,
): ShapeFunctions {
  const xi = x / L;
  const xi2 = xi * xi;
  const xi3 = xi2 * xi;
  // c = 1/(1+phi); bei phi = 0 exakt 1, daher fallen alle Formeln FP-exakt auf
  // die Hermite-Form zurueck.
  const c = 1 / (1 + phi);

  // Axial: linear, von der Biegung entkoppelt.
  const nu1 = 1 - xi;
  const nu2 = xi;

  // Durchbiegung (kubisch, phi-gekoppelt), Block ueber [w1, theta1, w2, theta2].
  const nw1 = c * (2 * xi3 - 3 * xi2 - phi * xi + 1 + phi);
  const nw2 = c * L * (xi3 - (2 + phi / 2) * xi2 + (1 + phi / 2) * xi);
  const nw3 = c * (-2 * xi3 + 3 * xi2 + phi * xi);
  const nw4 = c * L * (xi3 - (1 - phi / 2) * xi2 - (phi / 2) * xi);

  // Verdrehung (quadratisch). Bei Timoshenko ein ECHT unabhaengiges Feld —
  // deshalb koppelt das verteilte Moment ueber diese N und nicht ueber Nw'.
  const nt1 = (c * 6 * (xi2 - xi)) / L;
  const nt2 = c * (3 * xi2 - (4 + phi) * xi + 1 + phi);
  const nt3 = (c * 6 * (-xi2 + xi)) / L;
  const nt4 = c * (3 * xi2 - (2 - phi) * xi);

  // Ableitungen nach x = (1/L) * d/dxi.
  const dnw1 = (c * (6 * xi2 - 6 * xi - phi)) / L;
  const dnw2 = c * (3 * xi2 - (4 + phi) * xi + 1 + phi / 2);
  const dnw3 = (c * (-6 * xi2 + 6 * xi + phi)) / L;
  const dnw4 = c * (3 * xi2 - (2 - phi) * xi - phi / 2);

  const dnt1 = (c * 6 * (2 * xi - 1)) / (L * L);
  const dnt2 = (c * (6 * xi - (4 + phi))) / L;
  const dnt3 = (c * 6 * (1 - 2 * xi)) / (L * L);
  const dnt4 = (c * (6 * xi - (2 - phi))) / L;

  return {
    Nu: [nu1, 0, 0, nu2, 0, 0],
    Nw: [0, nw1, nw2, 0, nw3, nw4],
    Ntheta: [0, nt1, nt2, 0, nt3, nt4],
    dNu: [-1 / L, 0, 0, 1 / L, 0, 0],
    dNw: [0, dnw1, dnw2, 0, dnw3, dnw4],
    dNtheta: [0, dnt1, dnt2, 0, dnt3, dnt4],
  };
}
