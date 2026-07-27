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
  DEFAULT_DEFORMATION_LIMITS,
  parseAnalysisPolicy,
} from '../src/policy';

describe('DEFAULT_ANALYSIS_POLICY', () => {
  it('traegt die vollstaendige Form mit Version', () => {
    expect(DEFAULT_ANALYSIS_POLICY).toEqual({
      schemaVersion: ANALYSIS_POLICY_SCHEMA_VERSION,
      loads: DEFAULT_LOAD_VALIDATION_POLICY,
      shearDeformation: true,
      deformationLimits: DEFAULT_DEFORMATION_LIMITS,
    });
    expect(ANALYSIS_POLICY_SCHEMA_VERSION).toBe(2);
  });

  it('traegt die gemessenen Verformungsgrenzen', () => {
    // Die vier Zahlen und ihre Begruendung: docs/messungen/kinematik-abstand.md.
    // `warn` ist die Gueltigkeitsgrenze der Theorie I. Ordnung, `fail` liegt
    // ueber allem, was ein tragfaehiges System liefert, und weit unter jedem
    // gemessenen Mechanismus.
    expect(DEFAULT_DEFORMATION_LIMITS).toEqual({
      warn: { rotation: 0.1, relativeDisplacement: 0.1 },
      fail: { rotation: 1e3, relativeDisplacement: 1e4 },
    });
  });

  it('teilt das Lastblatt mit seinem Eigentuemer — Objektidentitaet', () => {
    // Kein Nachbau: die Scheibe gehoert `@baustatik/fem-loads`, dieses Package
    // setzt sie nur zusammen.
    expect(DEFAULT_ANALYSIS_POLICY.loads).toBe(DEFAULT_LOAD_VALIDATION_POLICY);
  });

  it('ist tief eingefroren', () => {
    expect(Object.isFrozen(DEFAULT_ANALYSIS_POLICY)).toBe(true);
    expect(Object.isFrozen(DEFAULT_ANALYSIS_POLICY.loads)).toBe(true);
    expect(Object.isFrozen(DEFAULT_ANALYSIS_POLICY.deformationLimits)).toBe(
      true,
    );
    expect(Object.isFrozen(DEFAULT_ANALYSIS_POLICY.deformationLimits.warn)).toBe(
      true,
    );
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
      deformationLimits: { warn: { rotation: 0.02 } },
    });

    expect(DEFAULT_ANALYSIS_POLICY.shearDeformation).toBe(true);
    expect(DEFAULT_ANALYSIS_POLICY.loads).toBe(DEFAULT_LOAD_VALIDATION_POLICY);
    expect(DEFAULT_ANALYSIS_POLICY.deformationLimits.warn.rotation).toBe(0.1);
  });

  it('mischt eine einzelne Verformungsgrenze in den Default', () => {
    const policy = createAnalysisPolicy({
      deformationLimits: { fail: { rotation: 5 } },
    });

    expect(policy.deformationLimits).toEqual({
      warn: { rotation: 0.1, relativeDisplacement: 0.1 },
      fail: { rotation: 5, relativeDisplacement: 1e4 },
    });
  });

  it('haelt das Verformungsblatt fest, solange niemand daran dreht', () => {
    // Dieselbe Identitaetsregel wie beim Lastblatt: ein unveraendertes Blatt
    // wird nicht kopiert.
    const policy = createAnalysisPolicy({ shearDeformation: false });

    expect(policy.deformationLimits).toBe(DEFAULT_DEFORMATION_LIMITS);
  });

  it('verlangt endliche, positive Grenzen mit warn < fail', () => {
    const cases: [string, Parameters<typeof createAnalysisPolicy>[0]][] = [
      // Eine Grenze <= 0 wuerde jedes Ergebnis beanstanden, auch das exakte 0.
      ['warn.rotation', { deformationLimits: { warn: { rotation: 0 } } }],
      [
        'warn.relativeDisplacement',
        { deformationLimits: { warn: { relativeDisplacement: -1 } } },
      ],
      [
        'fail.rotation',
        { deformationLimits: { fail: { rotation: Number.POSITIVE_INFINITY } } },
      ],
      [
        'fail.relativeDisplacement',
        { deformationLimits: { fail: { relativeDisplacement: Number.NaN } } },
      ],
      // Ohne Fenster zwischen den Stufen gaebe es die Warnung nicht mehr.
      ['fail.rotation', { deformationLimits: { fail: { rotation: 0.1 } } }],
    ];

    for (const [field, overrides] of cases) {
      const failure = (() => {
        try {
          createAnalysisPolicy(overrides);
          return undefined;
        } catch (error: unknown) {
          return error;
        }
      })();

      expect(failure, field).toBeInstanceOf(InvalidAnalysisPolicyError);
      expect((failure as InvalidAnalysisPolicyError).field).toBe(
        `deformationLimits.${field}`,
      );
    }
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
      schemaVersion: 2,
      loads: {
        stationRelativeTolerance: 1e-9,
        minimumReferenceFactor: 1e-9,
        suspiciousReferenceFactor: 0.08,
      },
      shearDeformation: false,
      deformationLimits: {
        warn: { rotation: 0.1, relativeDisplacement: 0.1 },
        fail: { rotation: 1e3, relativeDisplacement: 1e4 },
      },
    });
    expect(parseAnalysisPolicy(json)).toEqual(policy);
  });

  it('lehnt ein v1-Dokument ab, statt es stillschweigend zu ergaenzen', () => {
    // Kein Migrationspfad: `deformationLimits` fehlt in v1, und ein
    // stillschweigend ergaenzter Default waere eine Einstellung, die der
    // Anwender nie gewaehlt hat. Zum Zeitpunkt des Versionssprungs hatte
    // `parseAnalysisPolicy` keinen produktiven Aufrufer — es liegt nichts
    // Persistiertes herum, das migriert werden muesste.
    const v1 = {
      schemaVersion: 1,
      loads: DEFAULT_LOAD_VALIDATION_POLICY,
      shearDeformation: true,
    };

    expect(() => parseAnalysisPolicy(v1)).toThrow(
      UnsupportedAnalysisPolicySchemaVersionError,
    );
  });

  it('prueft die geschachtelte Form der Verformungsgrenzen', () => {
    const complete = JSON.parse(JSON.stringify(DEFAULT_ANALYSIS_POLICY));

    const broken: unknown[] = [
      // fehlt ganz
      { ...complete, deformationLimits: undefined },
      // keine Stufe
      { ...complete, deformationLimits: {} },
      // kein Objekt
      { ...complete, deformationLimits: 0.1 },
      // eine Stufe unvollstaendig
      {
        ...complete,
        deformationLimits: {
          warn: { rotation: 0.1 },
          fail: { rotation: 1e3, relativeDisplacement: 1e4 },
        },
      },
      // unbekanntes Feld in einer Stufe
      {
        ...complete,
        deformationLimits: {
          warn: { rotation: 0.1, relativeDisplacement: 0.1, drift: 1 },
          fail: { rotation: 1e3, relativeDisplacement: 1e4 },
        },
      },
      // unbekannte Stufe
      {
        ...complete,
        deformationLimits: { ...complete.deformationLimits, info: {} },
      },
      // falscher Typ
      {
        ...complete,
        deformationLimits: {
          warn: { rotation: '0.1', relativeDisplacement: 0.1 },
          fail: { rotation: 1e3, relativeDisplacement: 1e4 },
        },
      },
    ];

    for (const input of broken) {
      expect(() => parseAnalysisPolicy(input)).toThrow(
        InvalidAnalysisPolicyError,
      );
    }
  });

  it('prueft die Werte auch aus JSON, nicht nur aus der Factory', () => {
    // Sonst kaeme aus einer Datei durch, was die Factory ablehnt.
    expect(() =>
      parseAnalysisPolicy({
        ...JSON.parse(JSON.stringify(DEFAULT_ANALYSIS_POLICY)),
        deformationLimits: {
          warn: { rotation: 2000, relativeDisplacement: 0.1 },
          fail: { rotation: 1e3, relativeDisplacement: 1e4 },
        },
      }),
    ).toThrow(InvalidAnalysisPolicyError);
  });

  it('baut immer ein neues Objekt und friert es tief ein', () => {
    const parsed = parseAnalysisPolicy(
      JSON.parse(JSON.stringify(DEFAULT_ANALYSIS_POLICY)),
    );

    expect(parsed).toEqual(DEFAULT_ANALYSIS_POLICY);
    expect(parsed).not.toBe(DEFAULT_ANALYSIS_POLICY);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.loads)).toBe(true);
    expect(Object.isFrozen(parsed.deformationLimits)).toBe(true);
    expect(Object.isFrozen(parsed.deformationLimits.fail)).toBe(true);
  });

  it('unterscheidet die nicht unterstuetzte Version von der ungueltigen Form', () => {
    const future = {
      schemaVersion: ANALYSIS_POLICY_SCHEMA_VERSION + 1,
      loads: DEFAULT_LOAD_VALIDATION_POLICY,
      shearDeformation: true,
      deformationLimits: DEFAULT_DEFORMATION_LIMITS,
      spannungstheorie: 'II',
    };

    // Die Version wird ZUERST geprueft: ein Dokument aus einer neueren Fassung
    // hat legitim Felder, die diese Fassung nicht kennt. „Unbekanntes Feld"
    // waere hier die falsche Auskunft.
    expect(() => parseAnalysisPolicy(future)).toThrow(
      UnsupportedAnalysisPolicySchemaVersionError,
    );
    expect(() => parseAnalysisPolicy(future)).toThrow(
      new RegExp(String(ANALYSIS_POLICY_SCHEMA_VERSION + 1)),
    );

    expect(() =>
      parseAnalysisPolicy({ ...DEFAULT_ANALYSIS_POLICY, schemaVersion: '1' }),
    ).toThrow(InvalidAnalysisPolicyError);
  });

  it('verlangt die vollstaendigen Top-Level-Felder und lehnt unbekannte ab', () => {
    expect(() =>
      parseAnalysisPolicy({
        schemaVersion: ANALYSIS_POLICY_SCHEMA_VERSION,
        shearDeformation: true,
      }),
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
        schemaVersion: ANALYSIS_POLICY_SCHEMA_VERSION,
        loads: { stationRelativeTolerance: 1e-9 },
        shearDeformation: true,
        deformationLimits: DEFAULT_DEFORMATION_LIMITS,
      }),
    ).toThrow(InvalidLoadValidationPolicyError);
  });
});
