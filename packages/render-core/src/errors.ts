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

// Verletzung des Driver-Vertrags: sobald ein Adapter Baender kennt, muss JEDES
// Spec ein deklariertes Band tragen. Lieber laut im ersten Frame abbrechen als
// still in ein Default-Band rutschen und eine falsche z-Order erzeugen.
export class UnknownLayerError extends BaustatikError {
  constructor(
    specId: string,
    layer: string | undefined,
    declared: readonly string[],
  ) {
    super(
      `Spec[id="${specId}"] verweist auf Band ${
        layer === undefined ? '(keines gesetzt)' : `"${layer}"`
      }. Deklarierte Baender: ${
        declared.length === 0
          ? '(keine)'
          : declared.map((l) => `"${l}"`).join(', ')
      }`,
    );
  }
}

export class UnreachableCaseError extends BaustatikError {
  constructor(value: never) {
    super(`Unerwarteter Wert erreicht: ${JSON.stringify(value)}`);
  }
}
