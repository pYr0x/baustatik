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
  it('discretisationTolerance ist DEFAULT_ARC_TOLERANCE aus section-geometry', () => {
    // Sonst kehrte der Zustand zurück, den P0 beseitigt hat: zwei Zahlen für
    // eine Modellannahme (ADR 0032).
    expect(DEFAULT_SECTION_POLICY.discretisationTolerance).toBe(DEFAULT_ARC_TOLERANCE);
  });

  it('principalAxisTolerance ist 1e-9 und wohnt hier', () => {
    // Anders als `discretisationTolerance` gibt es für sie keinen zweiten Ort: die Frage
    // „liegt Hauptachsenlage vor" wird allein vom Gate gestellt.
    expect(DEFAULT_SECTION_POLICY.principalAxisTolerance).toBe(1e-9);
  });

  it('miterLimit ist 2 — die Vorgabe von Clipper2, hier benannt', () => {
    // Sie kappt unter 60 Grad Innenwinkel; der rechtwinklige Stoß jedes
    // gewalzten Profils bleibt mit 1/sin(45 Grad) = 1,41 weit darunter
    // (ADR 0037).
    expect(DEFAULT_SECTION_POLICY.miterLimit).toBe(2);
  });

  it('thickWallRatio ist 1/3 — grosszügig, und das mit Absicht', () => {
    // Die Literatur nennt 1/10 bis 1/5 als „dünnwandig"; die Warnung soll den
    // Fall treffen, in dem die Theorie nicht daneben, sondern falsch liegt
    // (ADR 0040).
    expect(DEFAULT_SECTION_POLICY.thickWallRatio).toBe(1 / 3);
  });

  it('shearCentreTolerance ist 1e-6 und damit weiter als die der Hauptachsen', () => {
    // `yM` fällt aus ZWEI numerischen Integrationen über zwei Figuren, `Iyz`
    // aus einer.
    expect(DEFAULT_SECTION_POLICY.shearCentreTolerance).toBe(1e-6);
    expect(DEFAULT_SECTION_POLICY.shearCentreTolerance).toBeGreaterThan(
      DEFAULT_SECTION_POLICY.principalAxisTolerance,
    );
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
    const policy = createSectionPolicy({ discretisationTolerance: 0.2 });
    expect(policy.discretisationTolerance).toBe(0.2);
    expect(Object.isFrozen(policy)).toBe(true);
    expect(DEFAULT_SECTION_POLICY.discretisationTolerance).toBe(DEFAULT_ARC_TOLERANCE);
  });

  it('eine Toleranz von 0 oder darunter wäre keine Diskretisierung', () => {
    // 0 verlangte unendlich viele Punkte; negativ ließe `Bulge.isStraight` nie
    // mehr wahr werden — die Gerade wäre abgeschafft.
    for (const discretisationTolerance of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createSectionPolicy({ discretisationTolerance })).toThrow(
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
      createSectionPolicy({ discretisationTolerance: 0 });
      expect.unreachable();
    } catch (error) {
      expect((error as InvalidSectionPolicyError).field).toBe('discretisationTolerance');
    }
  });
});

describe('parseSectionPolicy ist der Grenzübertritt aus Fremddaten', () => {
  it('nimmt einen vollständigen Satz an und friert ihn ein', () => {
    const full = {
      discretisationTolerance: 0.1,
      principalAxisTolerance: 1e-8,
      miterLimit: 3,
      thickWallRatio: 0.25,
      shearCentreTolerance: 1e-7,
    };
    const policy = parseSectionPolicy(full);
    expect(policy).toEqual(full);
    expect(Object.isFrozen(policy)).toBe(true);
  });

  // Der Satz aus P1 ist kein gültiger Satz aus P2 — es gibt keine Teil-Policy,
  // und ein eingesetzter Default BEHAUPTETE, unter ihm sei erzeugt worden.
  it('lehnt einen Satz ohne principalAxisTolerance ab', () => {
    expect(() => parseSectionPolicy({ discretisationTolerance: 0.1 })).toThrow(
      InvalidSectionPolicyError,
    );
  });

  // Und derselbe Satz ist kein gültiger Satz aus P3.
  it('lehnt einen Satz ohne miterLimit ab', () => {
    expect(() =>
      parseSectionPolicy({ discretisationTolerance: 0.1, principalAxisTolerance: 1e-9 }),
    ).toThrow(InvalidSectionPolicyError);
  });

  // Und derselbe Satz ist kein gültiger Satz aus P5.
  it('lehnt einen Satz ohne die beiden Beurteilungsfelder ab', () => {
    expect(() =>
      parseSectionPolicy({
        discretisationTolerance: 0.1,
        principalAxisTolerance: 1e-9,
        miterLimit: 2,
      }),
    ).toThrow(InvalidSectionPolicyError);
    expect(() =>
      parseSectionPolicy({
        discretisationTolerance: 0.1,
        principalAxisTolerance: 1e-9,
        miterLimit: 2,
        thickWallRatio: 1 / 3,
      }),
    ).toThrow(InvalidSectionPolicyError);
  });

  it('lehnt ein unbekanntes Feld ab, statt es zu ignorieren', () => {
    // Ein stillschweigend geschluckter Tippfehler wäre eine Einstellung, die
    // nicht wirkt.
    expect(() =>
      parseSectionPolicy({
        ...DEFAULT_SECTION_POLICY,
        discretisationTolerence: 0.2,
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
    const full = { ...DEFAULT_SECTION_POLICY };
    expect(() => parseSectionPolicy({ ...full, discretisationTolerance: 0 })).toThrow(
      InvalidSectionPolicyError,
    );
    expect(() => parseSectionPolicy({ ...full, discretisationTolerance: '0.05' })).toThrow(
      InvalidSectionPolicyError,
    );
    expect(() =>
      parseSectionPolicy({ ...full, principalAxisTolerance: -1 }),
    ).toThrow(InvalidSectionPolicyError);
    expect(() => parseSectionPolicy({ ...full, miterLimit: 1 })).toThrow(
      InvalidSectionPolicyError,
    );
    // `thickWallRatio: 0` liesse `t/L > 0` bei jeder Wand wahr werden.
    expect(() => parseSectionPolicy({ ...full, thickWallRatio: 0 })).toThrow(
      InvalidSectionPolicyError,
    );
    expect(() =>
      parseSectionPolicy({ ...full, shearCentreTolerance: -1 }),
    ).toThrow(InvalidSectionPolicyError);
    // `0` ist zulässig: das ist der exakte Vergleich, die Schärfe bis P5.
    expect(
      parseSectionPolicy({ ...full, shearCentreTolerance: 0 })
        .shearCentreTolerance,
    ).toBe(0);
  });
});
