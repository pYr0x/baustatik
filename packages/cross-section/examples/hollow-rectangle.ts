import type { CrossSection } from '@baustatik/cross-section';
import { report } from './report.ts';

/**
 * Geschlossener Kasten mit umlaufend gleicher Wandstaerke.
 *
 * Die einzige Form, fuer die `stressPoints` heute `undefined` liefert: ihr
 * fehlen die REFERENZDATEN, nicht die Theorie. Den umlaufenden Weg hat
 * `closedBoxPath` bereits, und kappa faellt daraus — die Querschnittswerte
 * stehen also vollstaendig da, nur die Vorlage der Spannungspunkte fehlt, bis
 * es QRO-Daten gibt, gegen die sie zu pruefen waere.
 */
export function hollowRectangleExample(): void {
  const cs: CrossSection = {
    kind: 'shape',
    id: 'kasten-200x400x10',
    shape: {
      kind: 'hollow-rectangle',
      b: 200, // Aussenbreite [mm]
      h: 400, // Aussenhoehe [mm]
      t: 10, // umlaufende Wandstaerke [mm]
      idealisation: 'thin-walled',
    },
  };

  report('Kasten 200 x 400 x 10 — thin-walled', cs);
}
