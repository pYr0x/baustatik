import { BaustatikError } from '@baustatik/errors';

export class InvalidGridSpacingError extends BaustatikError {
  constructor(reason: string) {
    super(`Grid-Spacing ungueltig: ${reason}`);
  }
}

export class InvalidGridOptionsError extends BaustatikError {
  constructor(reason: string) {
    super(`GridOptions ungueltig: ${reason}`);
  }
}
