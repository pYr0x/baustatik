import { describe, expect, it } from 'vitest';
import { convert } from './convert';

// ============================================================
// Basis-Umrechnungen (ganzzahlige Eingaben)
// ============================================================

describe('length conversions', () => {
  it('should convert length units from big to small', () => {
    expect(convert(1).from('m').to('cm')).toBe(100);
    expect(convert(1).from('dm').to('cm')).toBe(10);
  });

  it('should convert length units from small to big', () => {
    expect(convert(1).from('mm').to('m')).toBe(0.001);
    expect(convert(1).from('mm').to('km')).toBe(0.000001);
    expect(convert(1).from('cm').to('dm')).toBe(0.1);
    expect(convert(1).from('cm').to('m')).toBe(0.01);
    expect(convert(1).from('cm').to('km')).toBe(0.00001);
  });
});

describe('area conversions', () => {
  it('should convert area units from big to small', () => {
    expect(convert(1).from('m^2').to('cm^2')).toBe(10000);
    expect(convert(1).from('m^2').to('mm^2')).toBe(1_000_000);
  });

  it('should convert area units from small to big', () => {
    expect(convert(1).from('cm^2').to('m^2')).toBe(0.0001);
    expect(convert(1).from('mm^2').to('m^2')).toBe(0.000001);
  });
});

describe('volume conversions', () => {
  it('should convert volume units from big to small', () => {
    expect(convert(1).from('m^3').to('cm^3')).toBe(1_000_000);
    expect(convert(1).from('m^3').to('m^3')).toBe(1);
  });

  it('should convert volume units from small to big', () => {
    expect(convert(1).from('cm^3').to('m^3')).toBe(0.000001);
    expect(convert(1).from('mm^3').to('m^3')).toBe(0.000000001);
    expect(convert(1).from('l').to('m^3')).toBe(0.001);
    expect(convert(1).from('ml').to('l')).toBe(0.001);
  });
});

describe('mass conversions', () => {
  it('should convert mass units', () => {
    expect(convert(1).from('kg').to('g')).toBe(1000);
    expect(convert(1).from('kg').to('t')).toBe(0.001);
    expect(convert(1).from('t').to('g')).toBe(1_000_000);
  });
});

describe('force conversions', () => {
  it('should convert force units from big to small', () => {
    expect(convert(1).from('MN').to('N')).toBe(1000000);
    expect(convert(1).from('MN').to('kN')).toBe(1000);
    expect(convert(1).from('kN').to('N')).toBe(1000);
  });

  it('should convert force units from small to big', () => {
    expect(convert(1).from('N').to('kN')).toBe(0.001);
    expect(convert(1).from('N').to('MN')).toBe(0.000001);
    expect(convert(1).from('kN').to('MN')).toBe(0.001);
  });

  it('should convert between mass and force units', () => {
    expect(convert(1).from('g').to('N')).toBe(0.00981);
    expect(convert(1).from('kg').to('N')).toBe(9.81);
    expect(convert(1).from('t').to('N')).toBe(9810);
    expect(convert(1).from('N').to('g')).toBe(102);
    expect(convert(1).from('MN').to('g')).toBe(101936799);
    expect(convert(1).from('N').to('kg')).toBe(0.102);
    expect(convert(1).from('N').to('t')).toBe(0.000102);
  });
});

// ============================================================
// Kraft / Länge
// ============================================================

