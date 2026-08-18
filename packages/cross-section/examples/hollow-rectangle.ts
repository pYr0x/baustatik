import type { CrossSection } from '@baustatik/cross-section';
import { report } from './report.ts';

/**
 * Geschlossener Kasten mit umlaufend gleicher Wandstaerke.
 *
 * Die einzige parametrische Form, deren Spannungspunkte NICHT auf ihrem
 * Schwerpunkt liegen koennen — der liegt im Loch. An seine Stelle treten die
 * vier Wandmitten, und der Umlauf traegt 16 Punkte.
 *
 * `S` ist an den zwoelf Wandpunkten EXAKT: die Waende parkettieren die
 * Umrissfigur, statt auf der Mittellinie zu liegen (ADR 0051). Die vier
 * Aussenecken tragen den Gehrungswert.
 *
 * Was der Ausdruck NICHT zeigt: die Kernflaeche `A*` = `(b-t)(h-t)`, den
 * Nenner der Torsionsschubspannung nach Bredt. Sie steckt heute nur im
 * `It`-Ausdruck von `hollowRectangle` und ist keine Groesse des
 * `StressPoint`.
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
