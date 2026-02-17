import { describe, expect, it } from 'vitest';
import { resolveUnit } from './parse';

describe('resolveUnit', () => {
  // ============================================================
  // Einfache Einheiten
  // ============================================================

  it('should resolve simple length units', () => {
    expect(resolveUnit('mm')).toBe('mm');
    expect(resolveUnit('cm')).toBe('cm');
    expect(resolveUnit('dm')).toBe('dm');
    expect(resolveUnit('m')).toBe('m');
    expect(resolveUnit('km')).toBe('km');
  });

  it('should resolve simple mass units', () => {
    expect(resolveUnit('g')).toBe('g');
    expect(resolveUnit('kg')).toBe('kg');
    expect(resolveUnit('t')).toBe('t');
  });

  it('should resolve simple force units', () => {
    expect(resolveUnit('N')).toBe('N');
    expect(resolveUnit('kN')).toBe('kN');
    expect(resolveUnit('MN')).toBe('MN');
  });

  it('should resolve volume helper units', () => {
    expect(resolveUnit('l')).toBe('l');
    expect(resolveUnit('ml')).toBe('ml');
  });

  // ============================================================
  // Fläche, Volumen, Trägheitsmoment
  // ============================================================

  it('should resolve area units', () => {
    expect(resolveUnit('mm^2')).toBe('mm^2');
    expect(resolveUnit('cm^2')).toBe('cm^2');
    expect(resolveUnit('dm^2')).toBe('dm^2');
    expect(resolveUnit('m^2')).toBe('m^2');
    expect(resolveUnit('km^2')).toBe('km^2');
  });

  it('should resolve volume units', () => {
    expect(resolveUnit('mm^3')).toBe('mm^3');
    expect(resolveUnit('cm^3')).toBe('cm^3');
    expect(resolveUnit('m^3')).toBe('m^3');
  });

  it('should resolve moment of inertia units', () => {
    expect(resolveUnit('mm^4')).toBe('mm^4');
    expect(resolveUnit('cm^4')).toBe('cm^4');
    expect(resolveUnit('dm^4')).toBe('dm^4');
    expect(resolveUnit('m^4')).toBe('m^4');
  });

  // ============================================================
  // Kraft / Länge
  // ============================================================

  it('should resolve force per length units', () => {
    expect(resolveUnit('N/m')).toBe('N/m');
    expect(resolveUnit('N/cm')).toBe('N/cm');
    expect(resolveUnit('N/mm')).toBe('N/mm');
    expect(resolveUnit('kN/m')).toBe('kN/m');
    expect(resolveUnit('kN/cm')).toBe('kN/cm');
    expect(resolveUnit('kN/mm')).toBe('kN/mm');
    expect(resolveUnit('MN/m')).toBe('MN/m');
    expect(resolveUnit('MN/cm')).toBe('MN/cm');
    expect(resolveUnit('MN/mm')).toBe('MN/mm');
  });

  // ============================================================
  // Kraft / Fläche
  // ============================================================

  it('should resolve force per area units (^2 notation)', () => {
    expect(resolveUnit('N/m^2')).toBe('N/m^2');
    expect(resolveUnit('N/cm^2')).toBe('N/cm^2');
    expect(resolveUnit('N/mm^2')).toBe('N/mm^2');
    expect(resolveUnit('kN/m^2')).toBe('kN/m^2');
    expect(resolveUnit('kN/cm^2')).toBe('kN/cm^2');
    expect(resolveUnit('kN/mm^2')).toBe('kN/mm^2');
    expect(resolveUnit('MN/m^2')).toBe('MN/m^2');
    expect(resolveUnit('MN/cm^2')).toBe('MN/cm^2');
    expect(resolveUnit('MN/mm^2')).toBe('MN/mm^2');
  });

  // ============================================================
  // Unicode → ^-Notation normalisieren
  // ============================================================

  it('should normalize unicode ² to ^2', () => {
    expect(resolveUnit('m²')).toBe('m^2');
    expect(resolveUnit('cm²')).toBe('cm^2');
    expect(resolveUnit('mm²')).toBe('mm^2');
    expect(resolveUnit('N/m²')).toBe('N/m^2');
    expect(resolveUnit('N/cm²')).toBe('N/cm^2');
    expect(resolveUnit('N/mm²')).toBe('N/mm^2');
    expect(resolveUnit('kN/m²')).toBe('kN/m^2');
    expect(resolveUnit('kN/cm²')).toBe('kN/cm^2');
    expect(resolveUnit('kN/mm²')).toBe('kN/mm^2');
    expect(resolveUnit('MN/m²')).toBe('MN/m^2');
    expect(resolveUnit('MN/cm²')).toBe('MN/cm^2');
    expect(resolveUnit('MN/mm²')).toBe('MN/mm^2');
  });

  it('should normalize unicode ³ to ^3', () => {
    expect(resolveUnit('m³')).toBe('m^3');
    expect(resolveUnit('cm³')).toBe('cm^3');
    expect(resolveUnit('mm³')).toBe('mm^3');
  });

  it('should normalize unicode ⁴ to ^4', () => {
    expect(resolveUnit('mm⁴')).toBe('mm^4');
    expect(resolveUnit('cm⁴')).toBe('cm^4');
    expect(resolveUnit('dm⁴')).toBe('dm^4');
    expect(resolveUnit('m⁴')).toBe('m^4');
  });

  // ============================================================
  // Whitespace
  // ============================================================

  it('should trim whitespace', () => {
    expect(resolveUnit('  m  ')).toBe('m');
    expect(resolveUnit(' kN/m^2 ')).toBe('kN/m^2');
    expect(resolveUnit('  mm^2  ')).toBe('mm^2');
    expect(resolveUnit(' N/mm² ')).toBe('N/mm^2');
  });

  // ============================================================
  // Errors: Nicht-String
  // ============================================================

  it('should throw on non-string input', () => {
    expect(() => resolveUnit(123 as any)).toThrow();
    expect(() => resolveUnit(null as any)).toThrow();
    expect(() => resolveUnit(undefined as any)).toThrow();
    expect(() => resolveUnit({} as any)).toThrow();
    expect(() => resolveUnit(true as any)).toThrow();
  });

  // ============================================================
  // Errors: Leer
  // ============================================================

  it('should throw on empty or whitespace-only string', () => {
    expect(() => resolveUnit('')).toThrow();
    expect(() => resolveUnit('   ')).toThrow();
  });

  // ============================================================
  // Errors: Malformed
  // ============================================================

  it('should throw on malformed unit strings', () => {
    expect(() => resolveUnit('!!!')).toThrow();
    expect(() => resolveUnit('###')).toThrow();
    expect(() => resolveUnit('N//mm^2')).toThrow();
    expect(() => resolveUnit('m^')).toThrow();
    expect(() => resolveUnit('kN/m^')).toThrow();
    expect(() => resolveUnit('MN/m^2^3')).toThrow();
    expect(() => resolveUnit('/')).toThrow();
    expect(() => resolveUnit('kN/')).toThrow();
    expect(() => resolveUnit('/mm^2')).toThrow();
  });

  // ============================================================
  // Errors: Unbekannte Einheiten
  // ============================================================

  it('should throw on unknown units', () => {
    expect(() => resolveUnit('banana')).toThrow();
    expect(() => resolveUnit('kW')).toThrow();
    expect(() => resolveUnit('Pa')).toThrow();
    expect(() => resolveUnit('J')).toThrow();
    expect(() => resolveUnit('foo/bar')).toThrow();
    expect(() => resolveUnit('N/banana')).toThrow();
    expect(() => resolveUnit('banana/m^2')).toThrow();
  });

  // ============================================================
  // Errors: Nicht unterstützte Potenzen
  // ============================================================

  it('should throw on unsupported powers', () => {
    expect(() => resolveUnit('m^5')).toThrow();
    expect(() => resolveUnit('cm^6')).toThrow();
    expect(() => resolveUnit('m^0')).toThrow();
  });
});
