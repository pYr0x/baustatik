import { BaustatikError } from '@baustatik/errors';

export class InvalidSpecError extends BaustatikError {
  constructor(specId: string, reason: string) {
    super(`Spec[id="${specId}"] ist ungueltig: ${reason}`);
  }
}

export class DuplicateSpecIdError extends BaustatikError {
  constructor(id: string) {
    super(`Doppelte Spec ID gefunden: "${id}"`);
  }
}

export class UnreachableCaseError extends BaustatikError {
  constructor(value: never) {
    super(`Unerwarteter Wert erreicht: ${JSON.stringify(value)}`);
  }
}
