import type { CrossSection, Idealisation } from '@baustatik/cross-section';
import { report } from './report.ts';

/**
 * Geschweisstes, doppeltsymmetrisches I — OHNE Ausrundung.
 *
 * Dieselben vier Zahlen, zwei Idealisierungen, zwei Antworten: `solid` rechnet
 * im Umrissmodell (Grashof, waagerechte Schnitte durch die volle Umrissfigur),
 * `thin-walled` im Wandmodell. Betroffen sind kappa UND die Spannungspunkte — die Koordinaten
 * und die Nummern bleiben dabei Ziffer fuer Ziffer dieselben, es wechseln nur
 * `t` und `S`. Am Gurt heisst das `t = tf` statt `t = b`.
 *
 * 13 Punkte, Stelle fuer Stelle wie beim GEWALZTEN Profil: 1-5 oberer Gurt
 * von links, 6-10 unterer, 11/12 Steg unter den Gurten, 13 Schwerpunkt. Alle
 * zehn Gurtpunkte liegen auf der AUSSENfaser — `S` und `t` gehoeren zum
 * Schnitt, die Koordinate gehoert zu sigma, und sigma ist aussen groesser
 * (ADR 0052).
 */
function iSymmetric(idealisation: Idealisation): CrossSection {
  return {
    kind: 'shape',
    id: `i-200-${idealisation}`,
    shape: {
      kind: 'i-symmetric',
      h: 200, // Gesamthoehe [mm]
      b: 100, // Gurtbreite [mm]
      tw: 5.6, // Stegdicke [mm]
      tf: 8.5, // Gurtdicke [mm]
      idealisation, // PFLICHTFELD OHNE DEFAULT
    },
  };
}

export function iSymmetricExample(): void {
  report('I geschweisst 200 x 100 x 5,6 x 8,5 — solid', iSymmetric('solid'));
  report(
    'I geschweisst 200 x 100 x 5,6 x 8,5 — thin-walled',
    iSymmetric('thin-walled'),
  );
}
