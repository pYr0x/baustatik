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

export class InvalidArcSamplingOptionsError extends BaustatikError {
  constructor(reason: string) {
    super(`Arc-Sampling Optionen ungueltig: ${reason}`);
  }
}

export class InvalidGridSpacingError extends BaustatikError {
  constructor(reason: string) {
    super(`Grid-Spacing ungueltig: ${reason}`);
  }
}

export class InvalidZoomFactorError extends BaustatikError {
  constructor(reason: string) {
    super(`Zoom-Faktor ungueltig: ${reason}`);
  }
}
