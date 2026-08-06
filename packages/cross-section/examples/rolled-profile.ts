import { type CrossSection, profileProperties } from '@baustatik/cross-section';
import { lookupProfile } from '@baustatik/steel-profiles';
import { report } from './report.ts';

/**
 * Walzprofil aus dem Katalog.
 *
 * NACHGESCHLAGEN WIRD BEIM ANLEGEN, nicht beim Rechnen: der Modellsatz traegt
 * die Tabellenzeile als KOPIE (`data`), `profile` ist nur noch die Herkunft.
 * Damit rechnet ein gespeichertes Modell nie gegen die Tabelle der gerade
 * laufenden Programmversion — und `sectionProperties` ist in diesem Zweig
 * total, es gibt kein „unbekanntes Profil" mehr.
 *
 * 13 Spannungspunkte in RSTABs gedruckter Nummerierung: 1–5 oberer Gurt von
 * links, 6–10 unterer, 11/12 Steganfang, 13 Schwerpunkt. Die Gurtunterseiten-
 * Ecken fehlen bewusst: bei homogenem Querschnitt koennen sie nie massgebend
 * werden. Ein geschweisstes I (15 Punkte) liest sich deshalb anders — es ist
 * eine andere Form.
 */
export function rolledProfileExample(): void {
  const profile = lookupProfile('IPE 300');
  if (profile === undefined) {
    // `lookupProfile` wirft nicht; `undefined` heisst „steht nicht im Katalog".
    console.log('IPE 300 steht nicht im Katalog');
    return;
  }

  const cs: CrossSection = {
    kind: 'profile',
    id: 'stuetze-1',
    profile: profile.id, // die HERKUNFT, z. B. 'IPE 300'
    data: profile, // die KOPIE der Tabellenzeile
  };

  report('Walzprofil IPE 300', cs);

  // Wer nur die Zahlen einer Tabellenzeile braucht und keinen Modellsatz hat,
  // ruft die zweite Tuer direkt auf — dasselbe Ergebnis, ohne `CrossSection`.
  console.log(
    '  profileProperties(profile) direkt:',
    profileProperties(profile),
  );
}