describe('force per length conversions', () => {
  it('should convert force per length units from big to small', () => {
    // Basis MN/m
    expect(convert(1).from('MN/m').to('MN/cm')).toBe(0.01);
    expect(convert(1).from('MN/m').to('MN/mm')).toBe(0.001);

    // Basis MN/cm
    expect(convert(1).from('MN/cm').to('MN/mm')).toBe(0.1);

    // Basis kN/m
    expect(convert(1).from('kN/m').to('MN/m')).toBe(0.001);
    expect(convert(1).from('kN/m').to('MN/cm')).toBe(0.00001);
    expect(convert(1).from('kN/m').to('MN/mm')).toBe(0.000001);
    expect(convert(1).from('kN/m').to('kN/cm')).toBe(0.01);
    expect(convert(1).from('kN/m').to('kN/mm')).toBe(0.001);

    // Basis kN/cm
    expect(convert(1).from('kN/cm').to('MN/m')).toBe(0.1);
    expect(convert(1).from('kN/cm').to('MN/cm')).toBe(0.001);
    expect(convert(1).from('kN/cm').to('MN/mm')).toBe(0.0001);
    expect(convert(1).from('kN/cm').to('kN/mm')).toBe(0.1);

    // Basis N/m
    expect(convert(1).from('N/m').to('MN/m')).toBe(0.000001);
    expect(convert(1).from('N/m').to('kN/m')).toBe(0.001);
    expect(convert(1).from('N/m').to('N/cm')).toBe(0.01);
    expect(convert(1).from('N/m').to('N/mm')).toBe(0.001);

    // Basis N/cm
    expect(convert(1).from('N/cm').to('kN/cm')).toBe(0.001);
    expect(convert(1).from('N/cm').to('N/mm')).toBe(0.1);
  });

  it('should convert force per length units from small to big', () => {
    // Basis MN/m
    expect(convert(1).from('MN/m').to('kN/m')).toBe(1000);
    expect(convert(1).from('MN/m').to('kN/cm')).toBe(10);
    expect(convert(1).from('MN/m').to('N/m')).toBe(1000000);
    expect(convert(1).from('MN/m').to('N/cm')).toBe(10000);
    expect(convert(1).from('MN/m').to('N/mm')).toBe(1000);

    // Basis MN/cm
    expect(convert(1).from('MN/cm').to('MN/m')).toBe(100);
    expect(convert(1).from('MN/cm').to('kN/m')).toBe(100000);
    expect(convert(1).from('MN/cm').to('kN/cm')).toBe(1000);

    // Basis MN/mm
    expect(convert(1).from('MN/mm').to('MN/m')).toBe(1000);
    expect(convert(1).from('MN/mm').to('MN/cm')).toBe(10);
    expect(convert(1).from('MN/mm').to('kN/mm')).toBe(1000);

    // Basis kN/m
    expect(convert(1).from('kN/m').to('N/m')).toBe(1000);
    expect(convert(1).from('kN/m').to('N/cm')).toBe(10);

    // Basis kN/cm
    expect(convert(1).from('kN/cm').to('kN/m')).toBe(100);
    expect(convert(1).from('kN/cm').to('N/m')).toBe(100000);

    // Basis N/cm
    expect(convert(1).from('N/cm').to('N/m')).toBe(100);

    // Basis N/mm
    expect(convert(1).from('N/mm').to('N/m')).toBe(1000);
    expect(convert(1).from('N/mm').to('N/cm')).toBe(10);

    // Grenzfälle (Wert = 1)
    expect(convert(1).from('MN/m').to('kN/mm')).toBe(1);
    expect(convert(1).from('kN/m').to('N/mm')).toBe(1);
  });
});

// ============================================================
// Kraft / Fläche (Spannung)
// ============================================================

