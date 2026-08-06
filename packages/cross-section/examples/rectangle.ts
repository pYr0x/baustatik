import type { CrossSection } from '@baustatik/cross-section';
import { report } from './report.ts';

/**
 * Vollrechteck 200 x 500 mm.
 *
 * Die einzige Form OHNE `idealisation`: ein duennwandiges Vollrechteck gibt es
 * nicht. kappa faellt hier als exakt 5/6 heraus — der Wert steht nirgends im
 * Code, er kommt aus `A_s = I^2 / integral (S/t)^2 dA`.
 *
 * Die vier Ecken tragen alle `S = 0`; das Maximum `b*h^2/8` sitzt im
 * Schwerpunkt, und genau deshalb gehoert er zu den Spannungspunkten.
 */
export function rectangleExample(): void {
  const cs: CrossSection = {
    kind: 'shape',
    id: 'rechteck-200x500',
    shape: { kind: 'rectangle', b: 200, h: 500 }, // ABMESSUNGEN IN MILLIMETERN
  };

  report('Rechteck b = 200 mm, h = 500 mm', cs);
}
