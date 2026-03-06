import { BaustatikError } from '@baustatik/errors';

export class InvalidSectionPointError extends BaustatikError {
  constructor(reason: string) {
    super(`SectionPoint ungueltig: ${reason}`);
  }
}

export class InvalidSectionShapeError extends BaustatikError {
  constructor(reason: string) {
    super(`Section shape ungueltig: ${reason}`);
  }
}
