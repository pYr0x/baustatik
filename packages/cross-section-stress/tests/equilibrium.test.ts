import { describe, expect, it } from 'vitest';
import type { StressAtPoint } from '../src/index';
import { sectionStresses } from '../src/index';
import { box, byNr, iSection } from './sections';

/**
 * DER EINZIGE END-TO-END-TEST DER EINHEITENSCHLEUSE.
 *
 * `∫ q ds` über die Stege, projiziert mit der Tangente, muss die Querkraft
 * ergeben, mit der man hineingegangen ist — eine Gleichung zwischen einer
 * GERECHNETEN Spannung [MPa] mal einer Dicke [mm] mal einer Länge [mm] und
 * einer EINGEGEBENEN Kraft [kN]. Ein Faktor tausend irgendwo im
 * Umrechnungspfad fällt hier sofort auf, statt in einer plausibel aussehenden
 * MPa-Zahl unterzugehen.
 *
 * DIE SCHRANKEN SIND AUS `@baustatik/cross-section` GEERBT und keine Toleranz
 * dieses Packages: 96,9 % beim I-Steg, 97,5 % beim Kasten. Der Rest ist die
 * senkrechte Schubkomponente in den Gurten, die das Wandmodell nicht führt
 * (ADR 0058) — ein Modellfehler, kein Rechenfehler.
 */

/**
 * Simpson über drei gleich weit stehende Stützstellen. Für eine PARABEL ist die
 * Regel exakt, und genau eine Parabel ist der Schubfluss längs einer Wand in
 * Schubrichtung — die drei Punkte, die die Vorlage ohnehin führt, reichen
 * deshalb für ein exaktes Integral.
 */
const simpson = (span: number, a: number, m: number, b: number) =>
  (span / 6) * (a + 4 * m + b);

/** Der Beitrag einer Stelle zur globalen `z`-Richtung: `q·tz = τ·t·tz` [N/mm]. */
const flowZ = (row: StressAtPoint, t: number) => row.tau * t * row.tz;

describe('Die Gleichgewichtsprobe des I', () => {
  it('leitet Vz zu 96,9 % über den Steg ab', () => {
    const I = { h: 300, b: 150, tw: 7.1, tf: 10.7 } as const;
    const Vz = 50;
    const rows = sectionStresses(iSection(I.h, I.b, I.tw, I.tf), { Vz });
    if (rows === undefined) throw new Error('das I hat Spannungspunkte');

    // P13 oben, P15 im Schwerpunkt, P14 unten — gleich weit, über die LICHTE
    // Höhe.
    const web = simpson(
      I.h - 2 * I.tf,
      flowZ(byNr(rows, 13), I.tw),
      flowZ(byNr(rows, 15), I.tw),
      flowZ(byNr(rows, 14), I.tw),
    );

    // `Vz` steht in kN, `web` in N — DIE STELLE, an der ein fehlender oder
    // doppelter Faktor tausend auffliegt.
    const anteil = web / (Vz * 1000);
    expect(anteil).toBeGreaterThan(0.96);
    expect(anteil).toBeLessThan(1);
    expect(anteil).toBeCloseTo(0.969, 3);
  });
});

describe('Die Gleichgewichtsprobe des Kastens', () => {
  it('leitet Vz zu 97,5 % über beide Stege ab, und beide gleich viel', () => {
    // DER UMLAUF. Die Tangenten der beiden Stege zeigen gegeneinander; erst die
    // Projektion `q·tz` macht daraus zweimal dieselbe Kraft nach unten. Ein
    // Feld aus Beträgen hebt sich hier auf, statt sich zu addieren.
    const B = { b: 200, h: 300, t: 10 } as const;
    const Vz = 40;
    const rows = sectionStresses(box(B.b, B.h, B.t), { Vz });
    if (rows === undefined) throw new Error('der Kasten hat Spannungspunkte');

    const span = B.h - 2 * B.t;
    // Rechter Steg: P1 oben, P16 Mitte, P15 unten.
    const rechts = simpson(
      span,
      flowZ(byNr(rows, 1), B.t),
      flowZ(byNr(rows, 16), B.t),
      flowZ(byNr(rows, 15), B.t),
    );
    // Linker Steg: P7, P8, P9 — Tangente `(0, -1)`, die Projektion holt sie
    // sich selbst.
    const links = simpson(
      span,
      flowZ(byNr(rows, 7), B.t),
      flowZ(byNr(rows, 8), B.t),
      flowZ(byNr(rows, 9), B.t),
    );

    expect(rechts).toBeCloseTo(links, 9);

    const anteil = (rechts + links) / (Vz * 1000);
    expect(anteil).toBeGreaterThan(0.97);
    expect(anteil).toBeLessThan(1);
    expect(anteil).toBeCloseTo(0.976, 3);
  });
});
