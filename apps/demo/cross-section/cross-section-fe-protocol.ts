import type { SectionGeometry, SectionPolicy } from '@baustatik/cross-section';
import type { FEComputation } from '@baustatik/cross-section-fe';

/**
 * Das Protokoll des FE-Ports.
 *
 * ES REIST DIE GEOMETRIE, KEINE ID. Die Tuer des Packages kennt keinen
 * Schluessel, und der Port erfindet auch keinen: `id` hier ist die Nummer der
 * ANFRAGE, nicht die des Querschnitts. Wer welchen Satz gefuellt bekommt,
 * entscheidet die Anwendung an der Stelle, an der sie `await` schreibt.
 */
export type CrossSectionFERequest = {
  readonly kind: 'compute';
  readonly id: number;
  readonly geometry: SectionGeometry;
  readonly policy: SectionPolicy;
};

export type CrossSectionFEResponse =
  | {
      readonly kind: 'computed';
      readonly id: number;
      readonly result: FEComputation;
    }
  | { readonly kind: 'failed'; readonly id: number; readonly message: string }
  | { readonly kind: 'fatal'; readonly id: number; readonly message: string };
