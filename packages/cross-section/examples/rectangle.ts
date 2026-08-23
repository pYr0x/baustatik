import type { CrossSection } from '@baustatik/cross-section';
import { report } from './report.ts';

/**
 * Vollrechteck 200 x 500 mm.
 *
 * Die einzige Form OHNE `idealisation`: ein duennwandiges Vollrechteck gibt es
 * nicht. kappa faellt hier als exakt 5/6 heraus — der Wert steht nirgends im
 * Code, er kommt aus `A_s = I^2 / integral (S/t)^2 dA`.
 *
 * SPANNUNGSPUNKTE GIBT ES HIER KEINE, und das ist die Aussage des Beispiels:
 * `t` und `S` sind der Nenner eines SCHNITTMODELLS, und ein Vollquerschnitt
 * hat keins. Er bekommt seine Spannungen aus der FE, sobald der Weg dorthin
 * steht; bis dahin ist `undefined` die ehrliche Antwort (ADR 0057).
 * `sectionProperties` liefert dagegen alles, kappa eingeschlossen.
 */
export function rectangleExample(): void {
  const cs: CrossSection = {
    kind: 'shape',
    id: 'rechteck-200x500',
    shape: { kind: 'rectangle', b: 200, h: 500 }, // ABMESSUNGEN IN MILLIMETERN
  };

  report('Rechteck b = 200 mm, h = 500 mm', cs);
}
