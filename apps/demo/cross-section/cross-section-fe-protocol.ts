import type {
  ReinforcementLayer,
  SectionGeometry,
  SectionPolicy,
} from '@baustatik/cross-section';
import type { FEComputation } from '@baustatik/cross-section-fe';

/**
 * Das Protokoll des FE-Ports.
 *
 * ES REIST DIE GEOMETRIE, KEINE ID. Die Tuer des Packages kennt keinen
 * Schluessel, und der Port erfindet auch keinen: `id` hier ist die Nummer der
 * ANFRAGE, nicht die des Querschnitts. Wer welchen Satz gefuellt bekommt,
 * entscheidet die Anwendung an der Stelle, an der sie `await` schreibt.
 *
 * DER ERGEBNISTYP WIRD DURCHGEREICHT UND NICHT NACHGEBAUT. `FEComputation` ist
 * seit ADR 0061 eine Union auf `kind`, und der `'solved'`-Arm traegt neben dem
 * Netz die geloesten FELDER — die Eingabe von `recoverStresses`. Beides ist
 * strukturiert klonbar (typisierte Felder, plain arrays, Zahlen), reist also
 * ohne Umformung durch `postMessage`; der Worker uebertraegt die grossen Puffer
 * statt sie zu kopieren.
 *
 * WAS DAMIT NICHT REIST: eine Spannung. Sie braucht eine Schnittgroesse und ein
 * ν, und beide stehen zum Zeitpunkt des FE-Laufs nicht fest. `recoverStresses`
 * laeuft deshalb im HAUPTFADEN, rein und synchron — ohne Worker, ohne WASM.
 */
export type CrossSectionFERequest = {
  readonly kind: 'compute';
  readonly id: number;
  readonly geometry: SectionGeometry;
  readonly policy: SectionPolicy;
  readonly reinforcement?: readonly ReinforcementLayer[];
};

export type CrossSectionFEResponse =
  | {
      readonly kind: 'computed';
      readonly id: number;
      readonly result: FEComputation;
    }
  | { readonly kind: 'failed'; readonly id: number; readonly message: string }
  | { readonly kind: 'fatal'; readonly id: number; readonly message: string };
