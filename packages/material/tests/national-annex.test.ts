import { describe, expect, it } from 'vitest';
import { createMaterials, type NationalAnnexParams } from '../src/index';

describe('National Annex binding', () => {
  it('EN-recommended values differ from the German Annex', () => {
    const en = createMaterials({ na: 'EN' });
    // EN αcc = 1.0 → fcd = 30 / 1.5 = 20.0 (vs. 17.0 for DE)
    expect(en.concrete('C30/37').fcd).toBe(20.0);
    // EN γM1 = 1.0 → fyd = fyk (vs. /1.1 for DE)
    expect(en.steel('S355').designValues({ resistance: 'M1' }).fyd).toBe(355);
  });

  it('the DE and EN factories are independent (no shared global state)', () => {
    const de = createMaterials({ na: 'DE' });
    const en = createMaterials({ na: 'EN' });
    expect(de.concrete('C30/37').fcd).toBe(17.0);
    expect(en.concrete('C30/37').fcd).toBe(20.0);
    // Re-reading DE is unaffected by having created EN:
    expect(de.concrete('C30/37').fcd).toBe(17.0);
  });

  it('accepts a full custom National Annex parameter object', () => {
    const custom: NationalAnnexParams = {
      id: 'CUSTOM',
      concrete: {
        alphaCc: 0.9,
        alphaCt: 0.9,
        gammaC: { persistent: 1.4, accidental: 1.2 },
      },
      reinforcement: { gammaS: { persistent: 1.1, accidental: 1.0 } },
      steel: { gammaM: { M0: 1.0, M1: 1.05, M2: 1.2 } },
      timber: { gammaM: { timber: 1.3, glulam: 1.25 }, gammaMAccidental: 1.0 },
    };
    const m = createMaterials({ na: custom });
    // 0.9 · 30 / 1.4 = 19.2857…
    expect(m.concrete('C30/37').fcd).toBeCloseTo(19.2857, 4);
    expect(m.na.id).toBe('CUSTOM');
  });

  it('throws for an unknown built-in Annex id', () => {
    expect(() => createMaterials({ na: 'FR' as never })).toThrow();
  });
});
