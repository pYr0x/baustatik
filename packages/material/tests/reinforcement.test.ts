import { describe, expect, it } from 'vitest';
import { reinforcement, UnknownGradeError } from '../src/index';

describe('reinforcement / Betonstahl (DE default)', () => {
  it('exposes characteristic values with corrected ftk', () => {
    const r = reinforcement('B500B');
    expect(r.ductility).toBe('B');
    expect(r.fyk).toBe(500);
    expect(r.ftk).toBe(540);
    expect(r.Es).toBe(200000);
    expect(r.gamma).toBe(77);
    expect(r.density).toBe(7850);
  });

  it('corrects the erroneous seed ftk for class A (525, not 805)', () => {
    expect(reinforcement('B500A').ftk).toBe(525);
  });

  it('fyd uses γs = 1.15 for the persistent situation', () => {
    // 500 / 1.15 = 434.782…
    expect(reinforcement('B500B').fyd).toBeCloseTo(434.783, 3);
  });

  it('uses γs = 1.0 for the accidental situation', () => {
    expect(
      reinforcement('B500B').designValues({ situation: 'accidental' }).fyd,
    ).toBe(500);
  });

  it('throws for an unknown grade', () => {
    expect(() => reinforcement('B999' as never)).toThrow(UnknownGradeError);
  });
});