describe('force per area conversions', () => {
  it('should convert force per area units from big to small', () => {
    // Basis MN/m²
    expect(convert(1).from('MN/m²').to('MN/cm²')).toBe(0.0001);
    expect(convert(1).from('MN/m²').to('MN/mm²')).toBe(0.000001);
    expect(convert(1).from('MN/m²').to('kN/cm²')).toBe(0.1);
    expect(convert(1).from('MN/m²').to('kN/mm²')).toBe(0.001);

    // Basis MN/cm²
    expect(convert(1).from('MN/cm²').to('MN/mm²')).toBe(0.01);

    // Basis kN/m²
    expect(convert(1).from('kN/m²').to('MN/m²')).toBe(0.001);
    expect(convert(1).from('kN/m²').to('MN/cm²')).toBe(0.0000001);
    expect(convert(1).from('kN/m²').to('MN/mm²')).toBe(1e-9);
    expect(convert(1).from('kN/m²').to('kN/cm²')).toBe(0.0001);
    expect(convert(1).from('kN/m²').to('kN/mm²')).toBe(0.000001);
    expect(convert(1).from('kN/m²').to('N/cm²')).toBe(0.1);
    expect(convert(1).from('kN/m²').to('N/mm²')).toBe(0.001);

    // Basis kN/cm²
    expect(convert(1).from('kN/cm²').to('MN/cm²')).toBe(0.001);
    expect(convert(1).from('kN/cm²').to('MN/mm²')).toBe(0.00001);
    expect(convert(1).from('kN/cm²').to('kN/mm²')).toBe(0.01);

    // Basis kN/mm²
    expect(convert(1).from('kN/mm²').to('MN/cm²')).toBe(0.1);
    expect(convert(1).from('kN/mm²').to('MN/mm²')).toBe(0.001);

    // Basis N/m²
    expect(convert(1).from('N/m²').to('MN/m²')).toBe(0.000001);
    expect(convert(1).from('N/m²').to('MN/cm²')).toBe(1e-10);
    expect(convert(1).from('N/m²').to('MN/mm²')).toBe(1e-12);
    expect(convert(1).from('N/m²').to('kN/m²')).toBe(0.001);
    expect(convert(1).from('N/m²').to('kN/cm²')).toBe(0.0000001);
    expect(convert(1).from('N/m²').to('kN/mm²')).toBe(1e-9);
    expect(convert(1).from('N/m²').to('N/cm²')).toBe(0.0001);
    expect(convert(1).from('N/m²').to('N/mm²')).toBe(0.000001);

    // Basis N/cm²
    expect(convert(1).from('N/cm²').to('MN/m²')).toBe(0.01);
    expect(convert(1).from('N/cm²').to('MN/cm²')).toBe(0.000001);
    expect(convert(1).from('N/cm²').to('MN/mm²')).toBe(0.00000001);
    expect(convert(1).from('N/cm²').to('kN/cm²')).toBe(0.001);
    expect(convert(1).from('N/cm²').to('kN/mm²')).toBe(0.00001);
    expect(convert(1).from('N/cm²').to('N/mm²')).toBe(0.01);
  });

  it('should convert force per area units from small to big', () => {
    // Basis MN/m²
    expect(convert(1).from('MN/m²').to('kN/m²')).toBe(1000);
    expect(convert(1).from('MN/m²').to('N/m²')).toBe(1000000);
    expect(convert(1).from('MN/m²').to('N/cm²')).toBe(100);
    expect(convert(1).from('MN/m²').to('N/mm²')).toBe(1);

    // Basis MN/cm²
    expect(convert(1).from('MN/cm²').to('MN/m²')).toBe(10000);
    expect(convert(1).from('MN/cm²').to('kN/m²')).toBe(10000000);
    expect(convert(1).from('MN/cm²').to('kN/cm²')).toBe(1000);
    expect(convert(1).from('MN/cm²').to('kN/mm²')).toBe(10);
    expect(convert(1).from('MN/cm²').to('N/m²')).toBe(1e10);
    expect(convert(1).from('MN/cm²').to('N/cm²')).toBe(1000000);
    expect(convert(1).from('MN/cm²').to('N/mm²')).toBe(10000);

    // Basis MN/mm²
    expect(convert(1).from('MN/mm²').to('MN/m²')).toBe(1000000);
    expect(convert(1).from('MN/mm²').to('MN/cm²')).toBe(100);
    expect(convert(1).from('MN/mm²').to('kN/m²')).toBe(1000000000);
    expect(convert(1).from('MN/mm²').to('kN/cm²')).toBe(100000);
    expect(convert(1).from('MN/mm²').to('kN/mm²')).toBe(1000);
    expect(convert(1).from('MN/mm²').to('N/cm²')).toBe(100000000);

    // Basis kN/m²
    expect(convert(1).from('kN/m²').to('N/m²')).toBe(1000);

    // Basis kN/cm²
    expect(convert(1).from('kN/cm²').to('MN/m²')).toBe(10);
    expect(convert(1).from('kN/cm²').to('kN/m²')).toBe(10000);
    expect(convert(1).from('kN/cm²').to('N/m²')).toBe(10000000);
    expect(convert(1).from('kN/cm²').to('N/cm²')).toBe(1000);
    expect(convert(1).from('kN/cm²').to('N/mm²')).toBe(10);

    // Basis N/cm²
    expect(convert(1).from('N/cm²').to('kN/m²')).toBe(10);
    expect(convert(1).from('N/cm²').to('N/m²')).toBe(10000);
  });
});

