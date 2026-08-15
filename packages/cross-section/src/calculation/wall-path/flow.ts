import {
  endMoment,
  type ShearFlowInterval,
  shearArea,
  shearFlowIntegral,
} from '../shear';
import type { Segment } from './segments';
import type { Sigma, Step } from './topology';

/** Das Vorzeichen, mit dem ein Moment auf eine Achse geht. */
type Sign = -1 | 1;

/** Ein Stück Weg mit allem, was die drei Grössen davon brauchen. */
export type FlowEntry = {
  readonly interval: ShearFlowInterval;
  /**
   * Der Hebelarm der Wandtangente um den URSPRUNG, `r = y·dz − z·dy`.
   *
   * Auf einem GERADEN Stück ist er konstant — `(p + s·u) × u = p × u` —, und
   * genau deshalb ist `∫S·r ds` hier `r · ∫S ds` und keine zweite Quadratur.
   * Positiv dreht von `+y` nach `+z` (ADR 0031).
   */
  readonly r: number;
  readonly sigma: Sigma;
};

/**
 * Der Schubflussweg für EINE Richtung, samt Zellkorrektur.
 *
 * `arm` ist der Abstand zur Schwerpunktachse des WANDMODELLS, `slope` seine
 * Änderung längs des Stücks. Damit ist `S(s) = c0 + c1·s + c2·s²` mit
 * `c1 = t·arm` und `c2 = t·slope/2` — dieselbe Herleitung, die
 * `partIntervals` und `crossWallInterval` für die parametrischen Formen
 * schreiben, nur aus der Lage statt aus einer Teilflächenfolge.
 */
export function flow(
  steps: readonly Step[],
  arm: (segment: Segment) => number,
  slope: (segment: Segment) => number,
  hasCell: boolean,
): { entries: readonly FlowEntry[]; closing: number } {
  const arrived = new Map<string, number>();
  const entries: FlowEntry[] = [];
  let closing = 0;

  for (const step of steps) {
    let S = arrived.get(step.from) ?? 0;
    for (const segment of step.segments) {
      const interval: ShearFlowInterval = {
        length: segment.length,
        t: segment.t,
        c0: S,
        c1: segment.t * arm(segment),
        c2: (segment.t * slope(segment)) / 2,
      };
      entries.push({
        interval,
        r: segment.y * segment.dz - segment.z * segment.dy,
        sigma: step.sigma,
      });
      S = endMoment(interval);
    }
    closing = (arrived.get(step.to) ?? 0) + S;
    arrived.set(step.to, closing);
  }

  return hasCell
    ? { entries: withCellFlow(entries), closing }
    : { entries, closing };
}

/**
 * Der Zuschlag `S₀` der einen Zelle — die skalare Verträglichkeit.
 *
 * `∮ q/(G·t) ds = 0` um die Zelle, und weil `q ∝ S` ist, heisst das
 * `∮ S/t ds = 0`. Gemessen wird im Umlaufsinn, deshalb `sigma`.
 */
function withCellFlow(entries: readonly FlowEntry[]): readonly FlowEntry[] {
  let numerator = 0;
  let denominator = 0;
  for (const { interval, sigma } of entries) {
    if (sigma === 0) continue;
    numerator += (sigma * flowIntegral(interval)) / interval.t;
    denominator += interval.length / interval.t;
  }
  if (!(Number.isFinite(denominator) && denominator > 0)) return entries;

  const S0 = -numerator / denominator;
  return entries.map((entry) =>
    entry.sigma === 0
      ? entry
      : {
          ...entry,
          interval: {
            ...entry.interval,
            c0: entry.interval.c0 + entry.sigma * S0,
          },
        },
  );
}

/** `∫₀^L (c0 + c1·s + c2·s²) ds`, geschlossen. */
function flowIntegral(interval: ShearFlowInterval): number {
  const { length: L, c0, c1, c2 } = interval;
  return c0 * L + (c1 * L * L) / 2 + (c2 * L * L * L) / 3;
}

/**
 * κ aus dem Weg und der UMRISSFIGUR — oder `undefined` bei der Entartung.
 *
 * DIE ENTARTUNG IST ECHT und keine Vorsicht: eine einzelne gerade Wand trägt
 * für die Achse LÄNGS ihrer selbst kein `S` — der Hebelarm ist überall 0, das
 * Integral ebenfalls, und `I²/0` wäre `Infinity`. `sectionProperties` liegt auf
 * der Rechenstrecke, also wird hier weder geworfen noch ein `Infinity`
 * weitergereicht; „nicht ermittelt" ist die richtige Auskunft.
 */
export function kappa(
  I: number,
  A: number,
  entries: readonly FlowEntry[],
): number | undefined {
  let denominator = 0;
  for (const { interval } of entries) {
    denominator += shearFlowIntegral(interval);
  }
  if (!(Number.isFinite(denominator) && denominator > 0)) return undefined;
  if (!(Number.isFinite(I) && Number.isFinite(A) && A > 0)) return undefined;

  const value =
    shearArea(
      I,
      entries.map((entry) => entry.interval),
    ) / A;
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Der Schubmittelpunkt aus dem Moment des Schubflusses — beide Figuren aus dem
 * WANDMODELL (ADR 0041).
 *
 * `T = ∮ q·r ds` um den Ursprung, mit `q = −V·S/I`. Für `Vz` ist das Moment
 * `yM·Vz`, für `Vy` ist es `−zM·Vy` — daher die beiden Vorzeichen, und deshalb
 * steht `sign` als Parameter da statt als zweite Funktion.
 *
 * DAS ERGEBNIS LIEGT IM EINGABESYSTEM, weil `r` um dessen Ursprung gemessen
 * wird — die Invariante aus ADR 0031: `yM`/`zM` teilen das System von
 * `ys`/`zs`.
 */
export function shearCentre(
  sign: Sign,
  I: number,
  entries: readonly FlowEntry[],
): number | undefined {
  if (!(Number.isFinite(I) && I > 0)) return undefined;

  let moment = 0;
  for (const { interval, r } of entries) moment += r * flowIntegral(interval);

  const value = (sign * moment) / I;
  return Number.isFinite(value) ? value : undefined;
}
