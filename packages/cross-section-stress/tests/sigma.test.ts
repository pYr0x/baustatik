import { sectionProperties, stressPoints } from '@baustatik/cross-section';
import { describe, expect, it } from 'vitest';
import { sectionStresses, stressesAtPoints } from '../src/index';
import { byNr, iSection } from './sections';

/**
 * σ ist die Formel, deren Orakel man auswendig kann. Genau das ist ihr Wert
 * hier: `N/A` und `My/Wy` sind ohne Werkzeug nachrechenbar, also fällt ein
 * Faktor tausend in der Einheitenschleuse sofort auf.
 */

const stresses = (forces: Parameters<typeof sectionStresses>[1]) => {
  const rows = sectionStresses(iSection(), forces);
  if (rows === undefined) throw new Error('das I hat Spannungspunkte');

  return rows;
};

describe('σ unter reiner Normalkraft', () => {
  it('liefert N/A an JEDEM Punkt und τ überall null', () => {
    // Die Normalkraft weiss nichts von der Lage eines Punktes. Dass an allen
    // fünfzehn Punkten dieselbe Zahl steht, ist der Test der Schleuse: `A`
    // kommt in m² herein, `N` in kN, MPa fällt heraus.
    const A = sectionProperties(iSection())?.A;
    if (A === undefined) throw new Error('das I hat Querschnittswerte');

    const rows = stresses({ N: 250 });
    // 250 kN / 5188 mm² = 48,2 MPa; die Wandflaeche ist
    // `2·150·10,7 + 278,6·7,1`.
    const expected = (250 * 1000) / (A * 1e6);

    expect(rows).toHaveLength(15);
    for (const row of rows) {
      expect(row.sigma, `P${row.nr}`).toBeCloseTo(expected, 12);
      expect(row.tau, `P${row.nr}`).toBe(0);
    }
    expect(expected).toBeCloseTo(48.2, 1);
  });

  it('dreht mit dem Vorzeichen der Normalkraft', () => {
    const [zug] = stresses({ N: 250 });
    const [druck] = stresses({ N: -250 });

    expect(druck.sigma).toBeCloseTo(-zug.sigma, 12);
  });
});

describe('σ unter reinem My', () => {
  it('trifft an der Randfaser My/Wy', () => {
    // ERSETZT DAS TOTE RECHTECK-ORAKEL: `σ = My/W` am Vollrechteck läuft seit
    // ADR 0057 über einen Querschnitt, der gar keine Spannungspunkte mehr hat.
    // Das dünnwandige I hat welche, und sein `Wy = Iy/(h/2)` ist dieselbe
    // Handrechnung.
    const I = iSection();
    const properties = sectionProperties(I);
    if (properties === undefined) throw new Error('das I hat Querschnittswerte');

    const Wy = properties.Iy / (0.3 / 2);
    const rows = stresses({ My: 100 });

    // P1 liegt an der Gurtspitze oben (`z = -h/2`), P7 unten (`z = +h/2`).
    // `My > 0` ist Zug auf `+z`, also DRUCK oben (ADR 0060).
    expect(byNr(rows, 1).sigma).toBeCloseTo(-(100 * 1e6) / (Wy * 1e9), 9);
    expect(byNr(rows, 7).sigma).toBeCloseTo((100 * 1e6) / (Wy * 1e9), 9);
  });

  it('lässt σ auf der Schwerachse verschwinden', () => {
    // P15 ist der Stegpunkt im Schwerpunkt.
    expect(byNr(stresses({ My: 100 }), 15).sigma).toBeCloseTo(0, 12);
  });

  it('bleibt am selben Ort dasselbe, egal auf welcher Wand der Punkt liegt', () => {
    // σ hängt NUR an der Koordinate. Am Verzweigungsknoten (P3/P4, beide
    // `y = 0`, `z = -h/2`) muss deshalb dieselbe Zahl stehen — die Wand ist für
    // σ ohne Bedeutung (ADR 0059).
    const rows = stresses({ My: 100 });

    expect(byNr(rows, 3).sigma).toBe(byNr(rows, 4).sigma);
  });
});

describe('σ ist linear in den Schnittgrössen', () => {
  // Superposition ist die eine Eigenschaft, die die Formel als GANZE prüft:
  // sie hält nur, wenn kein Betrag und kein Quadrat in σ steckt.
  const I = iSection();
  const properties = sectionProperties(I);
  const points = stressPoints(I);
  if (properties === undefined || points === undefined) {
    throw new Error('das I hat Querschnittswerte und Spannungspunkte');
  }

  const sigma = (forces: Parameters<typeof stressesAtPoints>[2]) =>
    stressesAtPoints(properties, points, forces).map((r) => r.sigma);

  it('skaliert: f(2F) = 2·f(F)', () => {
    const einfach = sigma({ N: 250, My: 100, Mz: 8 });
    const doppelt = sigma({ N: 500, My: 200, Mz: 16 });

    doppelt.forEach((s, i) => expect(s).toBeCloseTo(2 * einfach[i], 9));
  });

  it('addiert: f(F₁ + F₂) = f(F₁) + f(F₂)', () => {
    const a = sigma({ N: 250 });
    const b = sigma({ My: 100, Mz: 8 });
    const zusammen = sigma({ N: 250, My: 100, Mz: 8 });

    zusammen.forEach((s, i) => expect(s).toBeCloseTo(a[i] + b[i], 9));
  });
});
