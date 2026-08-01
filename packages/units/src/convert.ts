import { roundAtomic, roundSmart } from '@baustatik/round';
import { IncompatibleUnitsError, InvalidValueError } from './errors';
import { resolveUnit } from './parse';
import type { ConvertChain, FromChain, UnitCategory } from './types';
import { ATOMIC_UNITS, GRAVITY, UNITS } from './units';

function isCompatible(
  sourceCat: UnitCategory,
  targetCat: UnitCategory,
): boolean {
  if (sourceCat === targetCat) return true;
  if (
    (sourceCat === 'mass' && targetCat === 'force') ||
    (sourceCat === 'force' && targetCat === 'mass')
  )
    return true;
  return false;
}

function roundResult(
  result: number,
  targetKey: string,
  category: UnitCategory,
): number {
  // 1. Hat die Kategorie eine atomare Einheit?
  const atomicKey = ATOMIC_UNITS[category];

  // 2. Ja → atomicRound
  if (atomicKey) {
    const targetDef = UNITS[targetKey];
    const atomicDef = UNITS[atomicKey];
    return roundAtomic(result, targetDef.toBase, atomicDef.toBase);
  }

  // 3. Nein → smartRound
  return roundSmart(result);
}

/**
 * Der reine Zahlenwert, OHNE jede Rundung — der gemeinsame Kern von `to` und
 * `toExact`.
 *
 * Auch die beiden Masse↔Kraft-Zweige rechnen hier ungerundet: `to` legt
 * anschliessend `roundSmart` bzw. die Rundung auf ganze Gramm darüber, damit
 * es genau EINE Stelle gibt, an der die Physik steht, und genau eine, an der
 * gerundet wird.
 */
function rawConvert(
  value: number,
  sourceKey: string,
  targetKey: string,
): number {
  const sourceDef = UNITS[sourceKey];
  const targetDef = UNITS[targetKey];

  // Kompatibilitäts-Check
  if (!isCompatible(sourceDef.category, targetDef.category)) {
    throw new IncompatibleUnitsError(
      sourceKey,
      targetKey,
      sourceDef.category,
      targetDef.category,
    );
  }

  const baseValue = value * sourceDef.toBase;

  // Masse → Kraft: über g = 9.81, Basis g → N
  if (sourceDef.category === 'mass' && targetDef.category === 'force') {
    return (baseValue * GRAVITY) / 1000 / targetDef.toBase;
  }

  // Kraft → Masse: die Gegenrichtung, N → g
  if (sourceDef.category === 'force' && targetDef.category === 'mass') {
    return (baseValue * 1000) / GRAVITY / targetDef.toBase;
  }

  return baseValue / targetDef.toBase;
}

export function convert(value: unknown): ConvertChain {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InvalidValueError(value);
  }

  return {
    from(source: string): FromChain {
      const sourceKey = resolveUnit(source);
      const sourceDef = UNITS[sourceKey];

      return {
        to(target: string): number {
          const targetKey = resolveUnit(target);
          const targetDef = UNITS[targetKey];
          const result = rawConvert(value as number, sourceKey, targetKey);

          // Masse → Kraft: smartRound (× 9.81 ist sauber)
          if (sourceDef.category === 'mass' && targetDef.category === 'force') {
            return roundSmart(result);
          }

          // Kraft → Masse: auf ganze Gramm runden (÷ 9.81 ist irrational)
          if (sourceDef.category === 'force' && targetDef.category === 'mass') {
            const roundedGrams = Math.round(result * targetDef.toBase);
            return Number.parseFloat(
              (roundedGrams / targetDef.toBase).toPrecision(12),
            );
          }

          return roundResult(result, targetKey, targetDef.category);
        },

        toExact(target: string): number {
          return rawConvert(value as number, sourceKey, resolveUnit(target));
        },
      };
    },
  };
}
