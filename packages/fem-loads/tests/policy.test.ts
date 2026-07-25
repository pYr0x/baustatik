import { describe, expect, it } from 'vitest';
import { InvalidLoadValidationPolicyError } from '../src/errors';
import {
  createLoadValidationPolicy,
  DEFAULT_LOAD_VALIDATION_POLICY,
  parseLoadValidationPolicy,
} from '../src/policy';

describe('DEFAULT_LOAD_VALIDATION_POLICY', () => {
  it('traegt die drei Werte, die frueher privat in validate.ts standen', () => {
    expect(DEFAULT_LOAD_VALIDATION_POLICY).toEqual({
      stationRelativeTolerance: 1e-9,
      minimumReferenceFactor: 1e-9,
      suspiciousReferenceFactor: 0.05,
    });
  });

  it('ist eingefroren', () => {
    expect(Object.isFrozen(DEFAULT_LOAD_VALIDATION_POLICY)).toBe(true);
  });
});

describe('createLoadValidationPolicy', () => {
  it('liefert ohne Argument den Default SELBST, nicht eine Kopie', () => {
    // Objektidentitaet, damit die Aggregat-Policy im Solver ihr Blatt
    // vergleichen kann: eingefroren und readonly kauft Kopieren nichts.
    expect(createLoadValidationPolicy()).toBe(DEFAULT_LOAD_VALIDATION_POLICY);
    expect(createLoadValidationPolicy({})).toBe(DEFAULT_LOAD_VALIDATION_POLICY);
  });

  it('fuellt bei einem Teil-Override den Rest aus dem Default', () => {
    const policy = createLoadValidationPolicy({ suspiciousReferenceFactor: 0.1 });

    expect(policy).toEqual({
      stationRelativeTolerance: 1e-9,
      minimumReferenceFactor: 1e-9,
      suspiciousReferenceFactor: 0.1,
    });
    expect(policy).not.toBe(DEFAULT_LOAD_VALIDATION_POLICY);
    expect(Object.isFrozen(policy)).toBe(true);
  });

  it('laesst den Default unberuehrt', () => {
    createLoadValidationPolicy({ minimumReferenceFactor: 0.01 });

    expect(DEFAULT_LOAD_VALIDATION_POLICY.minimumReferenceFactor).toBe(1e-9);
  });

  it('nimmt die Randwerte an, die die Regeln ausdruecklich zulassen', () => {
    expect(
      createLoadValidationPolicy({ stationRelativeTolerance: 0 }),
    ).toMatchObject({ stationRelativeTolerance: 0 });
    // Faktor 0 bleibt trotzdem ein Fehler — das haengt am `<=` in validate.ts.
    expect(
      createLoadValidationPolicy({ minimumReferenceFactor: 0 }),
    ).toMatchObject({ minimumReferenceFactor: 0 });
    expect(
      createLoadValidationPolicy({ suspiciousReferenceFactor: 1 }),
    ).toMatchObject({ suspiciousReferenceFactor: 1 });
  });

  it('lehnt eine nicht endliche oder negative Stationstoleranz ab', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -1e-9]) {
      expect(() =>
        createLoadValidationPolicy({ stationRelativeTolerance: value }),
      ).toThrow(InvalidLoadValidationPolicyError);
    }
  });

  it('verlangt 0 <= minimum < suspicious <= 1', () => {
    const rejected = [
      { minimumReferenceFactor: -0.1 },
      { suspiciousReferenceFactor: 1.5 },
      // Gleich ist bereits zu viel: sonst gaebe es kein Fenster, in dem
      // gewarnt statt abgelehnt wird.
      { minimumReferenceFactor: 0.05 },
      { minimumReferenceFactor: 0.5, suspiciousReferenceFactor: 0.2 },
      { suspiciousReferenceFactor: Number.NaN },
      { minimumReferenceFactor: Number.POSITIVE_INFINITY },
    ];

    for (const overrides of rejected) {
      expect(() => createLoadValidationPolicy(overrides)).toThrow(
        InvalidLoadValidationPolicyError,
      );
    }
  });

  it('prueft WERTE, nicht die Form — unbekannte Felder gehen durch', () => {
    // Die Factory bekommt ein getyptes Argument. Der Grenzuebertritt aus JSON
    // ist der Parser; dieselbe Formpruefung an zwei Stellen waeren zwei
    // Wahrheiten ueber dieselbe Form.
    const policy = createLoadValidationPolicy({
      stationRelativeTolerance: 1e-6,
      unbekannt: 42,
    } as never);

    expect(policy).toEqual({
      stationRelativeTolerance: 1e-6,
      minimumReferenceFactor: 1e-9,
      suspiciousReferenceFactor: 0.05,
    });
  });
});

describe('parseLoadValidationPolicy', () => {
  it('liest die vollstaendige JSON-Form zurueck', () => {
    const policy = createLoadValidationPolicy({
      stationRelativeTolerance: 1e-8,
      suspiciousReferenceFactor: 0.08,
    });

    const roundtrip = parseLoadValidationPolicy(
      JSON.parse(JSON.stringify(policy)),
    );

    expect(roundtrip).toEqual(policy);
    expect(Object.isFrozen(roundtrip)).toBe(true);
  });

  it('baut immer ein neues Objekt — die Eingabe sind Fremddaten', () => {
    const parsed = parseLoadValidationPolicy({
      ...DEFAULT_LOAD_VALIDATION_POLICY,
    });

    expect(parsed).toEqual(DEFAULT_LOAD_VALIDATION_POLICY);
    expect(parsed).not.toBe(DEFAULT_LOAD_VALIDATION_POLICY);
  });

  it('verlangt alle drei Felder', () => {
    expect(() =>
      parseLoadValidationPolicy({
        stationRelativeTolerance: 1e-9,
        minimumReferenceFactor: 1e-9,
      }),
    ).toThrow(InvalidLoadValidationPolicyError);
  });

  it('lehnt unbekannte Felder ab', () => {
    // Ein stillschweigend geschluckter Tippfehler im Projektdatensatz waere
    // eine Einstellung, die nicht wirkt.
    expect(() =>
      parseLoadValidationPolicy({
        ...DEFAULT_LOAD_VALIDATION_POLICY,
        suspiciousFactor: 0.05,
      }),
    ).toThrow(InvalidLoadValidationPolicyError);
  });

  it('lehnt Nicht-Objekte und falsche Feldtypen ab', () => {
    for (const input of [null, undefined, 3, 'policy', []]) {
      expect(() => parseLoadValidationPolicy(input)).toThrow(
        InvalidLoadValidationPolicyError,
      );
    }
    expect(() =>
      parseLoadValidationPolicy({
        ...DEFAULT_LOAD_VALIDATION_POLICY,
        minimumReferenceFactor: '1e-9',
      }),
    ).toThrow(InvalidLoadValidationPolicyError);
  });

  it('prueft nach der Form auch die Werte', () => {
    expect(() =>
      parseLoadValidationPolicy({
        stationRelativeTolerance: 1e-9,
        minimumReferenceFactor: 0.9,
        suspiciousReferenceFactor: 0.05,
      }),
    ).toThrow(InvalidLoadValidationPolicyError);
  });
});
