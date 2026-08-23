import { describe, expect, it } from 'vitest';
import { sectionStresses } from '../src/index';
import { byNr, iSection } from './sections';

/**
 * ADR 0059 IN EINER ASSERTION-FOLGE.
 *
 * Am Gurtknoten des I stehen ZWEI Punkte: gleiche Koordinate, verschiedenes
 * Wandelement. Was jede der beiden Grössen daraus macht, ist die Aussage dieses
 * Tests — und es ist für σ und τ verschieden.
 */

describe('Der Verzweigungsknoten des I trägt zwei Punkte', () => {
  const rows = (() => {
    const r = sectionStresses(iSection(), { My: 100, Vz: 50 });
    if (r === undefined) throw new Error('das I hat Spannungspunkte');

    return r;
  })();

  // P3 und P4 liegen beide auf `y = 0`, `z = -h/2` — der Obergurt links und
  // rechts vom Steg (ADR 0059).
  const links = byNr(rows, 3);
  const rechts = byNr(rows, 4);

  it('stellt sie an denselben Ort auf verschiedene Wände', () => {
    expect([links.y, links.z]).toEqual([rechts.y, rechts.z]);
    expect(links.wall).toBe('flange-top-left');
    expect(rechts.wall).toBe('flange-top-right');
    expect(links.wall).not.toBe(rechts.wall);
  });

  it('gibt beiden unter My dasselbe σ — σ hängt nur an der Koordinate', () => {
    // Bis aufs letzte Bit, nicht nur nahe: es ist DIESELBE Rechnung mit
    // denselben Zahlen. Eine Wand kommt in σ gar nicht vor.
    expect(links.sigma).toBe(rechts.sigma);
  });

  it('gibt beiden unter Vz dasselbe q bei ENTGEGENGESETZTEN Tangenten', () => {
    // Beide Gurtelemente tragen dasselbe `Sy`, also denselben Schubfluss —
    // physikalisch laufen die Flüsse aber AUFEINANDER ZU. Das steckt
    // ausschliesslich in den Tangenten, und genau deshalb reisen sie in
    // `StressAtPoint` mit (ADR 0058/0059).
    expect(links.tau).toBeCloseTo(rechts.tau, 12);
    expect(links.ty).toBe(-rechts.ty);
    expect(links.ty * rechts.ty).toBe(-1);
  });

  it('lässt die beiden unter Vy auseinandertreten', () => {
    // `Sz` KIPPT MIT DER ELEMENTTANGENTE, `Sy` nicht. Unter `Vy` tragen die
    // beiden Punkte deshalb entgegengesetzte Flüsse — und projiziert auf `+y`
    // wieder denselben Wert, weil beide Elemente ihre eigene Richtung
    // mitbringen.
    const r = sectionStresses(iSection(), { Vy: 30 });
    if (r === undefined) throw new Error('das I hat Spannungspunkte');

    const a = byNr(r, 3);
    const b = byNr(r, 4);

    expect(a.tau).toBeCloseTo(-b.tau, 12);
    expect(a.tau * a.ty).toBeCloseTo(b.tau * b.ty, 12);
  });
});
