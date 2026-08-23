import type { CrossSection } from '@baustatik/cross-section';
import { lookupProfile } from '@baustatik/steel-profiles';

/**
 * Die Querschnitte, an denen dieses Package geprüft wird — an einer Stelle,
 * weil mehrere Tests DENSELBEN Querschnitt brauchen. Der Vorzeichentest tut das
 * sogar zwingend: `My` und `Vz` müssen am selben Querschnitt geprüft werden,
 * sonst kann das Paar konsistent falsch sein (ADR 0058).
 */

/** Das geschweisste, dünnwandige I — die Vorlage mit fünfzehn Punkten. */
export function iSection(
  h = 300,
  b = 150,
  tw = 7.1,
  tf = 10.7,
): CrossSection {
  return {
    kind: 'shape',
    id: 'I',
    shape: { kind: 'i-symmetric', h, b, tw, tf, idealisation: 'thin-walled' },
  };
}

/** Der geschlossene Kasten — sechzehn Punkte auf einem Umlauf. */
export function box(b = 200, h = 300, t = 10): CrossSection {
  return {
    kind: 'shape',
    id: 'Kasten',
    shape: { kind: 'hollow-rectangle', b, h, t, idealisation: 'thin-walled' },
  };
}

/** Eine Katalogzeile — der an 546 Referenzwerten geprüfte Zweig. */
export function rolled(id: string): CrossSection {
  const data = lookupProfile(id);
  if (data === undefined) throw new Error(`Profil ${id} steht nicht im Katalog`);

  return { kind: 'profile', id, profile: id, data };
}

/** Die Zeile eines Punktes, gesucht über seine Nummer. */
export function byNr<T extends { readonly nr: number }>(
  rows: readonly T[],
  nr: number,
): T {
  const row = rows.find((r) => r.nr === nr);
  if (row === undefined) throw new Error(`Punkt ${nr} fehlt`);

  return row;
}
