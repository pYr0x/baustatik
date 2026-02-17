import { UNITS } from './units'
import { UnknownUnitError } from './errors'

const UNICODE_MAP: Record<string, string> = {
    '²': '^2',
    '³': '^3',
    '⁴': '^4',
}

const VALID_UNIT_PATTERN = /^[a-zA-Z]+(\^[1-9][0-9]*)?(\/[a-zA-Z]+(\^[1-9][0-9]*)?)?$/

export function resolveUnit(input: unknown): string {
    // 1. Typ-Check
    if (typeof input !== 'string') {
        throw new UnknownUnitError(input)
    }

    // 2. Trimmen
    let result = input.trim()
    if (result.length === 0) {
        throw new UnknownUnitError(input)
    }

    // 3. Unicode normalisieren
    for (const [unicode, ascii] of Object.entries(UNICODE_MAP)) {
        result = result.replace(unicode, ascii)
    }

    // 4. Malformed-Check via Regex
    if (!VALID_UNIT_PATTERN.test(result)) {
        throw new UnknownUnitError(input)
    }

    // 5. Lookup in UNITS
    if (!(result in UNITS)) {
        throw new UnknownUnitError(input)
    }

    // 6. Return result
    return result
}
