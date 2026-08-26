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
export const SCHEMA_VERSION = 14;

/**
 * Die `SectionPolicy` des Rumpfs — die EFFEKTIVEN Werte, wie sie seit ADR 0033
 * im Satz stehen (`discretisationTolerance` seit v7, `principalAxisTolerance` seit v8,
 * `miterLimit` seit v9, `thickWallRatio` und `shearCentreTolerance` seit v10,
 * `FEElements` seit v11).
 */
export const SNAPSHOT_SECTION_POLICY = {
  discretisationTolerance: 0.05,
  principalAxisTolerance: 1e-9,
  miterLimit: 2,
  thickWallRatio: 1 / 3,
  shearCentreTolerance: 1e-6,
  FEElements: 4000,
};

/**
 * Die `AnalysisPolicy` des Rumpfs — seit v13 Pflichtfeld und ebenfalls in den
 * EFFEKTIVEN Werten (ADR 0049).
 *
 * AUSGESCHRIEBEN statt `DEFAULT_ANALYSIS_POLICY` importiert, aus demselben
 * Grund wie oben bei der `SectionPolicy`: die Fixture soll den Satz ZEIGEN. Ein
 * importierter Default liesse einen Test gruen bleiben, der genau die Frage
 * stellt, ob das Feld ueberhaupt im Satz steht.
 */
export const SNAPSHOT_ANALYSIS_POLICY = {
  loads: {
    stationRelativeTolerance: 1e-9,
    minimumReferenceFactor: 1e-9,
    suspiciousReferenceFactor: 0.05,
  },
  shearDeformation: true,
  deformationLimits: {
    warn: { rotation: 0.1, relativeDisplacement: 0.1 },
    fail: { rotation: 1e3, relativeDisplacement: 1e4 },
  },
  linearSystem: 'sparse',
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
    analysisPolicy: structuredClone(SNAPSHOT_ANALYSIS_POLICY),
    supports: [],
    loadCases: [],
    ...overrides,
  };
}
