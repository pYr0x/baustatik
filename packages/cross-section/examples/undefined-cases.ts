import type { CrossSection } from '@baustatik/cross-section';
import { report } from './report.ts';

/**
 * Was `undefined` heisst — die dritte Antwort neben „Zahl" und „Ausnahme".
 *
 * `sectionProperties` WIRFT NICHT. `undefined` heisst „kenne ich nicht", und
 * seit die Tabellenzeile im Modellsatz mitreist heisst es nur noch: unsinnige
 * Abmessungen — nicht-positive Masse, Wandstaerke groesser als die halbe Hoehe,
 * Steg breiter als der Gurt. Der Wert laeuft im FEM-Strang durch den Port
 * `getSectionStiffness`, und dort ist `undefined` bereits der Vertrag; daraus
 * wird ein Modellfehler IM BERICHT statt einer Ausnahme mitten in `solve()`.
 */
export function undefinedCasesExample(): void {
  // Wandstaerke groesser als die halbe Hoehe: der Kasten hat kein Inneres.
  const zuDick: CrossSection = {
    kind: 'shape',
    id: 'kasten-unsinnig',
    shape: {
      kind: 'hollow-rectangle',
      b: 100,
      h: 100,
      t: 60,
      idealisation: 'thin-walled',
    },
  };

  // Steg breiter als der Gurt: kein T mehr.
  const stegZuBreit: CrossSection = {
    kind: 'shape',
    id: 't-unsinnig',
    shape: {
      kind: 't-section',
      bf: 100,
      hf: 20,
      bw: 150,
      h: 300,
      idealisation: 'solid',
    },
  };

  report('Kasten 100 x 100 x 60 — Wand dicker als h/2', zuDick);
  report('T 100/20/150/300 — Steg breiter als der Gurt', stegZuBreit);
}
