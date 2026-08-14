/**
 * Schnittgroessen aus GLEICHGEWICHT, nicht aus dem Stoffgesetz.
 *
 *   N(x) = -e[0] - int_0^x qx dxi - sum_{a<x} px
 *   V(x) = -e[1] - int_0^x qz dxi - sum_{a<x} pz
 *   M(x) = +e[2] + int_0^x (V + my_e) dxi + sum_{a<x} p.my
 *
 * mit `e` = Stabendkraefte (`ElementEvaluationState.endForces`). Das ist EXAKT
 * fuer den geraden, prismatischen Stab nach Theorie I. Ordnung: die
 * Stabendkraefte sind knotenexakt, und Gleichgewicht kennt keinen
 * Diskretisierungsfehler. Timoshenko und Euler-Bernoulli haben deshalb
 * DIESELBE Formel — der Schub steckt vollstaendig in den Stabendkraeften.
 * KEIN `EA`, kein `EI`, kein `phi`, keine Ansatzfunktion.
 *
 * DER STOFFGESETZ-WEG IST AUSGESCHLOSSEN (`M = EI * theta'` aus den
 * Ansatzfunktionen): beim beidseitig eingespannten Traeger unter Gleichlast
 * sind alle Knotenfreiheitsgrade null, er liefert `M == 0` statt `-qL^2/12` und
 * `+qL^2/24`. Herleitung und verworfene Alternative:
 * [ADR 0018](../../../docs/adr/0018-section-forces-from-equilibrium.md).
 *
 * ZWEI FALLEN, die festgehalten gehoeren:
 *
 * - `dM/dx = V + my_e`, nicht `dM/dx = V`. `my_e` traegt bereits das Minus aus
 *   `fem-load-resolve` (`my_e = -m`, ADR 0005) — mit `+m` wuerde der Kragarm
 *   unter Streckenmoment `M(L) = 2mL` statt `0` melden.
 * - `sum_{a<x}` ist STRIKT kleiner und liefert damit ueberall den linksseitigen
 *   Grenzwert; die rechtsseitige Variante summiert `a <= x`.
 *
 * VORZEICHENKONVENTION, eine Regel: ein positiver Wert wird auf der lokalen
 * +z-Seite des Stabs aufgetragen. Mechanisch heisst das `M(x) = int(sigma*z dA)`
 * — positives Moment ist Zug auf der +z-Seite —, `V` positiv auf dem positiven
 * Schnittufer in +z-Richtung, `N` positiv = Zug.
 *
 * STABENDKRAFT != SCHNITTGROESSE. Die Umrechnung:
 *
 *   |     | linksseitig bei x = 0 | rechtsseitig bei x = L |
 *   | `N` | `-e[0]`               | `+e[3]`                |
 *   | `V` | `-e[1]`               | `+e[4]`                |
 *   | `M` | `+e[2]`               | `-e[5]`                |
 *
 * Das Moment tanzt aus der Reihe, weil `theta` (Element, +x nach +z) gegen
 * `phiY` (Knoten) laeuft — dasselbe Minus wie ADR 0005.
 */

import { StationOutsideElementError } from './errors';
import type {
  ElementEvaluationState,
  LineLoadSegment,
  LocalElementLoad,
  SectionForces,
  Side,
} from './types';

/**
 * Dieselbe relative Lagetoleranz wie `requireOnElement` in `timoshenko.ts`.
 * Bewusst dieselbe Zahl an einer zweiten Stelle statt eines geteilten Exports:
 * beide bewachen die Lage auf dem Stab, und wenn eine Last bei `L + 1e-12`
 * noch angenommen wird, muss eine Abfrage dort auch noch beantwortet werden.
 */
const GEOMETRY_EPS = 1e-9;

function geometryEps(L: number): number {
  return GEOMETRY_EPS * Math.max(1, L);
}

/**
 * Die beiden Integrale eines linearen Lastabschnitts bis zur Stelle `x`:
 *
 *   I0 = int_a^t q dη            (fuer N und V)
 *   I1 = int_a^t q * (x - η) dη  (fuer M — das Doppelintegral von q)
 *
 * mit `t = min(x, to)`. `I1` ist die geschlossene Form von
 * `int_0^x (int_0^xi q) dxi`: fuer `x > to` faellt der konstante Restanteil
 * `Itot * (x - to)` genau in dieselbe Formel, weil `int_a^to q*(to-η) dη +
 * Itot*(x-to) = int_a^to q*(x-η) dη`. Deshalb genuegt EIN Ausdruck fuer beide
 * Faelle statt einer Fallunterscheidung, die man beim Lesen nachrechnen muss.
 */
