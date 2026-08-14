import type { mm } from '@baustatik/units';
import type { Idealisation } from './idealisation';

/**
 * Eine parametrische Form. Abmessungen in Millimetern.
 *
 * Die Form liefert Werte, keine Geometrie. Reine Daten, JSON-serialisierbar.
 */
export type ShapeSpec =
  /** Vollrechteck. Immer kompakt, deshalb ohne `idealisation`. */
  | { kind: 'rectangle'; b: mm; h: mm }
  /** Geschlossener Kasten mit umlaufend gleicher Wandstärke. */
  | {
      kind: 'hollow-rectangle';
      b: mm;
      h: mm;
      t: mm;
      idealisation: Idealisation;
    }
  /** Doppeltsymmetrisches I, geschweißt und ohne Ausrundung. */
  | {
      kind: 'i-symmetric';
      h: mm;
      b: mm;
      tw: mm;
      tf: mm;
      idealisation: Idealisation;
    }
  /** T-Querschnitt: Gurt oben, Steg darunter, `h` ist die Gesamthöhe. */
  | {
      kind: 't-section';
      bf: mm;
      hf: mm;
      bw: mm;
      h: mm;
      idealisation: Idealisation;
    };
