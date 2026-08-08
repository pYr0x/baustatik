/**
 * Gemeinsame Test-Helfer (test-only, nicht aus dem Package-Index exportiert).
 *
 * Der Rumpf lag als wortgleiche Kopie in `cross-sections.test.ts`,
 * `materials.test.ts` und dreimal inline in `builder.test.ts`. Bei jedem
 * Schemabruch — und `@baustatik/script` hat inzwischen acht davon — musste
 * dieselbe Fixture an fünf Stellen nachgezogen werden; eine vergessene Stelle
 * fällt erst als Testfehler auf, der nach einem Fehler im Parser aussieht.
 *
 * Die Fixture nennt DEN VOLLSTÄNDIGEN Satz und nicht das Minimum: `overrides`
 * setzt genau das Feld, um das es im jeweiligen Test geht, und der Rest bleibt
 * sichtbar gültig.
 */

/** Die aktuelle Schemaversion des Snapshots. */
export const SCHEMA_VERSION = 9;

/**
 * Die `SectionPolicy` des Rumpfs — die EFFEKTIVEN Werte, wie sie seit ADR 0033
 * im Satz stehen (`arcTolerance` seit v7, `principalAxisTolerance` seit v8,
 * `miterLimit` seit v9).
 */
export const SNAPSHOT_SECTION_POLICY = {
  arcTolerance: 0.05,
  principalAxisTolerance: 1e-9,
  miterLimit: 2,
};

/** Ein vollständiger, gültiger Rumpf zum Überschreiben einzelner Felder. */
export function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    nodes: [],
    beams: [],
    crossSections: [],
    materials: [],
    sectionPolicy: { ...SNAPSHOT_SECTION_POLICY },
    supports: [],
    loadCases: [],
    ...overrides,
  };
}