// ============================================================
// Signifikante Stellen / Rundung
// ============================================================

describe('significant digits / rounding', () => {
  // ============ Länge: atomicRound (mm) ============

  it('should round length via atomic unit mm', () => {
    expect(convert(1.2555123456).from('m').to('km')).toBe(0.001256);
    expect(convert(1.2555123456).from('m').to('m')).toBe(1.256);
    expect(convert(1.2555123456).from('m').to('dm')).toBe(12.56);
    expect(convert(1.2555123456).from('m').to('cm')).toBe(125.6);
    expect(convert(1.2555123456).from('m').to('mm')).toBe(1256);
  });

  // ============ Fläche: atomicRound (mm^2) ============

  it('should round area via atomic unit mm^2', () => {
    expect(convert(1.333333).from('m^2').to('cm^2')).toBe(13333.33);
    expect(convert(1.333333).from('m^2').to('dm^2')).toBe(133.3333);
    expect(convert(1.333333).from('cm^2').to('m^2')).toBe(0.000133);
    expect(convert(1.33333377).from('m^2').to('m^2')).toBe(1.333334);
    expect(convert(1.33333377).from('m^2').to('cm^2')).toBe(13333.34);
  });

  // ============ Volumen: atomicRound (mm^3) ============

  it('should round volume via atomic unit mm^3', () => {
    expect(convert(2.56789).from('m^3').to('l')).toBe(2567.89);
  });

  // ============ Kraft: atomicRound (N) ============

  it('should round force via atomic unit N', () => {
    expect(convert(1.5678999999).from('kN').to('N')).toBe(1568);
    expect(convert(1.5678999999).from('kN').to('kN')).toBe(1.568);
    expect(convert(1.5678999999).from('kN').to('MN')).toBe(0.001568);
  });

  // ============ Masse: atomicRound (g) ============

  it('should round mass via atomic unit g', () => {
    expect(convert(1.5678).from('kg').to('g')).toBe(1568);
    expect(convert(1.5678).from('kg').to('kg')).toBe(1.568);
    expect(convert(1.5678).from('kg').to('t')).toBe(0.001568);
  });

  // ============ Masse → Kraft: smartRound ============

  it('should use smartRound for mass-to-force (clean × 9.81)', () => {
    expect(convert(1).from('g').to('N')).toBe(0.00981);
    expect(convert(1).from('kg').to('N')).toBe(9.81);
    expect(convert(1).from('t').to('N')).toBe(9810);
    expect(convert(1.5678).from('kg').to('N')).toBe(15.38);
  });

  // ============ Kraft → Masse: atomicRound (g) ============

  it('should round force-to-mass via atomic unit g', () => {
    expect(convert(1).from('N').to('g')).toBe(102);
    expect(convert(1).from('N').to('kg')).toBe(0.102);
    expect(convert(1).from('N').to('t')).toBe(0.000102);
  });

  // ============ Kraft/Länge: smartRound ============

  it('should use smartRound for force/length (no atomic unit)', () => {
    expect(convert(1.333333).from('MN/m').to('kN/m')).toBe(1333.33);
    expect(convert(1.333333).from('MN/m').to('MN/cm')).toBe(0.01333);
    expect(convert(1.333333).from('MN/m').to('MN/mm')).toBe(0.001333);
    expect(convert(1.333333).from('MN/m').to('kN/mm')).toBe(1.333);
  });

  // ============ Kraft/Fläche: smartRound ============

  it('should use smartRound for force/area (no atomic unit)', () => {
    expect(convert(1.333333).from('MN/m^2').to('kN/m^2')).toBe(1333.33);
    expect(convert(1.333333).from('MN/m^2').to('N/mm^2')).toBe(1.333);
    expect(convert(1.333333).from('MN/m^2').to('MN/cm^2')).toBe(0.0001333);
    expect(convert(1.333333).from('MN/m^2').to('MN/mm^2')).toBe(0.000001333);
    expect(convert(1.333333).from('MN/m^2').to('kN/mm^2')).toBe(0.001333);
    expect(convert(1.333333).from('MN/m^2').to('N/cm^2')).toBe(133.33);
  });

  // ============ Eingabe < 1 ============

  it('should round length correctly (input < 1)', () => {
    expect(convert(0.125).from('m').to('km')).toBe(0.000125);
    expect(convert(0.125).from('m').to('cm')).toBe(12.5);
    expect(convert(0.125).from('m').to('mm')).toBe(125);
  });

  it('should round force/area correctly (input < 1)', () => {
    expect(convert(0.333333).from('MN/m^2').to('kN/m^2')).toBe(333.33);
    expect(convert(0.333333).from('MN/m^2').to('N/mm^2')).toBe(0.3333);
    expect(convert(0.333333).from('MN/m^2').to('N/cm^2')).toBe(33.33);
    expect(convert(0.333333).from('MN/m^2').to('MN/cm^2')).toBe(0.00003333);
    expect(convert(0.333333).from('MN/m^2').to('MN/mm^2')).toBe(0.0000003333);
  });

  it('should round force-to-mass correctly (input < 1)', () => {
    expect(convert(0.6789).from('kg').to('N')).toBe(6.66);
    expect(convert(0.6789).from('kg').to('g')).toBe(679);
    expect(convert(0.6789).from('kg').to('t')).toBe(0.000679);
  });

  // ============ Exakte Werte ============

  it('should keep exact values exact', () => {
    expect(convert(1).from('mm').to('m')).toBe(0.001);
    expect(convert(1).from('m').to('cm')).toBe(100);
    expect(convert(1).from('km').to('m')).toBe(1000);
    expect(convert(1).from('MN/m^2').to('N/mm^2')).toBe(1);
    expect(convert(1).from('kN/m').to('N/mm')).toBe(1);
  });
});

