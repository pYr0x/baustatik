export class InvalidValueError extends Error {
    constructor(value: unknown) {
        super(
            `Invalid input value: expected a finite number, got ${typeof value} (${value})`
        )
        this.name = 'InvalidValueError'
    }
}

export class UnknownUnitError extends Error {
    constructor(unit: unknown) {
        super(`Unknown or unsupported unit: "${unit}"`)
        this.name = 'UnknownUnitError'
    }
}

export class IncompatibleUnitsError extends Error {
    constructor(from: string, to: string, fromCat: string, toCat: string) {
        super(
            `Cannot convert ${from} (${fromCat}) to ${to} (${toCat}): incompatible unit types`
        )
        this.name = 'IncompatibleUnitsError'
    }
}
