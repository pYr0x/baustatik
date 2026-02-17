import { describe, expect, it } from 'vitest';
import { atomicRound, smartRound } from './round';

// ============================================================
// smartRound (für force_per_length, force_per_area, Masse→Kraft)
// ============================================================

describe('smartRound', () => {
  it('should return 0 for 0', () => {
    expect(smartRound(0)).toBe(0);
  });

  it('should not round exact integers', () => {
    expect(smartRound(1)).toBe(1);
    expect(smartRound(100)).toBe(100);
    expect(smartRound(1000000)).toBe(1000000);
    expect(smartRound(-42)).toBe(-42);
  });

  it('should not round exact decimals', () => {
    expect(smartRound(0.5)).toBe(0.5);
    expect(smartRound(0.001)).toBe(0.001);
    expect(smartRound(12.5)).toBe(12.5);
    expect(smartRound(0.000001)).toBe(0.000001);
  });

  it('should round values >= 1000 to 2 decimal places', () => {
    expect(smartRound(1333.333333)).toBe(1333.33);
    expect(smartRound(1567.8999)).toBe(1567.9);
    expect(smartRound(13333.33333)).toBe(13333.33);
  });

  it('should round values >= 100 to 2 decimal places', () => {
    expect(smartRound(133.3333)).toBe(133.33);
    expect(smartRound(125.55123)).toBe(125.55);
  });

  it('should round values >= 10 to 2 decimal places', () => {
    expect(smartRound(12.555123)).toBe(12.56);
    expect(smartRound(15.38456)).toBe(15.38);
    expect(smartRound(33.3333)).toBe(33.33);
  });

  it('should round values >= 1 to 3 decimal places', () => {
    expect(smartRound(1.333333)).toBe(1.333);
    expect(smartRound(1.255512)).toBe(1.256);
    expect(smartRound(6.662409)).toBe(6.662);
  });

  it('should round values in 0.1..0.99 range', () => {
    expect(smartRound(0.3333333)).toBe(0.3333);
    expect(smartRound(0.1234567)).toBe(0.1235);
  });

  it('should round values in 0.01..0.099 range', () => {
    expect(smartRound(0.013333)).toBe(0.01333);
    expect(smartRound(0.012556)).toBe(0.01256);
  });

  it('should round values in 0.001..0.0099 range', () => {
    expect(smartRound(0.001333333)).toBe(0.001333);
    expect(smartRound(0.001567899)).toBe(0.001568);
  });

  it('should round values in 0.0001..0.00099 range', () => {
    expect(smartRound(0.0001333333)).toBe(0.0001333);
    expect(smartRound(0.0003333333)).toBe(0.0003333);
  });

  it('should round very small values', () => {
    expect(smartRound(0.00003333333)).toBe(0.00003333);
    expect(smartRound(0.000001333333)).toBe(0.000001333);
    expect(smartRound(0.0000003333333)).toBe(0.0000003333);
  });

  it('should round negative values the same way', () => {
    expect(smartRound(-1.333333)).toBe(-1.333);
    expect(smartRound(-0.001333333)).toBe(-0.001333);
    expect(smartRound(-1333.333333)).toBe(-1333.33);
  });

  it('should handle floating point edge cases', () => {
    expect(smartRound(0.30000000000000004)).toBe(0.3);
    expect(smartRound(0.3333333333333333)).toBe(0.3333);
  });
});

// ============================================================
// atomicRound (für length, area, volume, mass, force, Kraft→Masse)
// ============================================================

