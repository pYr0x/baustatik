import type { CrossSection, Idealisation } from '@baustatik/cross-section';
import { report } from './report.ts';

/**
 * Geschweisstes, doppeltsymmetrisches I — OHNE Ausrundung.
 *
 * Dieselben vier Zahlen, zwei Idealisierungen, zwei Antworten — und die eine
 * davon ist seit ADR 0057 „gar keine": `solid` liefert kappa aus Grashof, aber
 * KEINE Spannungspunkte, weil ein Vollquerschnitt kein Schnittmodell ist.
 * `thin-walled` rechnet im Wandmodell und liefert beides.
 *
 * 15 Punkte auf fuenf Wandelementen, Stelle fuer Stelle wie beim GEWALZTEN
 * Profil: 1-6 oberer Gurt von links, 7-12 unterer, 13/14 Steg unter den
 * Gurten, 15 Schwerpunkt. Die Gurtmitte steht ZWEIMAL — dort treffen sich das
 * linke und das rechte Gurtelement, und jedes traegt seinen eigenen Punkt
 * (ADR 0059). Alle zwoelf Gurtpunkte liegen auf der AUSSENfaser — `S` und `t`
 * gehoeren zum Schnitt, die Koordinate gehoert zu sigma, und sigma ist aussen
 * groesser (ADR 0052).
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
