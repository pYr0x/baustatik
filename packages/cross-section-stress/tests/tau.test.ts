import { describe, expect, it } from 'vitest';
import { sectionStresses } from '../src/index';
import { box, byNr, rolled } from './sections';

/**
 * τ ist die Formel, in der sich ein Zehnerpotenzfehler versteckt: `S` kommt in
 * cm³ herein, `I` in m⁴, `V` in kN — drei Einheiten, ein Ergebnis. Die Orakel
 * sind deshalb Zahlen aus der gedruckten Tabelle, nicht Verhältnisse.
 */

describe('τ am gewalzten Profil', () => {
  it('trifft im Schwerpunkt V·Sy/(Iy·tw) mit dem Sy der Tabelle', () => {
    // IPE 80, `Sy = 11,61 cm³` im Schwerpunkt — der Zweig, der an 546
    // Referenzwerten geprüft ist. `Iy = 80,14 cm⁴`, `tw = 3,8 mm`.
    const rows = sectionStresses(rolled('IPE 80'), { Vz: 10 });
    if (rows === undefined) throw new Error('das Walzprofil hat Punkte');

    // Von Hand: 10 kN · 11,61 cm³ / (80,14 cm⁴ · 3,8 mm)
    //         = 10 000 N · 11 610 mm³ / (801 400 mm⁴ · 3,8 mm) = 38,1 MPa
    const expected = (10_000 * 11_610) / (801_400 * 3.8);

    expect(byNr(rows, 15).tau).toBeCloseTo(expected, 1);
    expect(expected).toBeCloseTo(38.1, 1);
  });

  it('lässt τ an der freien Gurtspitze verschwinden', () => {
    // P1 und P6 sind die Spitzen des Obergurts: dort ist nichts abgeschnitten,
    // also `S = 0` — und ein freier Rand trägt keinen Schubfluss.
    const rows = sectionStresses(rolled('IPE 300'), { Vz: 50 });
    if (rows === undefined) throw new Error('das Walzprofil hat Punkte');

    expect(byNr(rows, 1).tau).toBe(0);
    expect(byNr(rows, 6).tau).toBe(0);
  });

  it('wächst im Steg zum Schwerpunkt hin an', () => {
    // Die Grashof-Parabel, in drei Stützstellen: Steganfang (P13), Schwerpunkt
    // (P15), Stegende (P14). Symmetrisch, mit dem Scheitel in der Mitte.
    const rows = sectionStresses(rolled('IPE 300'), { Vz: 50 });
    if (rows === undefined) throw new Error('das Walzprofil hat Punkte');

    const oben = byNr(rows, 13).tau;
    const mitte = byNr(rows, 15).tau;
    const unten = byNr(rows, 14).tau;

    expect(mitte).toBeGreaterThan(oben);
    expect(oben).toBeCloseTo(unten, 12);
  });
});

describe('τ im geschlossenen Kasten', () => {
  it('lässt beide Stege unter Vz denselben Betrag tragen, mit gedrehtem Vorzeichen', () => {
    // DER UMLAUF. Rechter Steg (P1/P16/P15) und linker Steg (P7/P8/P9) tragen
    // `Vz` gemeinsam nach unten ab — ihre TANGENTEN zeigen dabei gegeneinander
    // (`+z` rechts, `-z` links), ihre Flüsse also im Vorzeichen ebenfalls.
    // Erst beides zusammen ergibt zweimal dieselbe Kraft nach unten (ADR 0058).
    const rows = sectionStresses(box(), { Vz: 40 });
    if (rows === undefined) throw new Error('der Kasten hat Punkte');

    const rechts = byNr(rows, 16);
    const links = byNr(rows, 8);

    expect(rechts.tz).toBe(1);
    expect(links.tz).toBe(-1);
    expect(links.tau).toBeCloseTo(-rechts.tau, 12);
    // Und beide zeigen nach unten: τ mal Tangente ist beidesmal positiv.
    expect(rechts.tau * rechts.tz).toBeGreaterThan(0);
    expect(links.tau * links.tz).toBeGreaterThan(0);
  });

  it('trägt an den Wandmitten der Stege das Maximum', () => {
    const rows = sectionStresses(box(), { Vz: 40 });
    if (rows === undefined) throw new Error('der Kasten hat Punkte');

    const stegmitte = Math.abs(byNr(rows, 16).tau);
    for (const row of rows) {
      expect(Math.abs(row.tau), `P${row.nr}`).toBeLessThanOrEqual(
        stegmitte + 1e-12,
      );
    }
  });
});
