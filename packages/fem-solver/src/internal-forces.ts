/**
 * Die Verlauf-API: `N`, `V` und `M` aus einem abgelegten Ergebnis.
 *
 * FREIE FUNKTIONEN, KEINE METHODEN AM ERGEBNIS. `SolveResult` ist damit reine
 * Daten — klonbar, serialisierbar, ueber einen Worker schickbar. Eine Methode
 * waere eine Closure am Ergebnis und ueberlebte weder `structuredClone` noch
 * `JSON` (ADR 0019).
 *
 * SIE LESEN NIEMALS `config` — weder Geometrie noch Lasten noch
 * Querschnittswerte. Alles, was sie brauchen, steht in
 * `SolveResult.beamStates`; deshalb kann ein Ergebnis nicht in dem Sinne
 * veralten, dass es alte und neue Eingaben mischt. Dass die Anwendung ihre
 * Ergebnisse bei jeder Modelaenderung verwirft, dient dem Speicher und der
 * Anzeige, nicht der Korrektheit.
 *
 * Beide delegieren an `@baustatik/fem-element` — die Balkentheorie bleibt dort,
 * wie beim Aufstellen auch.
 */

import {
  internalForcesAt as elementForcesAt,
  internalForcesStations,
  type SectionForces,
  type Side,
} from '@baustatik/fem-element';
import { UnknownBeamError } from './errors';
import type { SolveResult } from './solve';

/** Ein Punkt des Verlaufs: die Stelle und die drei Schnittgroessen. */
export type SectionForcesAt = SectionForces & {
  /** Lokale Stelle [m], 0..L, ab dem Anfangsknoten entlang der Stabachse. */
  x: number;
};

/**
 * `N`, `V` und `M` eines Stabs an der lokalen Stelle `x`.
 *
 * `x` ist ABSOLUT in Metern, gemessen ab dem Anfangsknoten entlang der
 * Stabachse; `side` entscheidet an einer Einzellast, welcher einseitige
 * Grenzwert gemeint ist.
 */
export function internalForcesAt(
  result: SolveResult,
  beamId: string,
  x: number,
  side?: Side,
): SectionForces {
  return elementForcesAt(stateOf(result, beamId), x, side);
}

/**
 * Der ganze Verlauf eines Stabs, als Liste.
 *
 * MISCHT die Pflichtstuetzstellen aus `fem-element` (Raender, Segmentgrenzen,
 * Lastpositionen, Extremstellen) mit einem GROBEN gleichmaessigen Raster. Das
 * Raster allein waere fuer ein Diagramm zu wenig — es traefe die Extremstelle
 * nur zufaellig —, die Stuetzstellen allein zeichneten den Bogen zwischen zwei
 * Lasten als Gerade.
 *
 * AN EINER SPRUNGSTELLE STEHEN ZWEI EINTRAEGE mit gleichem `x`, erst links,
 * dann rechts. Wer sie in dieser Reihenfolge als Polygonzug zeichnet, bekommt
 * die senkrechte Flanke geschenkt; wer ein Maximum sucht, sieht beide Werte.
 */
export function internalForcesAlong(
  result: SolveResult,
  beamId: string,
  opts: { subdivisions?: number } = {},
): SectionForcesAt[] {
  const state = stateOf(result, beamId);
  const { subdivisions = 20 } = opts;

  const stations = internalForcesStations(state);
  const grid = Array.from(
    { length: Math.max(subdivisions, 1) + 1 },
    (_, i) => (state.L * i) / Math.max(subdivisions, 1),
  );

  // Eine Rasterstelle, die auf einer Stuetzstelle liegt, faellt weg — sonst
  // stuende dort ein dritter Eintrag zwischen dem linken und dem rechten Wert.
  //
  // DIESELBE relative Schranke wie in `fem-element`, bewusst noch einmal
  // hingeschrieben statt geteilt: sie beurteilt hier etwas anderes — nicht, ob
  // eine Stelle noch auf dem Stab liegt, sondern ob zwei Stellen DIESELBE sind.
  // Ein geteilter Export haette beide Bedeutungen aneinandergebunden.
  const eps = 1e-9 * Math.max(1, state.L);
  const near = (a: number, b: number) => Math.abs(a - b) <= eps;

  // Die Sprungstellen kommen aus `load.points` und nicht aus der
  // Stuetzstellenliste: die ist per Vertrag eine Liste EINDEUTIGER Positionen
  // und sagt deshalb nicht, an welcher davon zwei Werte stehen.
  const isJump = (x: number) =>
    state.load.points.some((point) => near(point.a, x));

  const positions = [
    ...stations,
    ...grid.filter((x) => !stations.some((s) => near(s, x))),
  ].sort((a, b) => a - b);

  const points: SectionForcesAt[] = [];
  for (const x of positions) {
    points.push({ x, ...elementForcesAt(state, x, 'left') });
    if (isJump(x)) points.push({ x, ...elementForcesAt(state, x, 'right') });
  }
  return points;
}

function stateOf(result: SolveResult, beamId: string) {
  const state = result.beamStates.get(beamId);
  if (state === undefined) {
    throw new UnknownBeamError(beamId, result.loadCaseId);
  }
  return state;
}
