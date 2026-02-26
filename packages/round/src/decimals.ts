import { isUnroundable } from './utils/guards';

/**
 * Rundet auf n Nachkommastellen.
 *
 * @param value - Zahl zum Runden
 * @param n     - Anzahl Nachkommastellen (>= 0)
 *
 * Beispiele:
 *   roundToDecimals(1.2555, 2) → 1.26
 *   roundToDecimals(1.2555, 0) → 1
 *   roundToDecimals(1.5, 0)    → 2
 *   roundToDecimals(-1.2555, 2) → -1.26
 *
 * Implementierung:
 *   1. isUnroundable(value) → return value
 *   2. n = cap(n, 0, 15)
 *   3. factor = 10^n
 *   4. return Math.round(value * factor) / factor
 */
export function roundToDecimals(value: number, n: number): number {
  if (isUnroundable(value)) {
    return value;
  }

  // Falls n ungültig ist, geben wir den Wert ungerundet zurück
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) {
    return value;
  }

  // Safety: Verhindert "Out of Range" Fehler bei extrem großen n
  const decimalPlaces = Math.min(n, 15);

  const factor = 10 ** decimalPlaces;
  return Math.round(value * factor) / factor;
}
