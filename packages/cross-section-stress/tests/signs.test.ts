import { describe, expect, it } from 'vitest';
import { sectionStresses } from '../src/index';
import { byNr, iSection } from './sections';

/**
 * DER GEKOPPELTE TEST — und er ist mit Absicht EIN Test an EINEM Querschnitt.
 *
 * `My` und `Vz` sind ein Paar: beide fallen aus demselben Kreuzprodukt, und
 * `dMy/dx = +Vz` verbindet sie
 * ([ADR 0060](../../../docs/adr/0060-the-section-forces-are-right-handed-components.md)).
 * Zwei getrennte Tests lassen das Paar KONSISTENT FALSCH sein — jeder für sich
 * grün, gemeinsam um ein Vorzeichen verdreht. Laut ADR 0058 war genau das
 * jahrelang der Zustand des Repositories.
 *
 * Dasselbe gilt für `Mz` und `Vy`, und dort ist es heute unbeobachtet: kein
 * Solver im Repository liefert `Vy`.
 */

const stresses = (forces: Parameters<typeof sectionStresses>[1]) => {
  const rows = sectionStresses(iSection(), forces);
  if (rows === undefined) throw new Error('das I hat Spannungspunkte');

  return rows;
};

describe('Das Paar My/Vz am selben Querschnitt', () => {
  it('legt My > 0 auf +z in den Zug UND Vz > 0 in den Steg nach unten', () => {
    // BEIDE HAELFTEN IN EINER ASSERTION-FOLGE.
    //
    // (1) `My > 0` ist Zug auf `+z`: P7 (Untergurtspitze, `z = +h/2`) zieht,
    //     P1 (Obergurtspitze, `z = -h/2`) drückt. Das ist der Spezialfall, der
    //     aus `My = +∫z·σ dA` herausfällt und den `fem-element` seit jeher so
    //     schreibt.
    //
    // (2) `Vz > 0` erzeugt im Steg einen Schubfluss, der NACH UNTEN läuft,
    //     also in Richtung der Querkraft. Der Stegpunkt P15 trägt die Tangente
    //     `(0, +1)`; `tau > 0` heisst damit „in `+z`".
    const rows = stresses({ My: 100, Vz: 50 });

    const obergurt = byNr(rows, 1);
    const untergurt = byNr(rows, 7);
    const steg = byNr(rows, 15);

    expect(untergurt.z).toBeGreaterThan(0);
    expect(untergurt.sigma).toBeGreaterThan(0);
    expect(obergurt.z).toBeLessThan(0);
    expect(obergurt.sigma).toBeLessThan(0);

    expect(steg.tz).toBe(1);
    expect(steg.tau).toBeGreaterThan(0);
    // Die Gleichgewichtsprobe im Kleinen: der Fluss zeigt in dieselbe Richtung
    // wie die Querkraft, die ihn erzeugt.
    expect(steg.tau * steg.tz).toBeGreaterThan(0);
  });

  it('dreht beide Hälften mit, wenn beide Schnittgrössen kippen', () => {
    const positiv = stresses({ My: 100, Vz: 50 });
    const negativ = stresses({ My: -100, Vz: -50 });

    for (const row of positiv) {
      const gedreht = byNr(negativ, row.nr);
      expect(gedreht.sigma, `P${row.nr}`).toBeCloseTo(-row.sigma, 12);
      expect(gedreht.tau, `P${row.nr}`).toBeCloseTo(-row.tau, 12);
    }
  });
});

describe('Das Paar Mz/Vy am selben Querschnitt', () => {
  it('legt Mz > 0 auf +y in den DRUCK und Vy > 0 in den Gurt nach +y', () => {
    // DIE UNBEOBACHTETE HAELFTE. `Mz = −∫y·σ dA`, also ist `Mz > 0` Druck auf
    // `+y` — das ungleiche Vorzeichen gegenüber `My` ist das Kreuzprodukt und
    // kein Bruch (ADR 0060). Dazu gehört `dMz/dx = −Vy`; wer eines von beiden
    // anders liefert, bekommt ein τ mit falschem Vorzeichen.
    const rows = stresses({ Mz: 40, Vy: 30 });

    // P1 liegt bei `y = -b/2`, P6 bei `y = +b/2` (beide Obergurt).
    const linksAussen = byNr(rows, 1);
    const rechtsAussen = byNr(rows, 6);

    expect(linksAussen.y).toBeLessThan(0);
    expect(linksAussen.sigma).toBeGreaterThan(0);
    expect(rechtsAussen.y).toBeGreaterThan(0);
    expect(rechtsAussen.sigma).toBeLessThan(0);

    // Der Gurtfluss unter `Vy`: am Knoten des Obergurts (P3, Element
    // `flange-top-left`, Tangente `(+1, 0)`) läuft er in `+y`, also in Richtung
    // der Querkraft.
    const knoten = byNr(rows, 3);
    expect(knoten.ty).toBe(1);
    expect(knoten.tau * knoten.ty).toBeGreaterThan(0);
  });
});
