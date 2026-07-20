import { describe, expect, it } from 'vitest';
import { concrete, UnknownGradeError } from '../src/index';

describe('concrete (DE default)', () => {
  it('exposes characteristic values from EN 1992-1-1 Table 3.1', () => {
    const c = concrete('C30/37');
    expect(c.grade).toBe('C30/37');
    expect(c.fck).toBe(30);
    expect(c.fcm).toBe(38);
    expect(c.fctm).toBe(2.9);
    expect(c.fctk05).toBe(2.0);
    expect(c.Ecm).toBe(33000);
    expect(c.nu).toBe(0.2);
  });

  it('computes fcd with the German αcc = 0.85 (not the EN 1.0)', () => {
    // fcd = αcc · fck / γc = 0.85 · 30 / 1.5 = 17.0
    expect(concrete('C30/37').fcd).toBe(17.0);
  });

  it('uses γc = 1.2 for the accidental design situation', () => {
    // 0.85 · 30 / 1.2 = 21.25
    expect(
      concrete('C30/37').designValues({ situation: 'accidental' }).fcd,
    ).toBe(21.25);
  });

  it('computes fctd = αct · fctk05 / γc', () => {
    // 0.85 · 2.0 / 1.5 = 1.13333…
    expect(concrete('C30/37').designValues().fctd).toBeCloseTo(1.13333, 4);
  });

  it('defaults to reinforced unit weight 25 kN/m³, plain is 24', () => {
    expect(concrete('C30/37').gamma).toBe(25);
    expect(concrete('C30/37', { reinforced: false }).gamma).toBe(24);
  });

  it('exposes density (2500 reinforced / 2400 plain kg/m³)', () => {
    expect(concrete('C30/37').density).toBe(2500);
    expect(concrete('C30/37', { reinforced: false }).density).toBe(2400);
  });

  it('accepts tolerant input (trim, case, incl. the whole grade range)', () => {
    expect(concrete('  c30/37 ').fck).toBe(30);
    expect(concrete('C12/15').fck).toBe(12);
    expect(concrete('C90/105').fck).toBe(90);
  });

  it('throws UnknownGradeError for an unknown grade', () => {
    expect(() => concrete('C33/40' as never)).toThrow(UnknownGradeError);
  });

  it('returns a frozen object', () => {
    expect(Object.isFrozen(concrete('C30/37'))).toBe(true);
  });
});
