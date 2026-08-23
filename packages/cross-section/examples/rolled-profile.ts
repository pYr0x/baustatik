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
 * 15 Spannungspunkte auf fuenf Wandelementen: 1–6 oberer Gurt von links, 7–12
 * unterer, 13/14 Steganfang, 15 Schwerpunkt. Der gedruckte Ausdruck fuehrt
 * dreizehn — er zaehlt die Gurtmitte einmal, wo hier zwei Elemente
 * aufeinandertreffen (ADR 0059). Die Gurtunterseiten-Ecken fehlen bewusst: bei
 * homogenem Querschnitt koennen sie nie massgebend werden.
 *
 * DAS GESCHWEISSTE I LIEST SICH GENAUSO — dieselbe Elementliste, dieselben
 * Nummern, und bei `r = 0` an allen 15 Punkten dieselben Zahlen bis aufs letzte
 * Bit.
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
