import { describe, expect, it } from 'vitest';
import { steel, UnknownGradeError } from '../src/index';

describe('steel / Baustahl (DE default)', () => {
  it('exposes characteristic values (EN 1993-1-1 Table 3.1)', () => {
    const s = steel('S355');
    expect(s.fyk).toBe(355);
    expect(s.fuk).toBe(490);
    expect(s.Es).toBe(210000);
    expect(s.gamma).toBe(77);
    expect(s.density).toBe(7850);
  });

  it('fyd uses γM0 = 1.0 → fyd = fyk', () => {
    expect(steel('S355').fyd).toBe(355);
  });

  it('uses the German γM1 = 1.1 for stability checks', () => {
    // 355 / 1.1 = 322.727…
    expect(steel('S355').designValues({ resistance: 'M1' }).fyd).toBeCloseTo(
      322.727,
      3,
    );
  });

  it('fud uses γM2 = 1.25', () => {
    // 490 / 1.25 = 392
    expect(steel('S355').designValues({ resistance: 'M2' }).fud).toBe(392);
  });

  it('selects reduced strengths for thickness > 40 mm', () => {
    const s = steel('S355', { thickness: 50 });
    expect(s.fyk).toBe(335);
    expect(s.fyd).toBe(335);
  });

  it('throws for an unknown grade', () => {
    expect(() => steel('S999' as never)).toThrow(UnknownGradeError);
  });
});
