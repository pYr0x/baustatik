import { BaustatikError } from '@baustatik/errors';

export class InvalidValueError extends BaustatikError {
  constructor(value: unknown) {
    super(
      `Invalid input value: expected a finite number, got ${typeof value} (${value})`,
    );
  }
}

export class UnknownUnitError extends BaustatikError {
  constructor(unit: unknown) {
    super(`Unknown or unsupported unit: "${unit}"`);
  }
}

export class IncompatibleUnitsError extends BaustatikError {
  constructor(from: string, to: string, fromCat: string, toCat: string) {
    super(
      `Cannot convert ${from} (${fromCat}) to ${to} (${toCat}): incompatible unit types`,
    );
  }
}
