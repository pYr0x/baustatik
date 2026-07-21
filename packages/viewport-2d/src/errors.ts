import { BaustatikError } from '@baustatik/errors';

export class InvalidWorldPointError extends BaustatikError {
  constructor(reason: string) {
    super(`WorldPoint ungueltig: ${reason}`);
  }
}

export class InvalidScreenPointError extends BaustatikError {
  constructor(reason: string) {
    super(`ScreenPoint ungueltig: ${reason}`);
  }
}

export class InvalidViewportError extends BaustatikError {
  constructor(reason: string) {
    super(`Viewport ungueltig: ${reason}`);
  }
}

export class InvalidSizeError extends BaustatikError {
  constructor(reason: string) {
    super(`Size ungueltig: ${reason}`);
  }
}
