import {
  DEFAULT_LOAD_VALIDATION_POLICY,
  InvalidLoadValidationPolicyError,
} from '@baustatik/fem-loads';
import { describe, expect, it } from 'vitest';
import {
  InvalidAnalysisPolicyError,
  UnsupportedAnalysisPolicySchemaVersionError,
} from '../src/errors';
import {
  ANALYSIS_POLICY_SCHEMA_VERSION,
  createAnalysisPolicy,
  DEFAULT_ANALYSIS_POLICY,
  parseAnalysisPolicy,
} from '../src/policy';

describe('DEFAULT_ANALYSIS_POLICY', () => {
  it('traegt die vollstaendige Form mit Version', () => {
    expect(DEFAULT_ANALYSIS_POLICY).toEqual({
      schemaVersion: ANALYSIS_POLICY_SCHEMA_VERSION,
      loads: DEFAULT_LOAD_VALIDATION_POLICY,
      shearDeformation: true,
    });
    expect(ANALYSIS_POLICY_SCHEMA_VERSION).toBe(1);
  });

  it('teilt das Lastblatt mit seinem Eigentuemer — Objektidentitaet', () => {
    // Kein Nachbau: die Scheibe gehoert `@baustatik/fem-loads`, dieses Package
    // setzt sie nur zusammen.
    expect(DEFAULT_ANALYSIS_POLICY.loads).toBe(DEFAULT_LOAD_VALIDATION_POLICY);
  });

  it('ist tief eingefroren', () => {
    expect(Object.isFrozen(DEFAULT_ANALYSIS_POLICY)).toBe(true);
    expect(Object.isFrozen(DEFAULT_ANALYSIS_POLICY.loads)).toBe(true);
  });
});

describe('createAnalysisPolicy', () => {
  it('liefert ohne Argument den Default SELBST', () => {
    expect(createAnalysisPolicy()).toBe(DEFAULT_ANALYSIS_POLICY);
    expect(createAnalysisPolicy({})).toBe(DEFAULT_ANALYSIS_POLICY);
  });

  it('haelt das Default-Blatt fest, solange niemand daran dreht', () => {
    const policy = createAnalysisPolicy({ shearDeformation: false });

    expect(policy).not.toBe(DEFAULT_ANALYSIS_POLICY);
    expect(policy.shearDeformation).toBe(false);
    expect(policy.loads).toBe(DEFAULT_LOAD_VALIDATION_POLICY);
    expect(Object.isFrozen(policy)).toBe(true);
  });

  it('delegiert die fremde Scheibe an die Factory ihres Eigentuemers', () => {
    const policy = createAnalysisPolicy({
      loads: { suspiciousReferenceFactor: 0.1 },
    });

    expect(policy.loads).toEqual({
      stationRelativeTolerance: 1e-9,
      minimumReferenceFactor: 1e-9,
      suspiciousReferenceFactor: 0.1,
    });
    expect(Object.isFrozen(policy.loads)).toBe(true);
    // Die Version bleibt die aktuelle, auch bei Overrides.
    expect(policy.schemaVersion).toBe(ANALYSIS_POLICY_SCHEMA_VERSION);
  });

  it('reicht den Fehler des Eigentuemers unveraendert durch', () => {
    // Kein eigener Fehlertyp fuer eine fremde Regel: sonst gaebe es zwei Namen
    // fuer denselben Befund.
    expect(() =>
      createAnalysisPolicy({ loads: { minimumReferenceFactor: 2 } }),
    ).toThrow(InvalidLoadValidationPolicyError);
  });

  it('laesst den Default unberuehrt', () => {
    createAnalysisPolicy({
      shearDeformation: false,
      loads: { stationRelativeTolerance: 1 },
    });

    expect(DEFAULT_ANALYSIS_POLICY.shearDeformation).toBe(true);
    expect(DEFAULT_ANALYSIS_POLICY.loads).toBe(DEFAULT_LOAD_VALIDATION_POLICY);
  });
});

describe('parseAnalysisPolicy', () => {
  it('liest die vollstaendige JSON-Form zurueck, inklusive shearDeformation', () => {
    const policy = createAnalysisPolicy({
      shearDeformation: false,
      loads: { suspiciousReferenceFactor: 0.08 },
    });

    const json = JSON.parse(JSON.stringify(policy));

    // Die persistierte Form ist die VOLLSTAENDIGE effektive Policy, nicht nur
    // die Overrides — sonst waeren Projekte nicht mehr reproduzierbar, sobald
    // die Software-Defaults sich aendern.
    expect(json).toEqual({
      schemaVersion: 1,
      loads: {
        stationRelativeTolerance: 1e-9,
        minimumReferenceFactor: 1e-9,
        suspiciousReferenceFactor: 0.08,
      },
      shearDeformation: false,
    });
    expect(parseAnalysisPolicy(json)).toEqual(policy);
  });

  it('baut immer ein neues Objekt und friert es tief ein', () => {
    const parsed = parseAnalysisPolicy(
      JSON.parse(JSON.stringify(DEFAULT_ANALYSIS_POLICY)),
    );

    expect(parsed).toEqual(DEFAULT_ANALYSIS_POLICY);
    expect(parsed).not.toBe(DEFAULT_ANALYSIS_POLICY);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.loads)).toBe(true);
  });

  it('unterscheidet die nicht unterstuetzte Version von der ungueltigen Form', () => {
    const future = {
      schemaVersion: 2,
      loads: DEFAULT_LOAD_VALIDATION_POLICY,
      shearDeformation: true,
      spannungstheorie: 'II',
    };

    // Die Version wird ZUERST geprueft: ein Dokument aus einer neueren Fassung
    // hat legitim Felder, die diese Fassung nicht kennt. „Unbekanntes Feld"
    // waere hier die falsche Auskunft.
    expect(() => parseAnalysisPolicy(future)).toThrow(
      UnsupportedAnalysisPolicySchemaVersionError,
    );
    expect(() => parseAnalysisPolicy(future)).toThrow(/2/);

    expect(() =>
      parseAnalysisPolicy({ ...DEFAULT_ANALYSIS_POLICY, schemaVersion: '1' }),
    ).toThrow(InvalidAnalysisPolicyError);
  });

  it('verlangt die vollstaendigen Top-Level-Felder und lehnt unbekannte ab', () => {
    expect(() =>
      parseAnalysisPolicy({ schemaVersion: 1, shearDeformation: true }),
    ).toThrow(InvalidAnalysisPolicyError);

    expect(() =>
      parseAnalysisPolicy({
        ...JSON.parse(JSON.stringify(DEFAULT_ANALYSIS_POLICY)),
        formulation: 'timoshenko-2d',
      }),
    ).toThrow(InvalidAnalysisPolicyError);
  });

  it('lehnt Nicht-Objekte und falsche Feldtypen ab', () => {
    for (const input of [null, undefined, 1, 'policy', []]) {
      expect(() => parseAnalysisPolicy(input)).toThrow(
        InvalidAnalysisPolicyError,
      );
    }
    expect(() =>
      parseAnalysisPolicy({
        ...JSON.parse(JSON.stringify(DEFAULT_ANALYSIS_POLICY)),
        shearDeformation: 'true',
      }),
    ).toThrow(InvalidAnalysisPolicyError);
  });

  it('delegiert das Blatt an den Parser seines Eigentuemers', () => {
    expect(() =>
      parseAnalysisPolicy({
        schemaVersion: 1,
        loads: { stationRelativeTolerance: 1e-9 },
        shearDeformation: true,
      }),
    ).toThrow(InvalidLoadValidationPolicyError);
  });
});
