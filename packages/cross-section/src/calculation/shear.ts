/**
 * Der Schubkorrekturbeiwert hat EINE Definition: die Schubenergie.
 *
 *     A_s = I^2 / integral (S/t)^2 dA   mit dA = t ds
 *         = I^2 / integral S^2 / t ds
 *
 * Das Integral laeuft ueber den WANDSCHUBFLUSS-WEG, nicht ueber Flaechenschnitte
 * — die beiden Definitionen fallen beim Rechteck zusammen und beim I-Profil um
 * 11 % auseinander. Gegen die IPE-Reihe geprueft ist die hier verwendete
 * ([ADR 0021](../../../../docs/adr/0021-section-values-separate-from-tabulated-profiles.md)).
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
 * Ein Intervall des Schubflusswegs.
 *
 * `S(s) = c0 + c1*s + c2*s^2` fuer `s` in `[0, length]`, bei konstanter Dicke
 * `t`. Mehr Ausdruckskraft braucht keine der Formen: eine Wand hat konstante
 * Dicke, und `S` waechst laengs einer Wand hoechstens quadratisch (linear, wenn
 * die Wand quer zur Schubrichtung liegt).
 *
 * INTERVALL UND NICHT SEGMENT, weil der Typ LAGELOS ist: er benennt ein Stueck
 * der Laufkoordinate `s`, kein Stueck Querschnitt. `pathZ` des I-Profils
 * benutzt dasselbe Gurtobjekt viermal — einen Ort koennte man daraus nicht
 * ablesen, und `Segment` verspraeche genau den. Das Wort bleibt deshalb frei
 * fuer das POSITIONIERTE Wegstueck mit Startpunkt und Richtung, aus dem kappa
 * und die Spannungspunkte einmal gemeinsam fallen sollen (`packages/TODO.md`).
 *
 * NICHT `ShearEnergyInterval`: `integral S^2/t ds` ist mit `L^6` eine rein
 * GEOMETRISCHE Groesse — deshalb faellt `A_s = I^2/integral` als Flaeche heraus.
 * Die Schubenergie ist das Prinzip, aus dem die Formel folgt (siehe oben), und
 * gehoert in die Begruendung, nicht in einen Typnamen, der sonst eine Einheit
 * behauptet, die er nicht traegt.
 */
export type ShearFlowInterval = {
  readonly length: number;
  readonly t: number;
  readonly c0: number;
  readonly c1: number;
  readonly c2: number;
};

/**
 * Eine TEILFLAECHE laengs der Schubrichtung: ueber die Laufkoordinate reicht sie
 * `extent` weit, quer dazu hat sie die konstante Breite `width`.
 *
 * Sie hat keine feste Gestalt — der Gurt eines I ist flach und breit, der Steg
 * hoch und schmal, und `width` darf eine SUMME ueber getrennte Bereiche sein
 * (`2*tf`, wenn ein senkrechter Schnitt beide Gurte trifft). Das Gegenstueck
 * fuer Flaechenschnitte ist `OutlinePart` in `stress-points/outline.ts`, das
 * dasselbe mit `from`/`to` statt mit `extent` beschreibt.
 */
export type Part = {
  readonly extent: number;
  readonly width: number;
};

/** `integral_0^L (c0 + c1 s + c2 s^2)^2 ds / t`, ausmultipliziert. */
export function shearFlowIntegral(interval: ShearFlowInterval): number {
  const { length: L, t, c0, c1, c2 } = interval;
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
  intervals: readonly ShearFlowInterval[],
): number {
  let denominator = 0;
  for (const interval of intervals) denominator += shearFlowIntegral(interval);
  return (I * I) / denominator;
}

/**
 * Teilflaechen LAENGS der Schubrichtung, aneinandergereiht ab der Koordinate
 * `start` (relativ zum Schwerpunkt gemessen, also negativ am oberen bzw.
 * linken freien Rand).
 *
 * Innerhalb einer Teilflaeche konstanter Breite `w`, die bei `a` beginnt, ist
 *
 *     S(a + s) = S(a) + w*a*s + (w/2)*s^2
 *
 * — das ist die ganze Herleitung, und sie gilt fuer den kompakten
 * Flaechenschnitt genauso wie fuer eine Wand, die in Schubrichtung laeuft.
 *
 * SELBSTPRUEFEND: laeuft die Folge ueber den ganzen Querschnitt, muss `S`
 * am Ende 0 sein — das erste Flaechenmoment um den Schwerpunkt verschwindet.
 * `closingMoment` gibt den Restwert zurueck, damit ein Test ihn pruefen kann.
 */
export function partIntervals(
  start: number,
  parts: readonly Part[],
  S0 = 0,
): { intervals: ShearFlowInterval[]; closingMoment: number } {
  const intervals: ShearFlowInterval[] = [];
  let a = start;
  let S = S0;
  for (const { extent: L, width: w } of parts) {
    intervals.push({ length: L, t: w, c0: S, c1: w * a, c2: w / 2 });
    S = S + w * a * L + (w / 2) * L * L;
    a += L;
  }
  return { intervals, closingMoment: S };
}

/**
 * Eine Wand QUER zur Schubrichtung — der Flansch bei `Vz`, der Steg bei `Vy`.
 *
 * Der Hebelarm `arm` ist ueber die ganze Wand derselbe, `S` waechst also nur
 * linear: `S(s) = S0 + arm*t*s`.
 */
export function crossWallInterval(
  arm: number,
  t: number,
  length: number,
  S0 = 0,
): ShearFlowInterval {
  return { length, t, c0: S0, c1: arm * t, c2: 0 };
}

/** Der Endwert von `S` eines Intervalls — fuer Anschluss und Selbstpruefung. */
export function endMoment(interval: ShearFlowInterval): number {
  const { length: L, c0, c1, c2 } = interval;
  return c0 + c1 * L + c2 * L * L;
}
