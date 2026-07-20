import { BaustatikError } from '@baustatik/errors';

/** Thrown when a grade designation is not present in the vendored tables. */
export class UnknownGradeError extends BaustatikError {
  constructor(material: string, grade: string, known: readonly string[]) {
    super(
      `Unknown ${material} grade: "${grade}". Known grades: ${known.join(', ')}`,
    );
  }
}

/** Thrown when an unknown built-in National Annex id is requested. */
export class UnknownNationalAnnexError extends BaustatikError {
  constructor(na: string, known: readonly string[]) {
    super(`Unknown National Annex "${na}". Built-in: ${known.join(', ')}.`);
  }
}

/**
 * Thrown when a timber design value (fmd, ft0d, …) is read directly instead of
 * through `designValues({ loadDuration, serviceClass })`. Timber has no default
 * kmod, so there is no meaningful bare design value. This guards untyped JS
 * consumers; typed consumers get a compile error because the property is absent.
 */
export class DesignValueRequiresContextError extends BaustatikError {
  constructor(property: string) {
    super(
      `Timber design value "${property}" requires designValues({ loadDuration, serviceClass }); ` +
        'there is no default kmod for timber.',
    );
  }
}
