import type { SmartOptions } from './types';
import { isUnroundable } from './utils/guards';

/**
 * Rundet auf sigDigits signifikante Stellen,
 * mit mindestens minDecimals Nachkommastellen bei Werten >= 1.
 *
 * @param value   - Zahl zum Runden
 * @param options - { sigDigits: 4, minDecimals: 2 } (defaults)
 *
 * Beispiele (mit defaults):
 *   roundSmart(1333.333)   → 1333.33   (mag=3, NK=max(2, 0)=2)
 *   roundSmart(12.555)     → 12.56     (mag=1, NK=max(2, 2)=2)
 *   roundSmart(1.33333)    → 1.333     (mag=0, NK=max(2, 3)=3)
 *   roundSmart(0.001333)   → 0.001333  (mag=-3, NK=6)
 *   roundSmart(0)          → 0
 *   roundSmart(100)        → 100       (Integer → direkt zurück)
 *
 * Implementierung:
 *   1. isUnroundable(value) → return value
 *   2. Number.isInteger(value) → return value
 *   3. magnitude = Math.floor(Math.log10(Math.abs(value)))
 *   4. if magnitude >= 0:
 *        decimalPlaces = max(minDecimals, sigDigits - magnitude - 1)
 *      else:
 *        decimalPlaces = sigDigits - magnitude - 1
 *   5. decimalPlaces = cap(decimalPlaces, 0, 15)
 *   6. factor = 10^decimalPlaces
 *   7. return Math.round(value * factor) / factor
 */
export function roundSmart(value: number, options?: SmartOptions): number {
  if (isUnroundable(value)) {
    return value;
  }
  if (Number.isInteger(value)) {
    return value;
  }

  const sigDigits = options?.sigDigits ?? 4;
  const minDecimals = options?.minDecimals ?? 2;

  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  let decimalPlaces: number;

  if (magnitude >= 0) {
    decimalPlaces = Math.max(minDecimals, sigDigits - magnitude - 1);
  } else {
    decimalPlaces = sigDigits - magnitude - 1;
  }

  // Safety: Verhindert "Out of Range" Fehler
  decimalPlaces = Math.min(Math.max(decimalPlaces, 0), 15);

  const factor = 10 ** decimalPlaces;
  return Math.round(value * factor) / factor;
}
