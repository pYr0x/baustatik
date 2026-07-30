/**
 * Das zweite Tor gegen den elementinternen Mechanismus.
 *
 * `@baustatik/fem` beanstandet denselben Befund schon am MODELL
 * (`UnrestrainedBeamError`), aus der blossen Freisetzungskombination. Hier wird
 * er GEMESSEN — dieses Package ist oeffentlich und darf sich nicht auf einen
 * fremden Pruefer verlassen. Beide muessen sich decken; wo sie es nicht taeten,
 * kaeme entweder eine unnoetige Beanstandung oder eine Division durch fast
 * nichts heraus.
 */

import { describe, expect, it } from 'vitest';
import { UnrestrainedElementError } from '../src/errors';
import { Timoshenko2D, Timoshenko2DIntegrated } from '../src/timoshenko';
import type { ElementReleases, SectionStiffness } from '../src/types';

const L = 3;
const rigid: SectionStiffness = { EA: 1e5, EI: 2e4, GAs: 'rigid' };
const shear: SectionStiffness = { EA: 1e5, EI: 2e4, GAs: 5e4 };

/** Die Kombinationen, die den jeweiligen Block leerraeumen. */
const mechanisms: [string, ElementReleases][] = [
  ['u an beiden Enden', { start: { u: true }, end: { u: true } }],
  ['w an beiden Enden', { start: { w: true }, end: { w: true } }],
  [
    'w und theta am Anfang plus theta am Ende',
    { start: { w: true, theta: true }, end: { theta: true } },
  ],
  [
    'theta am Anfang plus w und theta am Ende',
    { start: { theta: true }, end: { w: true, theta: true } },
  ],
  [
    'alles im Biegeblock',
    { start: { w: true, theta: true }, end: { w: true, theta: true } },
  ],
];

/** Die Kombinationen, die durchgehen muessen. */
const allowed: [string, ElementReleases][] = [
  ['der Pendelstab', { start: { theta: true }, end: { theta: true } }],
  ['u und w an EINEM Ende', { start: { u: true, w: true } }],
  ['u am Anfang, w am Ende', { start: { u: true }, end: { w: true } }],
  [
    'u am Anfang plus der Pendelstab',
    { start: { u: true, theta: true }, end: { theta: true } },
  ],
  [
    'w und theta am selben Ende',
    { start: { w: true, theta: true } },
  ],
];

describe.each([
  ['Timoshenko2D', Timoshenko2D],
  ['Timoshenko2DIntegrated', Timoshenko2DIntegrated],
])('%s: prepare als Tor gegen den elementinternen Mechanismus', (_n, f) => {
  it.each(mechanisms)('wirft bei %s', (_name, releases) => {
    for (const props of [rigid, shear]) {
      expect(() => f.prepare(props, L, releases)).toThrow(
        UnrestrainedElementError,
      );
    }
  });

  it.each(allowed)('laesst %s durch', (_name, releases) => {
    for (const props of [rigid, shear]) {
      expect(() => f.prepare(props, L, releases)).not.toThrow();
    }
  });
});

describe('Kondensation', () => {
  it('nennt den Freiheitsgrad in der Schreibweise der Releases', () => {
    // Damit die Meldung aus diesem abhaengigkeitsfreien Package im Modell
    // wiederzufinden ist: dieselben Woerter wie `Beam['releases']` (ADR 0017).
    let caught: UnrestrainedElementError | undefined;
    try {
      Timoshenko2D.prepare(rigid, L, { start: { u: true }, end: { u: true } });
    } catch (error) {
      caught = error as UnrestrainedElementError;
    }

    expect(caught).toBeInstanceOf(UnrestrainedElementError);
    expect(caught?.dof).toBe('end.u');
    expect(caught?.originalPivot).toBeCloseTo(rigid.EA / L, 6);
  });

  it('nimmt einem Gelenk die Steifigkeit und laesst die uebrigen stehen', () => {
    const plain = Timoshenko2D.prepare(rigid, L).stiffness();
    const hinged = Timoshenko2D.prepare(rigid, L, {
      start: { theta: true },
    }).stiffness();

    // Zeile und Spalte des freigesetzten Freiheitsgrads sind ganz null.
    for (let k = 0; k < 6; k += 1) {
      expect(hinged[2][k]).toBe(0);
      expect(hinged[k][2]).toBe(0);
    }
    // Die Biegesteifigkeit sinkt auf den bekannten Wert des einseitig
    // gelenkigen Stabs: 3EI/L^3 statt 12EI/L^3.
    expect(hinged[1][1]).toBeCloseTo((3 * rigid.EI) / L ** 3, 9);
    expect(plain[1][1]).toBeCloseTo((12 * rigid.EI) / L ** 3, 9);
    // Die Laengssteifigkeit bleibt unberuehrt — die Bloecke sind entkoppelt.
    expect(hinged[0][0]).toBe(plain[0][0]);
  });

  it('kondensiert den Lastvektor mit und laesst die Summe stehen', () => {
    // Wer nur `K` kondensiert, verliert den Anteil, den der freigesetzte
    // Freiheitsgrad getragen haette — er verteilt sich nicht um, er
    // verschwindet. Die Summe der Querkraft-Ersatzknotenlasten muss die volle
    // aufgebrachte Last bleiben.
    const q = 5;
    const load = {
      segments: [
        { from: 0, to: L, qx1: 0, qx2: 0, qz1: q, qz2: q, my1: 0, my2: 0 },
      ],
      points: [],
    };
    const f = Timoshenko2D.prepare(rigid, L, { start: { theta: true } })
      .withLoad(load)
      .consistentLoad();

    expect(f[2]).toBe(0);
    expect(f[1] + f[4]).toBeCloseTo(q * L, 9);
    // Und sie verteilt sich UNGLEICH: 3/8 auf das Gelenk, 5/8 auf die
    // Einspannung — das Handbuch-Ergebnis des einseitig gelenkigen Stabs.
    expect(f[1]).toBeCloseTo((3 * q * L) / 8, 9);
    expect(f[5]).toBeCloseTo(-(q * L * L) / 8, 9);
  });
});
