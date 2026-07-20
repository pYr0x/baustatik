import { describe, expect, it } from 'vitest';
import {
  DesignValueRequiresContextError,
  timber,
  UnknownGradeError,
} from '../src/index';

describe('timber / Holz (DE default)', () => {
  it('exposes characteristic values (EN 338)', () => {
    const t = timber('C24');
    expect(t.grade).toBe('C24');
    expect(t.product).toBe('timber');
    expect(t.fmk).toBe(24);
    expect(t.ft0k).toBe(14.5);
    expect(t.rhok).toBe(350);
  });

  it('computes fmd = kmod · fmk / γM (solid timber γM = 1.3)', () => {
    // permanent / SC1 → kmod = 0.6; 0.6 · 24 / 1.3 = 11.0769…
    const dv = timber('C24').designValues({
      loadDuration: 'permanent',
      serviceClass: 'SC1',
    });
    expect(dv.kmod).toBe(0.6);
    expect(dv.gammaM).toBe(1.3);
    expect(dv.fmd).toBeCloseTo(11.0769, 4);
  });

  it('uses γM = 1.0 for the accidental situation', () => {
    const dv = timber('C24').designValues({
      loadDuration: 'permanent',
      serviceClass: 'SC1',
      situation: 'accidental',
    });
    expect(dv.gammaM).toBe(1.0);
    expect(dv.fmd).toBeCloseTo(14.4, 5);
  });

  it('uses γM = 1.25 for glulam', () => {
    const dv = timber('GL24h').designValues({
      loadDuration: 'permanent',
      serviceClass: 'SC1',
    });
    expect(dv.gammaM).toBe(1.25);
    expect(dv.fmd).toBeCloseTo(11.52, 5);
  });

  it('picks the reduced kmod for service class 3', () => {
    const dv = timber('C24').designValues({
      loadDuration: 'permanent',
      serviceClass: 'SC3',
    });
    expect(dv.kmod).toBe(0.5);
  });

  it('has no bare fmd — reading it at runtime throws', () => {
    const t = timber('C24');
    // Type-level: `t.fmd` is a compile error. Runtime guard for untyped JS:
    expect(() => (t as unknown as { fmd: number }).fmd).toThrow(
      DesignValueRequiresContextError,
    );
  });

  it('throws for an unknown grade', () => {
    expect(() => timber('C99' as never)).toThrow(UnknownGradeError);
  });
});
