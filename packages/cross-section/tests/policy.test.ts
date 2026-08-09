import { DEFAULT_ARC_TOLERANCE } from '@baustatik/section-geometry';
import { describe, expect, it } from 'vitest';
import {
  createSectionPolicy,
  DEFAULT_SECTION_POLICY,
  InvalidSectionPolicyError,
  parseSectionPolicy,
} from '../src/index';

/**
 * Die Erzeugungs-Policy des Querschnitts
 * ([ADR 0033](../../../docs/adr/0033-the-cross-section-has-a-creation-policy.md)).
 *
 * ZWEI EINGAENGE mit verschiedenen Aufgaben: die Fabrik prüft WERTE, der
 * Parser zusätzlich die FORM. Genau das halten die beiden Blöcke fest.
 */
describe('Die Voreinstellung liest ihre Zahl, statt sie neu zu setzen', () => {
  it('arcTolerance ist DEFAULT_ARC_TOLERANCE aus section-geometry', () => {
    // Sonst kehrte der Zustand zurück, den P0 beseitigt hat: zwei Zahlen für
    // eine Modellannahme (ADR 0032).
    expect(DEFAULT_SECTION_POLICY.arcTolerance).toBe(DEFAULT_ARC_TOLERANCE);
  });

  it('principalAxisTolerance ist 1e-9 und wohnt hier', () => {
    // Anders als `arcTolerance` gibt es für sie keinen zweiten Ort: die Frage
    // „liegt Hauptachsenlage vor" wird allein vom Gate gestellt.
    expect(DEFAULT_SECTION_POLICY.principalAxisTolerance).toBe(1e-9);
  });

  it('miterLimit ist 2 — die Vorgabe von Clipper2, hier benannt', () => {
    // Sie kappt unter 60 Grad Innenwinkel; der rechtwinklige Stoß jedes
    // gewalzten Profils bleibt mit 1/sin(45 Grad) = 1,41 weit darunter
    // (ADR 0037).
    expect(DEFAULT_SECTION_POLICY.miterLimit).toBe(2);
  });

  it('sie ist eingefroren', () => {
    expect(Object.isFrozen(DEFAULT_SECTION_POLICY)).toBe(true);
  });
});

describe('createSectionPolicy nimmt Abweichungen und prüft nur Werte', () => {
  it('ohne Overrides ist das Ergebnis der Default SELBST, keine Kopie', () => {
    expect(createSectionPolicy()).toBe(DEFAULT_SECTION_POLICY);
    expect(createSectionPolicy({})).toBe(DEFAULT_SECTION_POLICY);
  });

  it('mit Override entsteht ein eingefrorener neuer Satz', () => {
    const policy = createSectionPolicy({ arcTolerance: 0.2 });
    expect(policy.arcTolerance).toBe(0.2);
    expect(Object.isFrozen(policy)).toBe(true);
    expect(DEFAULT_SECTION_POLICY.arcTolerance).toBe(DEFAULT_ARC_TOLERANCE);
  });

  it('eine Toleranz von 0 oder darunter wäre keine Diskretisierung', () => {
    // 0 verlangte unendlich viele Punkte; negativ ließe `Bulge.isStraight` nie
    // mehr wahr werden — die Gerade wäre abgeschafft.
    for (const arcTolerance of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createSectionPolicy({ arcTolerance })).toThrow(
        InvalidSectionPolicyError,
      );
    }
  });

  it('ein miterLimit bis 1 wäre eine Einstellung, die nicht wirkt', () => {
    // Clipper2 ersetzt jeden Wert <= 1 STILL durch 2 (`Offset.ts`, `mitLimSqr`).
    // Die Schranke ist damit abgelesen und nicht gewählt.
    for (const miterLimit of [
      1,
      0.5,
      0,
      -1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(() => createSectionPolicy({ miterLimit })).toThrow(
        InvalidSectionPolicyError,
      );
    }
    expect(createSectionPolicy({ miterLimit: 1.0001 }).miterLimit).toBe(1.0001);
  });

  it('der Fehler nennt das Feld, damit ein Dialog es markieren kann', () => {
    try {
      createSectionPolicy({ arcTolerance: 0 });
      expect.unreachable();
    } catch (error) {
      expect((error as InvalidSectionPolicyError).field).toBe('arcTolerance');
    }
  });
});

describe('parseSectionPolicy ist der Grenzübertritt aus Fremddaten', () => {
  it('nimmt einen vollständigen Satz an und friert ihn ein', () => {
    const policy = parseSectionPolicy({
      arcTolerance: 0.1,
      principalAxisTolerance: 1e-8,
      miterLimit: 3,
    });
    expect(policy).toEqual({
      arcTolerance: 0.1,
      principalAxisTolerance: 1e-8,
      miterLimit: 3,
    });
    expect(Object.isFrozen(policy)).toBe(true);
  });

  // Der Satz aus P1 ist kein gültiger Satz aus P2 — es gibt keine Teil-Policy,
  // und ein eingesetzter Default BEHAUPTETE, unter ihm sei erzeugt worden.
  it('lehnt einen Satz ohne principalAxisTolerance ab', () => {
    expect(() => parseSectionPolicy({ arcTolerance: 0.1 })).toThrow(
      InvalidSectionPolicyError,
    );
  });

  // Und derselbe Satz ist kein gültiger Satz aus P3.
  it('lehnt einen Satz ohne miterLimit ab', () => {
    expect(() =>
      parseSectionPolicy({ arcTolerance: 0.1, principalAxisTolerance: 1e-9 }),
    ).toThrow(InvalidSectionPolicyError);
  });

  it('lehnt ein unbekanntes Feld ab, statt es zu ignorieren', () => {
    // Ein stillschweigend geschluckter Tippfehler wäre eine Einstellung, die
    // nicht wirkt.
    expect(() =>
      parseSectionPolicy({
        arcTolerance: 0.1,
        principalAxisTolerance: 1e-9,
        miterLimit: 2,
        arcTolerence: 0.2,
      }),
    ).toThrow(InvalidSectionPolicyError);
  });

  it('lehnt einen unvollständigen Satz ab — es gibt keine Teil-Policy', () => {
    expect(() => parseSectionPolicy({})).toThrow(InvalidSectionPolicyError);
  });

  it('lehnt ab, was kein Objekt ist', () => {
    for (const input of [null, 42, 'x', [0.05], undefined]) {
      expect(() => parseSectionPolicy(input)).toThrow(InvalidSectionPolicyError);
    }
  });

  it('prüft die Werte mit derselben Regel wie die Fabrik', () => {
    const full = {
      arcTolerance: 0.05,
      principalAxisTolerance: 1e-9,
      miterLimit: 2,
    };
    expect(() => parseSectionPolicy({ ...full, arcTolerance: 0 })).toThrow(
      InvalidSectionPolicyError,
    );
    expect(() => parseSectionPolicy({ ...full, arcTolerance: '0.05' })).toThrow(
      InvalidSectionPolicyError,
    );
    expect(() =>
      parseSectionPolicy({ ...full, principalAxisTolerance: -1 }),
    ).toThrow(InvalidSectionPolicyError);
    expect(() => parseSectionPolicy({ ...full, miterLimit: 1 })).toThrow(
      InvalidSectionPolicyError,
    );
  });
});
