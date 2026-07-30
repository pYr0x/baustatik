/**
 * Der Schubkorrekturbeiwert hat EINE Definition: die Schubenergie.
 *
 *     A_s = I^2 / integral (S/t)^2 dA   mit dA = t ds
 *         = I^2 / integral S^2 / t ds
 *
 * Das Integral laeuft ueber den WANDSCHUBFLUSS-WEG, nicht ueber Flaechenschnitte
 * — die beiden Definitionen fallen beim Rechteck zusammen und beim I-Profil um
 * 11 % auseinander. Gegen die IPE-Reihe geprueft ist die hier verwendete
 * ([ADR 0021](../../../docs/adr/0021-section-values-separate-from-tabulated-profiles.md)).
 *
 * Fuers Rechteck faellt daraus exakt 5/6 heraus; der Wert wird nirgends gesetzt,
 * sondern gerechnet, und ein Test haelt fest, dass 5/6 herauskommt.
 *
 * KEINE QUADRATUR IN DIESER DATEI. `S(s)` ist auf jedem Abschnitt ein Polynom
 * zweiten Grades, `S^2` also eines vierten — das Integral ist geschlossen
 * angebbar. Die numerische Integration lebt im TEST, als unabhaengiges Orakel
 * fuer die Herleitungen.
 */

/**
 * Ein Abschnitt des Schubflusswegs.
 *
 * `S(s) = c0 + c1*s + c2*s^2` fuer `s` in `[0, length]`, bei konstanter Dicke
 * `t`. Mehr Ausdruckskraft braucht keine der Formen: eine Wand hat konstante
 * Dicke, und `S` waechst laengs einer Wand hoechstens quadratisch (linear, wenn
 * die Wand quer zur Schubrichtung liegt).
 */
export type ShearSegment = {
  readonly length: number;
  readonly t: number;
  readonly c0: number;
  readonly c1: number;
  readonly c2: number;
};

/** Ein Band quer zur Schubrichtung: konstante Breite ueber die Laenge `extent`. */
export type Band = {
  readonly extent: number;
  readonly width: number;
};

/** `integral_0^L (c0 + c1 s + c2 s^2)^2 ds / t`, ausmultipliziert. */
export function shearFlowIntegral(segment: ShearSegment): number {
  const { length: L, t, c0, c1, c2 } = segment;
  const L2 = L * L;
  const L3 = L2 * L;
  const L4 = L3 * L;
  const L5 = L4 * L;
  return (
    (c0 * c0 * L +
      c0 * c1 * L2 +
      ((c1 * c1) / 3 + (2 * c0 * c2) / 3) * L3 +
      ((c1 * c2) / 2) * L4 +
      ((c2 * c2) / 5) * L5) /
    t
  );
}

/**
 * Die Schubflaeche `A_s` aus dem Traegheitsmoment und dem Weg.
 *
 * `I` ist IMMER das der Umrissfigur, auch wenn der Weg duennwandig idealisiert
 * ist. Genau so rechnet RSTAB, und genau daran haengt die Uebereinstimmung mit
 * dem Katalog.
 */
export function shearArea(
  I: number,
  segments: readonly ShearSegment[],
): number {
  let denominator = 0;
  for (const segment of segments) denominator += shearFlowIntegral(segment);
  return (I * I) / denominator;
}

/**
 * Baender LAENGS der Schubrichtung, aneinandergereiht ab der Koordinate
 * `start` (relativ zum Schwerpunkt gemessen, also negativ am oberen bzw.
 * linken freien Rand).
 *
 * Innerhalb eines Bandes konstanter Breite `w`, das bei `a` beginnt, ist
 *
 *     S(a + s) = S(a) + w*a*s + (w/2)*s^2
 *
 * — das ist die ganze Herleitung, und sie gilt fuer den kompakten
 * Flaechenschnitt genauso wie fuer eine Wand, die in Schubrichtung laeuft.
 *
 * SELBSTPRUEFEND: laeuft die Bandfolge ueber den ganzen Querschnitt, muss `S`
 * am Ende 0 sein — das erste Flaechenmoment um den Schwerpunkt verschwindet.
 * `closingMoment` gibt den Restwert zurueck, damit ein Test ihn pruefen kann.
 */
export function bandSegments(
  start: number,
  bands: readonly Band[],
  S0 = 0,
): { segments: ShearSegment[]; closingMoment: number } {
  const segments: ShearSegment[] = [];
  let a = start;
  let S = S0;
  for (const { extent: L, width: w } of bands) {
    segments.push({ length: L, t: w, c0: S, c1: w * a, c2: w / 2 });
    S = S + w * a * L + (w / 2) * L * L;
    a += L;
  }
  return { segments, closingMoment: S };
}

/**
 * Eine Wand QUER zur Schubrichtung — der Flansch bei `Vz`, der Steg bei `Vy`.
 *
 * Der Hebelarm `arm` ist ueber die ganze Wand derselbe, `S` waechst also nur
 * linear: `S(s) = S0 + arm*t*s`.
 */
export function crossWallSegment(
  arm: number,
  t: number,
  length: number,
  S0 = 0,
): ShearSegment {
  return { length, t, c0: S0, c1: arm * t, c2: 0 };
}

/** Der Endwert von `S` eines Abschnitts — fuer Anschluss und Selbstpruefung. */
export function endMoment(segment: ShearSegment): number {
  const { length: L, c0, c1, c2 } = segment;
  return c0 + c1 * L + c2 * L * L;
}