// ============================================================
// Error Handling
// ============================================================

describe('error handling', () => {
  it('should throw when converting between incompatible unit types', () => {
    // Kraft/Länge → Kraft/Fläche
    expect(() => convert(1).from('MN/m').to('N/mm^2')).toThrow();
    expect(() => convert(1).from('kN/m').to('kN/m^2')).toThrow();

    // Länge → Volumen
    expect(() => convert(1).from('m').to('l')).toThrow();
    expect(() => convert(1).from('cm').to('ml')).toThrow();

    // Länge → Fläche
    expect(() => convert(1).from('m').to('m^2')).toThrow();
    expect(() => convert(1).from('mm').to('cm^2')).toThrow();

    // Fläche → Volumen
    expect(() => convert(1).from('m^2').to('m^3')).toThrow();

    // Kraft → Länge
    expect(() => convert(1).from('kN').to('m')).toThrow();
    expect(() => convert(1).from('N').to('mm')).toThrow();

    // Kraft/Fläche → Kraft/Länge
    expect(() => convert(1).from('N/mm^2').to('N/mm')).toThrow();

    // Kraft/Fläche → Länge
    expect(() => convert(1).from('N/mm^2').to('m')).toThrow();
  });

  it('should throw when input value is not a finite number', () => {
    expect(() =>
      convert('abc' as any)
        .from('m')
        .to('cm'),
    ).toThrow();
    expect(() =>
      convert('10' as any)
        .from('m')
        .to('cm'),
    ).toThrow();
    expect(() => convert(NaN).from('m').to('cm')).toThrow();
    expect(() => convert(Infinity).from('m').to('cm')).toThrow();
    expect(() => convert(-Infinity).from('m').to('cm')).toThrow();
    expect(() =>
      convert(undefined as any)
        .from('m')
        .to('cm'),
    ).toThrow();
    expect(() =>
      convert(null as any)
        .from('m')
        .to('cm'),
    ).toThrow();
    expect(() =>
      convert(true as any)
        .from('m')
        .to('cm'),
    ).toThrow();
    expect(() =>
      convert({} as any)
        .from('m')
        .to('cm'),
    ).toThrow();
  });

  it('should throw when unit is not supported', () => {
    expect(() =>
      convert(1)
        .from('banana' as any)
        .to('cm'),
    ).toThrow();
    expect(() =>
      convert(1)
        .from('m')
        .to('banana' as any),
    ).toThrow();
    expect(() =>
      convert(1)
        .from('kW' as any)
        .to('W' as any),
    ).toThrow();
    expect(() =>
      convert(1)
        .from('Pa' as any)
        .to('kPa' as any),
    ).toThrow();
    expect(() =>
      convert(1)
        .from('J' as any)
        .to('kJ' as any),
    ).toThrow();
    expect(() =>
      convert(1)
        .from('foo' as any)
        .to('bar' as any),
    ).toThrow();
  });

  it('should throw when unit string is malformed or unparseable', () => {
    expect(() =>
      convert(1)
        .from('' as any)
        .to('cm'),
    ).toThrow();
    expect(() =>
      convert(1)
        .from('m')
        .to('' as any),
    ).toThrow();
    expect(() =>
      convert(1)
        .from('!!!' as any)
        .to('cm'),
    ).toThrow();
    expect(() =>
      convert(1)
        .from('m')
        .to('###' as any),
    ).toThrow();
    expect(() =>
      convert(1)
        .from('N//mm^2' as any)
        .to('N/mm^2'),
    ).toThrow();
    expect(() =>
      convert(1)
        .from('N/mm^2')
        .to('N//mm^2' as any),
    ).toThrow();
    expect(() =>
      convert(1)
        .from('kN/m^' as any)
        .to('N/m'),
    ).toThrow();
    expect(() =>
      convert(1)
        .from('MN/m^2^3' as any)
        .to('N/m^2'),
    ).toThrow();
    expect(() =>
      convert(1)
        .from(123 as any)
        .to('cm'),
    ).toThrow();
    expect(() =>
      convert(1)
        .from('m')
        .to(123 as any),
    ).toThrow();
    expect(() =>
      convert(1)
        .from(null as any)
        .to('cm'),
    ).toThrow();
    expect(() =>
      convert(1)
        .from('m')
        .to(null as any),
    ).toThrow();
    expect(() =>
      convert(1)
        .from(undefined as any)
        .to('cm'),
    ).toThrow();
    expect(() =>
      convert(1)
        .from('m')
        .to(undefined as any),
    ).toThrow();
  });

  it('should allow mass <-> force conversion (special case)', () => {
    expect(() => convert(1).from('kg').to('N')).not.toThrow();
    expect(() => convert(1).from('N').to('kg')).not.toThrow();
    expect(() => convert(1).from('kg').to('m')).toThrow();
    expect(() => convert(1).from('t').to('cm')).toThrow();
  });
});
