import { resolveUnit } from './parse'
import { smartRound, atomicRound } from './round'
import { UNITS, GRAVITY, ATOMIC_UNITS } from './units'
import { InvalidValueError, IncompatibleUnitsError } from './errors'
import type { UnitCategory, ConvertChain, FromChain } from './types'

function isCompatible(
    sourceCat: UnitCategory,
    targetCat: UnitCategory
): boolean {
    if (sourceCat === targetCat) return true
    if (
        (sourceCat === 'mass' && targetCat === 'force') ||
        (sourceCat === 'force' && targetCat === 'mass')
    ) return true
    return false
}

function roundResult(
    result: number,
    targetKey: string,
    category: UnitCategory
): number {
    // 1. Hat die Kategorie eine atomare Einheit?
    const atomicKey = ATOMIC_UNITS[category]

    // 2. Ja → atomicRound
    if (atomicKey) {
        const targetDef = UNITS[targetKey]
        const atomicDef = UNITS[atomicKey]
        return atomicRound(result, targetDef.toBase, atomicDef.toBase)
    }

    // 3. Nein → smartRound
    return smartRound(result)
}

export function convert(value: unknown): ConvertChain {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new InvalidValueError(value)
    }

    return {
        from(source: string): FromChain {
            const sourceKey = resolveUnit(source)
            const sourceDef = UNITS[sourceKey]

            return {
                to(target: string): number {
                    const targetKey = resolveUnit(target)
                    const targetDef = UNITS[targetKey]

                    // Kompatibilitäts-Check
                    if (!isCompatible(sourceDef.category, targetDef.category)) {
                        throw new IncompatibleUnitsError(
                            sourceKey, targetKey,
                            sourceDef.category, targetDef.category
                        )
                    }

                    // Masse → Kraft: smartRound (× 9.81 ist sauber)
                    if (sourceDef.category === 'mass' && targetDef.category === 'force') {
                        const grams = value * sourceDef.toBase
                        const newtons = grams * GRAVITY / 1000
                        const result = newtons / targetDef.toBase
                        return smartRound(result)
                    }

                    // Kraft → Masse: auf ganze Gramm runden (÷ 9.81 ist irrational)
                    if (sourceDef.category === 'force' && targetDef.category === 'mass') {
                        const newtons = value * sourceDef.toBase
                        const grams = newtons * 1000 / GRAVITY
                        const roundedGrams = Math.round(grams)
                        const result = roundedGrams / targetDef.toBase
                        return parseFloat(result.toPrecision(12))
                    }

                    // Standard-Umrechnung
                    const baseValue = value * sourceDef.toBase
                    const result = baseValue / targetDef.toBase
                    return roundResult(result, targetKey, targetDef.category)
                }
            }
        }
    }
}
