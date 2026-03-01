import { BaustatikError } from '@baustatik/errors';

export class AssertionError extends BaustatikError {
  constructor(reason: string) {
    super(`Assertion failed: ${reason}`);
  }
}
