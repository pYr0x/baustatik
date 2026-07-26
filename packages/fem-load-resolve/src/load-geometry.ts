/**
 * Lage und Richtung einer Last auf dem Stab — die zwei Fragen, die vor jeder
 * Auswertung stehen: WO greift sie an, und WOHIN zeigt sie.
 *
 * Beide Antworten hingen bis hierher im Aufloesungspfad fest. Sie sind aber
 * nicht solverspezifisch: der Viewer stellt dieselbe Frage, wenn er einen Pfeil
 * zeichnet. Zweimal hergeleitet driften Bild und Rechnung genau in dem Paar
 * auseinander, fuer das man das Bild ueberhaupt anschaut — deshalb steht die
 * Herleitung hier einmal und wird exportiert.
 *
 * KEINE Balkentheorie, KEINE Lastwerte: nur Geometrie.
 */

import { Line, Vector } from '@baustatik/fem-geometry';
import type { LoadAxis, LoadFrame } from '@baustatik/fem-loads';

/** Obergrenze relativer Abstaende — `relativeDistances` misst in Prozent. */
const PERCENT = 100;

/**
 * Ein Abstand entlang der Stabachse, in Metern.
 *
 * Abstaende sind laut `fem-loads/src/types.ts` IMMER entlang der Stabachse
 * gemessen, unabhaengig von `referenceLength` — die skaliert nur den Lastwert,
 * nie die Lage.
 *
 * Das Klemmen faengt reines Fließkommarauschen ab (`pct * L / 100` trifft `L`
 * nicht zwingend exakt) und macht damit die in
 * `fem-element/src/types.ts` dokumentierte Invariante `0 <= from <= to <= L`
 * woertlich wahr statt nur bis auf eine Toleranz. Echte Bereichsfehler
 * versteckt es nicht: die hat `validate.ts` schon geworfen.
 */
export function loadStation(
  value: number,
  relative: boolean,
  L: number,
): number {
  const absolute = relative ? (value * L) / PERCENT : value;
  return Math.min(Math.max(absolute, 0), L);
}

/**
 * Der GLOBALE Einheitsvektor einer Kraftrichtung.
 *
 * `frame: 'global'` ist bereits die Zielbasis, `frame: 'local'` wird ueber
 * `Line.toGlobal` gedreht — dieselbe orthonormale Basis, die `toLocalComponents`
 * in der Gegenrichtung benutzt. Wer eine Richtung zeichnen will, braucht genau
 * das; wer sie rechnen will, braucht die Gegenrichtung.
 */
export function loadDirection(
  frame: LoadFrame,
  axis: LoadAxis,
  line: Line,
): Vector {
  const e = axis === 'x' ? Vector.make(1, 0) : Vector.make(0, 1);
  return frame === 'local' ? Line.toGlobal(line, e) : e;
}