function segmentIntegrals(
  from: number,
  to: number,
  value1: number,
  value2: number,
  x: number,
): { I0: number; I1: number } {
  const span = to - from;
  // Entartetes Segment traegt nichts bei; ohne die Abkuerzung entstuende bei
  // der Interpolation eine Division durch null.
  if (span <= 0 || x <= from) return { I0: 0, I1: 0 };

  const s = Math.min(x, to) - from;
  const X = x - from;
  const slope = (value2 - value1) / span;

  return {
    I0: value1 * s + (slope * s * s) / 2,
    I1:
      value1 * X * s -
      (value1 * s * s) / 2 +
      (slope * X * s * s) / 2 -
      (slope * s * s * s) / 3,
  };
}

/** Die Streckenlast an der Stelle `x`, summiert ueber alle Abschnitte. */
function lineLoadAt(
  load: LocalElementLoad,
  x: number,
  pick: (segment: LineLoadSegment) => [number, number],
): number {
  let sum = 0;
  for (const segment of load.segments) {
    const span = segment.to - segment.from;
    if (span <= 0 || x < segment.from || x > segment.to) continue;
    const [v1, v2] = pick(segment);
    sum += v1 + ((v2 - v1) * (x - segment.from)) / span;
  }
  return sum;
}

/** `qz` an der Stelle `x` — die Ableitung `-dV/dx`. */
function qzAt(load: LocalElementLoad, x: number): number {
  return lineLoadAt(load, x, (s) => [s.qz1, s.qz2]);
}

/** `my_e` an der Stelle `x`. */
function myAt(load: LocalElementLoad, x: number): number {
  return lineLoadAt(load, x, (s) => [s.my1, s.my2]);
}

/** Ob eine Einzellast bei `a` links von `x` liegt — je nach Seite mit `<` oder `<=`. */
function counts(a: number, x: number, side: Side): boolean {
  return side === 'left' ? a < x : a <= x;
}

/**
 * `N`, `V` und `M` an der lokalen Stelle `x`.
 *
 * `x` ist ABSOLUT in Metern, `0 … L`, gemessen ab dem Anfangsknoten entlang der
 * Stabachse. Es gibt bewusst keinen relativen Modus: das ist eine Abfrage, keine
 * abgelegte Eingabe, und zwei Schreibweisen fuer dieselbe Stelle waeren eine
 * Verwechslung, die niemand bemerkt.
 *
 * `side` entscheidet an einer Einzellast, welcher einseitige Grenzwert gemeint
 * ist. Ueberall sonst sind beide gleich.
 */
export function internalForcesAt(
  state: ElementEvaluationState,
  x: number,
  side: Side = 'left',
): SectionForces {
  const { L, endForces: e, load } = state;
  const eps = geometryEps(L);
  if (!(x >= -eps) || !(x <= L + eps)) {
    throw new StationOutsideElementError(x, L);
  }
  // Die Toleranz laesst Werte knapp ausserhalb zu; gerechnet wird auf dem Stab.
  const at = clamp(x, L);

  let Qx = 0;
  let Qz = 0;
  let QQz = 0;
  let My = 0;
  for (const segment of load.segments) {
    const { from, to } = segment;
    Qx += segmentIntegrals(from, to, segment.qx1, segment.qx2, at).I0;
    My += segmentIntegrals(from, to, segment.my1, segment.my2, at).I0;
    const z = segmentIntegrals(from, to, segment.qz1, segment.qz2, at);
    Qz += z.I0;
    QQz += z.I1;
  }

  let Px = 0;
  let Pz = 0;
  let Pm = 0;
  // Das Moment einer Einzelquerkraft waechst mit dem Hebelarm `at - a`; die
  // Sprungstelle liegt in der Kraft, nicht im Moment — deshalb ist `M` an einer
  // Einzelkraft stetig und nur `V` unstetig.
  let PzLever = 0;
  for (const point of load.points) {
    if (!counts(point.a, at, side)) continue;
    Px += point.px;
    Pz += point.pz;
    Pm += point.my;
    PzLever += point.pz * (at - point.a);
  }

  return {
    N: -e[0] - Qx - Px,
    V: -e[1] - Qz - Pz,
    M: e[2] - e[1] * at - QQz - PzLever + My + Pm,
  };
}

