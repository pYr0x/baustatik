const SIG_DIGITS = 4;
const MIN_DECIMAL_PLACES = 2;

export function smartRound(value: number): number {
  // 1. value === 0 → return 0
  if (value === 0) return 0;

  // 2. Exakt-Check: nur ganzzahlige Werte frühzeitig zurückgeben
  if (Number.isInteger(value)) return value;

  // 3. Magnitude berechnen
  const magnitude = Math.floor(Math.log10(Math.abs(value)));

  // 4. Nachkommastellen berechnen
  let decimalPlaces: number;
  if (magnitude >= 0) {
    decimalPlaces = Math.max(MIN_DECIMAL_PLACES, SIG_DIGITS - magnitude - 1);
  } else {
    decimalPlaces = SIG_DIGITS - magnitude - 1;
  }

  // 5. Runden
  const factor = 10 ** decimalPlaces;
  return Math.round(value * factor) / factor;
}

/**
 * Rundet über die atomare Einheit einer Kategorie.
 *
 * @param value        - Wert in Zieleinheit (z.B. 125.55 cm)
 * @param targetToBase - toBase der Zieleinheit (z.B. cm = 10)
 * @param atomicToBase - toBase der atomaren Einheit (immer 1)
 * @returns gerundeter Wert in Zieleinheit (z.B. 125.6 cm)
 *
 * Ablauf:
 *   1. value === 0 → return 0
 *   2. In atomare Einheit umrechnen
 *      atomicValue = value × targetToBase ÷ atomicToBase
 *   3. Auf ganze Zahl runden
 *      roundedAtomic = Math.round(atomicValue)
 *   4. Zurück in Zieleinheit
 *      result = roundedAtomic × atomicToBase ÷ targetToBase
 *   5. Floating-Point-Artefakte bereinigen
 *      return parseFloat(result.toPrecision(12))
 */
export function atomicRound(
  value: number,
  targetToBase: number,
  atomicToBase: number,
): number {
  if (value === 0) return 0;

  const atomicValue = (value * targetToBase) / atomicToBase;
  const roundedAtomic =
    Math.sign(atomicValue) * Math.round(Math.abs(atomicValue));
  const result = (roundedAtomic * atomicToBase) / targetToBase;

  return parseFloat(result.toPrecision(12));
}
