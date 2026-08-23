import { describe, expect, it } from 'vitest';
import { sectionStresses } from '../src/index';
import { byNr, rolled } from './sections';

/**
 * DER HANDDURCHGANG — ein Fall, ein Profil, zwei Zahlen, beide von Hand
 * nachrechenbar und beide in einer Einheit, in der man den Zahlenwert
 * WIEDERERKENNT.
 *
 * Er prüft nichts, was die Tests nebenan nicht auch prüfen. Was er zusätzlich
 * leistet: er nennt die Orakel in der Form, in der sie in der Profiltabelle
 * stehen, und macht damit den ganzen Pfad — Katalogzeile, Querschnittswerte,
 * Spannungspunkte, Einheitenschleuse, Formel — an einer Stelle nachprüfbar.
 *
 * IPE 300, `My = 100 kNm`, `Vz = 50 kN`:
 *
 * ```text
 * σ = My/Wy       = 100 kNm / 557 cm³                = 179,5 MPa
 * τ = Vz·Sy/(Iy·tw) = 50 kN · 314 cm³ / (8356 cm⁴ · 7,1 mm) = 26,5 MPa
 * ```
 */

describe('IPE 300 unter My = 100 kNm und Vz = 50 kN', () => {
  const rows = (() => {
    const r = sectionStresses(rolled('IPE 300'), { My: 100, Vz: 50 });
    if (r === undefined) throw new Error('das Walzprofil hat Punkte');

    return r;
  })();

  it('trägt an der Randfaser 179,5 MPa, mit Zug unten', () => {
    // `Wy = Iy/(h/2) = 8356 cm⁴ / 15 cm = 557 cm³`, und die Tabelle druckt
    // `Wely = 557,1`. `My > 0` ist Zug auf `+z` (ADR 0060), also unten.
    const oben = byNr(rows, 1);
    const unten = byNr(rows, 7);

    expect(unten.sigma).toBeCloseTo(179.5, 1);
    expect(oben.sigma).toBeCloseTo(-179.5, 1);
    // Gegen die gedruckte Spalte, nicht gegen die nachgerechnete: 100 kNm auf
    // 557,1 cm³.
    expect(unten.sigma).toBeCloseTo((100 * 1e6) / (557.1 * 1e3), 0);
  });

  it('trägt im Schwerpunkt des Stegs 26,5 MPa', () => {
    // Gegen `SyMax = 314,2 cm³` der Tabelle — der Wert, den `rolled-i.ts` aus
    // den Abmessungen nachrechnet, trifft ihn auf vier Stellen.
    const mitte = byNr(rows, 15);

    expect(mitte.tau).toBeCloseTo(26.5, 1);
    expect(mitte.tau).toBeCloseTo(
      (50_000 * 314.2e3) / (83.56e6 * 7.1),
      1,
    );
    // Und σ verschwindet dort, wo τ sein Maximum hat.
    expect(mitte.sigma).toBe(0);
  });

  it('liefert σv aus beiden Anteilen', () => {
    const mitte = byNr(rows, 15);
    const unten = byNr(rows, 7);

    // Im Schwerpunkt ist es reiner Schub: √3 · 26,5 = 45,9 MPa.
    expect(mitte.sigmaV).toBeCloseTo(Math.sqrt(3) * 26.5, 0);
    // An der Randfaser ist τ null, σv also die Normalspannung selbst.
    expect(unten.tau).toBe(0);
    expect(unten.sigmaV).toBeCloseTo(179.5, 1);
  });
});
