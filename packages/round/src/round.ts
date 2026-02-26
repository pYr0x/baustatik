import { roundAtomic } from './atomic';
import { roundToDecimals } from './decimals';
import { roundToSignificant } from './significant';
import { roundSmart } from './smart';
import type { RoundChain, SmartOptions } from './types';
import { isUnroundable } from './utils/guards';

/**
 * Erstellt ein RoundChain-Objekt für den gegebenen Wert.
 *
 * Implementierung:
 *   1. Interne Sicherstellung, dass value eine Nummer ist
 *   2. Return Objekt mit 5 Methoden
 *   3. Jede Methode delegiert an die entsprechende Funktion
 */
export function round(value: number): RoundChain {
  // Falls die UI Schrott schickt, konvertieren wir es hier intern sicher
  const internalValue = typeof value !== 'number' ? Number.NaN : value;

  return {
    toDecimals(n: number): number {
      return roundToDecimals(internalValue, n);
    },
    toSignificant(n: number): number {
      return roundToSignificant(internalValue, n);
    },
    toInteger(): number {
      return isUnroundable(internalValue)
        ? internalValue
        : Math.round(internalValue);
    },
    smart(options?: SmartOptions): number {
      return roundSmart(internalValue, options);
    },
    atomic(targetToBase: number, atomicToBase: number): number {
      return roundAtomic(internalValue, targetToBase, atomicToBase);
    },
  };
}