describe('atomicRound', () => {
  // ---- Grundverhalten ----

  it('should return 0 for 0', () => {
    expect(atomicRound(0, 1, 1)).toBe(0);
  });

  it('should return exact values unchanged', () => {
    // 100 cm, target=cm(10), atomic=mm(1) → 1000mm → 1000 → 100cm
    expect(atomicRound(100, 10, 1)).toBe(100);
    // 1000 mm, target=mm(1), atomic=mm(1) → 1000 → 1000
    expect(atomicRound(1000, 1, 1)).toBe(1000);
  });

  // ---- Länge: atomar mm ----

  it('should round length via mm', () => {
    // 1.2555123456 m → mm: 1255.5123 → 1256mm
    // 1256mm → m: 1.256
    expect(atomicRound(1.2555123456, 1000, 1)).toBe(1.256);
    // 1256mm → cm: 125.6
    expect(atomicRound(125.55123456, 10, 1)).toBe(125.6);
    // 1256mm → dm: 12.56
    expect(atomicRound(12.555123456, 100, 1)).toBe(12.56);
    // 1256mm → km: 0.001256
    expect(atomicRound(0.0012555123456, 1_000_000, 1)).toBe(0.001256);
    // 1256mm → mm: 1256
    expect(atomicRound(1255.5123456, 1, 1)).toBe(1256);
  });

  it('should handle exact length values', () => {
    // 1 m = 1000mm → exakt
    expect(atomicRound(1, 1000, 1)).toBe(1);
    // 0.5 cm = 5mm → exakt
    expect(atomicRound(0.5, 10, 1)).toBe(0.5);
    // 0.001 m = 1mm → exakt
    expect(atomicRound(0.001, 1000, 1)).toBe(0.001);
  });

  // ---- Fläche: atomar mm^2 ----

  it('should round area via mm^2', () => {
    // 1.333333 m^2 → mm^2: 1_333_333mm^2
    // → cm^2: 1_333_333 / 100 = 13333.33
    expect(atomicRound(13333.33, 100, 1)).toBe(13333.33);
    // → dm^2: 1_333_333 / 10_000 = 133.3333
    expect(atomicRound(133.3333, 10_000, 1)).toBe(133.3333);
    // → m^2: 1_333_333 / 1_000_000 = 1.333333
    expect(atomicRound(1.333333, 1_000_000, 1)).toBe(1.333333);
  });

  it('should round area with actual rounding needed', () => {
    // 1.33333377 m^2 → 1_333_333.77 mm^2 → 1_333_334 mm^2
    // → m^2: 1.333334
    expect(atomicRound(1.33333377, 1_000_000, 1)).toBe(1.333334);
    // → cm^2: 13333.34
    expect(atomicRound(13333.3377, 100, 1)).toBe(13333.34);
  });

  // ---- Kraft: atomar N ----

  it('should round force via N', () => {
    // 1.5678999999 kN → 1567.8999999 N → 1568 N
    // → N: 1568
    expect(atomicRound(1567.8999999, 1, 1)).toBe(1568);
    // → kN: 1.568
    expect(atomicRound(1.5678999999, 1000, 1)).toBe(1.568);
    // → MN: 0.001568
    expect(atomicRound(0.0015678999999, 1_000_000, 1)).toBe(0.001568);
  });

  // ---- Masse: atomar g ----

  it('should round mass via g', () => {
    // 1.5678 kg → 1567.8 g → 1568 g
    // → g: 1568
    expect(atomicRound(1567.8, 1, 1)).toBe(1568);
    // → kg: 1.568
    expect(atomicRound(1.5678, 1000, 1)).toBe(1.568);
    // → t: 0.001568
    expect(atomicRound(0.0015678, 1_000_000, 1)).toBe(0.001568);
  });

  // ---- Kraft → Masse: atomar g ----

  it('should round force-to-mass conversion via g', () => {
    // 1 N → g: 101.9368... → 102 g
    expect(atomicRound(101.9368, 1, 1)).toBe(102);
    // 1 N → kg: 0.1019368... → 102g → 0.102 kg
    expect(atomicRound(0.1019368, 1000, 1)).toBe(0.102);
    // 1 N → t: 0.0001019368... → 102g → 0.000102 t
    expect(atomicRound(0.0001019368, 1_000_000, 1)).toBe(0.000102);
  });

  // ---- Volumen: atomar mm^3 ----

  it('should round volume via mm^3', () => {
    // 2.56789 m^3 → 2_567_890_000 mm^3 → exakt
    // → l: 2_567_890_000 / 1_000_000 = 2567.89
    expect(atomicRound(2567.89, 1_000_000, 1)).toBe(2567.89);
  });

  // ---- Trägheitsmoment: atomar mm^4 ----

  it('should round moment of inertia via mm^4', () => {
    // 1.5 cm^4 → 15000 mm^4 → exakt
    // → cm^4: 15000 / 10000 = 1.5
    expect(atomicRound(1.5, 10_000, 1)).toBe(1.5);
    // 1.55555 cm^4 → 15555.5 mm^4 → 15556 mm^4
    // → cm^4: 15556 / 10000 = 1.5556
    expect(atomicRound(1.55555, 10_000, 1)).toBe(1.5556);
  });

  // ---- Negative Werte ----

  it('should handle negative values', () => {
    expect(atomicRound(-1.2555, 1000, 1)).toBe(-1.256);
    expect(atomicRound(-101.9368, 1, 1)).toBe(-102);
  });
});