/**
 * Die Pflichtstuetzstellen: jede Stelle, an der der Verlauf einen Knick, einen
 * Sprung oder ein Extremum haben KANN.
 *
 * 1. `0` und `L`
 * 2. jede Segmentgrenze (`from`, `to`) — Knick, eine Stelle genuegt
 * 3. jede Einzellastposition (`a`) — Sprung; wer beide Werte will, fragt
 *    `internalForcesAt` dort mit `'left'` UND `'right'`
 * 4. die Wurzeln von `V + my_e = 0` und `qz = 0` je Intervall
 *
 * PUNKT 4 IST DER GRUND, warum ein daraus gemeldetes Maximum EXAKT ist und
 * nicht an der Rasterweite haengt: zwischen zwei Stuetzstellen aus 1–3 ist `q`
 * linear, also `V` quadratisch und `M` kubisch — die Extremstellen sind
 * ausrechenbar. Der Fall „Maximum liegt auf der Einzellast, `V` geht nur durch
 * den Sprung durch null" ist ueber Punkt 3 abgedeckt.
 *
 * DIE STELLEN KOMMEN AUS DEM ZUSTAND, nicht aus `fem-load-resolve`: die
 * Auswertung darf nichts nachlesen — das ist die Eigenschaft, die das abgelegte
 * Ergebnis traegt (ADR 0019).
 *
 * Aufsteigend sortiert, ohne Dubletten.
 */
export function internalForcesStations(
  state: ElementEvaluationState,
): number[] {
  const { L, load } = state;
  const eps = geometryEps(L);

  const base = [0, L];
  for (const segment of load.segments) base.push(segment.from, segment.to);
  for (const point of load.points) base.push(point.a);

  const stations = unique(
    base.map((x) => clamp(x, L)),
    eps,
  );

  // Punkt 4, je Intervall zwischen zwei benachbarten Grundstuetzstellen: dort
  // ist `qz` linear und `V + my_e` quadratisch, beides ohne Sprung.
  const extrema: number[] = [];
  for (let i = 0; i + 1 < stations.length; i += 1) {
    const x0 = stations[i];
    const h = stations[i + 1] - x0;
    if (h <= eps) continue;

    extrema.push(
      ...rootsIn(
        x0,
        h,
        (x) => internalForcesAt(state, x, 'left').V + myAt(load, x),
      ),
      ...rootsIn(x0, h, (x) => qzAt(load, x)),
    );
  }

  return unique([...stations, ...extrema], eps);
}

/**
 * Nullstellen einer hoechstens quadratischen Funktion im Intervall
 * `[x0, x0 + h]`.
 *
 * Die Koeffizienten werden aus DREI Stuetzwerten gewonnen statt symbolisch aus
 * der Last hergeleitet: die Funktion IST dort quadratisch, damit ist die
 * Interpolation exakt und nicht genaehert — und sie bleibt richtig, wenn `V`
 * spaeter um einen weiteren Lastanteil waechst. Abgetastet wird bei 1/4, 1/2
 * und 3/4, nicht an den Raendern, weil dort die Zugehoerigkeit zu einem
 * Lastabschnitt mehrdeutig ist.
 */
function rootsIn(x0: number, h: number, f: (x: number) => number): number[] {
  const g1 = f(x0 + 0.25 * h);
  const g2 = f(x0 + 0.5 * h);
  const g3 = f(x0 + 0.75 * h);

  const a = 8 * (g1 - 2 * g2 + g3);
  const b = 2 * (g3 - g1) - a;
  const c = g2 - 0.5 * b - 0.25 * a;

  const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c));
  // Nichts zu finden: die Funktion ist im Intervall identisch null (dann ist
  // JEDE Stelle Wurzel und keine ist ausgezeichnet) oder eine Konstante != 0.
  if (scale === 0) return [];

  const roots: number[] = [];
  if (Math.abs(a) <= 1e-12 * scale) {
    if (Math.abs(b) > 1e-12 * scale) roots.push(-c / b);
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const q = Math.sqrt(discriminant);
      roots.push((-b + q) / (2 * a), (-b - q) / (2 * a));
    }
  }

  return roots.filter((t) => t > 0 && t < 1).map((t) => x0 + t * h);
}

function clamp(x: number, L: number): number {
  return Math.min(Math.max(x, 0), L);
}

/** Aufsteigend sortiert, Stellen naeher als `eps` zusammengefasst. */
function unique(values: readonly number[], eps: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const result: number[] = [];
  for (const value of sorted) {
    if (result.length === 0 || value - result[result.length - 1] > eps) {
      result.push(value);
    }
  }
  return result;
}
