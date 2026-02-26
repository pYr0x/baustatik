import { isUnroundable, isValidFactor } from './utils/guards';

/**
 * Rundet über eine atomare Einheit.
 * Wert wird in atomare Einheit umgerechnet, auf ganze Zahl
 * gerundet, und zurück in Zieleinheit umgerechnet.
 *
 * @param value        - Wert in Zieleinheit
 * @param targetToBase - toBase-Faktor der Zieleinheit
 * @param atomicToBase - toBase-Faktor der atomaren Einheit
 *
 * Beispiele:
 *   roundAtomic(125.55, 10, 1)      → 125.6
 *     (125.55 cm × 10 = 1255.5 mm → 1256 mm → 1256/10 = 125.6 cm)
 *   roundAtomic(1.2555, 1000, 1)    → 1.256
 *     (1.2555 m × 1000 = 1255.5 mm → 1256 mm → 1256/1000 = 1.256 m)
 *   roundAtomic(0.1019, 1000, 1)    → 0.102
 *     (0.1019 kg × 1000 = 101.9 g → 102 g → 102/1000 = 0.102 kg)
 *
 * Implementierung:
 *   1. isUnroundable(value) → return value
 *   2. !isValidFactor(target) || !isValidFactor(atomic) → return value
 *   3. atomicValue = value × targetToBase ÷ atomicToBase
 *   4. roundedAtomic = Math.round(atomicValue)
 *   5. result = roundedAtomic × atomicToBase ÷ targetToBase
 *   6. return parseFloat(result.toPrecision(12))
 */
export function roundAtomic(
  value: number,
  targetToBase: number,
  atomicToBase: number,
): number {
  if (isUnroundable(value)) {
    return value;
  }

  if (!isValidFactor(targetToBase) || !isValidFactor(atomicToBase)) {
    return value;
  }

  const atomicValue = (value * targetToBase) / atomicToBase;
  const roundedAtomic =
    atomicValue >= 0 ? Math.round(atomicValue) : -Math.round(-atomicValue);
  const result = (roundedAtomic * atomicToBase) / targetToBase;
  // Use toPrecision to handle floating point issues and parseFloat to get back a number
  return Number.parseFloat(result.toPrecision(12));
}
