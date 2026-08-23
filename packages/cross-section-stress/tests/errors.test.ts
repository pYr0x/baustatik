import { BaustatikError } from '@baustatik/errors';
import { describe, expect, it } from 'vitest';
import {
  sectionStresses,
  stressesAtPoints,
  TorsionNotSupportedError,
} from '../src/index';
import { iSection } from './sections';

/**
 * `Mt` WIRFT, es wird nicht ignoriert. Der Verzicht ist technisch erzwungen:
 * Bredt braucht `Am`, und `Am` steht nicht in `SectionProperties`; beim offenen
 * Profil widerspricht `τ = Mt·t/It` direkt der Annahme, auf der der
 * Spannungspunkt gebaut ist. Stilles Ignorieren wäre unkonservativ — ein zu
 * kleines `sigmaV` ohne Warnung.
 */

describe('Das Torsionsmoment', () => {
  it('wirft, sobald es gesetzt und nicht null ist', () => {
    expect(() => sectionStresses(iSection(), { Mt: 5 })).toThrow(
      TorsionNotSupportedError,
    );
    expect(() => sectionStresses(iSection(), { My: 100, Mt: -0.5 })).toThrow(
      TorsionNotSupportedError,
    );
  });

  it('trägt den Wert als Feld, nicht nur in der Meldung', () => {
    try {
      sectionStresses(iSection(), { Mt: 5 });
      expect.unreachable('Mt = 5 muss werfen');
    } catch (error) {
      expect(error).toBeInstanceOf(BaustatikError);
      expect((error as TorsionNotSupportedError).Mt).toBe(5);
    }
  });

  it('lässt Mt = 0 und Mt = undefined durch', () => {
    // Ein räumlicher Solver schickt alle sechs Schnittgrössen, und die meisten
    // davon sind null. Ein `Mt: 0` als Fehler zu behandeln machte das Package
    // für seinen eigentlichen Aufrufer unbenutzbar.
    expect(sectionStresses(iSection(), { My: 100, Mt: 0 })).toHaveLength(15);
    expect(sectionStresses(iSection(), { My: 100 })).toHaveLength(15);
  });
});

describe('Der undefined-Zweig', () => {
  it('erbt undefined von der parametrischen Vollfigur (ADR 0057)', () => {
    // DREI GRUENDE, EIN `undefined`, und keiner davon wird hier gestopft: die
    // gezeichnete Geometrie, die parametrische Vollfigur und ungültige
    // Abmessungen.
    const voll = sectionStresses(
      {
        kind: 'shape',
        id: 'I-voll',
        shape: {
          kind: 'i-symmetric',
          h: 300,
          b: 150,
          tw: 7.1,
          tf: 10.7,
          idealisation: 'solid',
        },
      },
      { My: 100 },
    );

    expect(voll).toBeUndefined();
  });

  it('erbt undefined vom Vollrechteck', () => {
    const rechteck = sectionStresses(
      { kind: 'shape', id: 'R', shape: { kind: 'rectangle', b: 100, h: 200 } },
      { My: 100 },
    );

    expect(rechteck).toBeUndefined();
  });

  it('erbt undefined von ungültigen Abmessungen', () => {
    const kaputt = sectionStresses(
      {
        kind: 'shape',
        id: 'I-kaputt',
        shape: {
          kind: 'i-symmetric',
          h: 300,
          b: 150,
          tw: 7.1,
          tf: -1,
          idealisation: 'thin-walled',
        },
      },
      { My: 100 },
    );

    expect(kaputt).toBeUndefined();
  });

  it('wirft an Mt auch dann, wenn stressesAtPoints direkt gerufen wird', () => {
    // Die Prüfung steht in der inneren Tür, nicht in der bequemen — sonst käme
    // ein Aufrufer mit eigenen Punkten daran vorbei.
    expect(() =>
      stressesAtPoints(
        { A: 1, Iy: 1, Iz: 1, Iyz: 0, ys: 0, zs: 0, alpha: 0, Iu: 1, Iv: 1 },
        [],
        { Mt: 1 },
      ),
    ).toThrow(TorsionNotSupportedError);
  });
});
