import { isUnroundable } from './utils/guards';

/**
 * Rundet auf n signifikante Stellen.
 *
 * @param value - Zahl zum Runden
 * @param n     - Anzahl signifikante Stellen (>= 1)
 *
 * Beispiele:
 *   roundToSignificant(1333.333, 4) → 1333
 *   roundToSignificant(0.001333, 4) → 0.001333
 *   roundToSignificant(12.555, 3)   → 12.6
 *   roundToSignificant(0, 4)        → 0
 *
 * Implementierung:
 *   1. isUnroundable(value) → return value
 *   2. n = cap(n, 1, 15)
 *   3. magnitude = Math.floor(Math.log10(Math.abs(value)))
 *   4. factor = 10^(n - magnitude - 1)
 *   5. return Math.round(value * factor) / factor
 */
export function roundToSignificant(value: number, n: number): number {
  if (isUnroundable(value)) {
    return value;
  }

  // Falls n ungültig ist, geben wir den Wert ungerundet zurück
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 1) {
    return value;
  }

  // Safety: Verhindert "Out of Range" Fehler
  const sigDigits = Math.min(n, 15);

  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  const factor = 10 ** (sigDigits - magnitude - 1);
  return Math.round(value * factor) / factor;
}
