import { HEA } from './data/hea';
import { IPE } from './data/ipe';
import type { ProfileSeries, SteelProfile, SteelProfileData } from './types';

const TABLES = { IPE, HEA } as const satisfies Record<
  ProfileSeries,
  Record<string, SteelProfileData>
>;

/**
 * Die kanonische Bezeichnung, so wie sie gedruckt wird: `'IPE 200'`.
 *
 * Ein String-Literal-Union ueber die tatsaechlichen Tabellenschluessel, damit
 * ein Aufrufer, der die Bezeichnung im Code hinschreibt, sie beim Typecheck
 * pruefen lassen KANN.
 *
 * `lookupProfile` nimmt bewusst trotzdem `string`: die Bezeichnung kommt in
 * der Regel aus einem Eingabefeld, einem CSV-Import oder einem fremden Modell,
 * und dort gibt es keinen Typecheck mehr — nur noch `undefined`.
 */
export type ProfileId = keyof typeof IPE | keyof typeof HEA;

/** Fuer den Vergleich: Grossschreibung und ohne Leerzeichen. */
function fold(id: string): string {
  return id.replace(/\s+/g, '').toUpperCase();
}

const BY_FOLDED_ID: ReadonlyMap<string, SteelProfile> = new Map(
  (Object.keys(TABLES) as ProfileSeries[]).flatMap((series) =>
    Object.entries(TABLES[series]).map(
      ([id, data]) =>
        [fold(id), { ...(data as SteelProfileData), id, series }] as const,
    ),
  ),
);

/**
 * Schlaegt ein Profil nach.
 *
 * WIRFT NICHT. `undefined` heisst „steht nicht im Katalog" und wandert im
 * FEM-Strang bis in den Bericht (`UnknownSectionStiffnessError`) — dieses
 * Package braucht deshalb `@baustatik/errors` gar nicht und bleibt ein Blatt
 * ohne jede Abhaengigkeit.
 *
 * TOLERANT gegen Schreibweise: `'IPE 200'`, `'IPE200'` und `'ipe  200'` finden
 * dieselbe Zeile. Die Bezeichnung reist durch Eingabefelder, CSV-Importe und
 * fremde Modelle; genau dort entsteht der fehlende oder doppelte Zwischenraum.
 * Was NICHT toleriert wird, ist eine andere Zahl: `'IPE 201'` gibt es nicht.
 */
export function lookupProfile(id: string): SteelProfile | undefined {
  return BY_FOLDED_ID.get(fold(id));
}

/** Die gefuehrten Reihen. */
export function profileSeries(): readonly ProfileSeries[] {
  return Object.keys(TABLES) as ProfileSeries[];
}

/**
 * Alle Profile einer Reihe, in Tabellenreihenfolge (aufsteigende Hoehe).
 *
 * Da fuer den Katalog selbst: die Querprobe „gerechnet gegen tabelliert" ist
 * nur dann ein Beleg, wenn sie ueber die GANZE Reihe laeuft und nicht ueber ein
 * ausgesuchtes Profil.
 */
export function profilesIn(series: ProfileSeries): readonly SteelProfile[] {
  return Object.keys(TABLES[series]).map(
    (id) => BY_FOLDED_ID.get(fold(id)) as SteelProfile,
  );
}
