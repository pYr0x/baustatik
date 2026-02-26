import { describe, it, expect } from 'vitest'
import { round } from './round'

// ============================================================
// toDecimals
// ============================================================

describe('toDecimals', () => {
    it('should round to n decimal places', () => {
        expect(round(1.2555).toDecimals(2)).toBe(1.26)
        expect(round(1.2555).toDecimals(3)).toBe(1.256)
        expect(round(1.2555).toDecimals(4)).toBe(1.2555)
        expect(round(1.2555).toDecimals(0)).toBe(1)
        expect(round(1.5).toDecimals(0)).toBe(2)
    })

    it('should handle 0', () => {
        expect(round(0).toDecimals(2)).toBe(0)
    })

    it('should handle negative values', () => {
        expect(round(-1.2555).toDecimals(2)).toBe(-1.26)
        expect(round(-1.5).toDecimals(0)).toBe(-1)
    })

    it('should handle large values', () => {
        expect(round(1333.3333).toDecimals(2)).toBe(1333.33)
        expect(round(1000000.789).toDecimals(1)).toBe(1000000.8)
    })

    it('should handle small values', () => {
        expect(round(0.001333).toDecimals(4)).toBe(0.0013)
        expect(round(0.001333).toDecimals(6)).toBe(0.001333)
    })

    it('should return original value on negative decimal places', () => {
        expect(round(1.5).toDecimals(-1)).toBe(1.5)
    })
})

// ============================================================
// toSignificant
// ============================================================

describe('toSignificant', () => {
    it('should round large values', () => {
        expect(round(1333.333).toSignificant(4)).toBe(1333)
        expect(round(1333.333).toSignificant(5)).toBe(1333.3)
        expect(round(1333.333).toSignificant(6)).toBe(1333.33)
    })

    it('should round values between 1 and 100', () => {
        expect(round(12.555).toSignificant(3)).toBe(12.6)
        expect(round(12.555).toSignificant(4)).toBe(12.56)
        expect(round(1.33333).toSignificant(4)).toBe(1.333)
    })

    it('should round values < 1', () => {
        expect(round(0.001333).toSignificant(4)).toBe(0.001333)
        expect(round(0.001333).toSignificant(3)).toBe(0.00133)
        expect(round(0.001333).toSignificant(2)).toBe(0.0013)
        expect(round(0.001333).toSignificant(1)).toBe(0.001)
    })

    it('should handle 0', () => {
        expect(round(0).toSignificant(4)).toBe(0)
    })

    it('should handle negative values', () => {
        expect(round(-1333.333).toSignificant(4)).toBe(-1333)
        expect(round(-0.001333).toSignificant(3)).toBe(-0.00133)
    })

    it('should return original value on n < 1', () => {
        expect(round(1.5).toSignificant(0)).toBe(1.5)
        expect(round(1.5).toSignificant(-1)).toBe(1.5)
    })
})

// ============================================================
// toInteger
// ============================================================

describe('toInteger', () => {
    it('should round to nearest integer', () => {
        expect(round(1.4).toInteger()).toBe(1)
        expect(round(1.5).toInteger()).toBe(2)
        expect(round(1.6).toInteger()).toBe(2)
        expect(round(0).toInteger()).toBe(0)
    })

    it('should handle negative values', () => {
        expect(round(-1.5).toInteger()).toBe(-1)
        expect(round(-1.6).toInteger()).toBe(-2)
    })

    it('should handle already integer values', () => {
        expect(round(42).toInteger()).toBe(42)
        expect(round(-42).toInteger()).toBe(-42)
    })
})

// ============================================================
// smart
// ============================================================

describe('smart', () => {
    it('should round values >= 1000 to 2 decimal places', () => {
        expect(round(1333.333333).smart()).toBe(1333.33)
        expect(round(1567.8999).smart()).toBe(1567.9)
        expect(round(13333.33333).smart()).toBe(13333.33)
    })

    it('should round values >= 100 to 2 decimal places', () => {
        expect(round(133.333).smart()).toBe(133.33)
        expect(round(125.551).smart()).toBe(125.55)
    })

    it('should round values >= 10 to 2 decimal places', () => {
        expect(round(12.555123).smart()).toBe(12.56)
        expect(round(15.38456).smart()).toBe(15.38)
        expect(round(33.3333).smart()).toBe(33.33)
    })

    it('should round values >= 1 to 3 decimal places', () => {
        expect(round(1.33333).smart()).toBe(1.333)
        expect(round(1.25551).smart()).toBe(1.256)
        expect(round(6.66241).smart()).toBe(6.662)
    })

    it('should round values < 1 with enough decimals', () => {
        expect(round(0.3333333).smart()).toBe(0.3333)
        expect(round(0.1234567).smart()).toBe(0.1235)
        expect(round(0.013333).smart()).toBe(0.01333)
        expect(round(0.001333333).smart()).toBe(0.001333)
        expect(round(0.0001333333).smart()).toBe(0.0001333)
        expect(round(0.00003333333).smart()).toBe(0.00003333)
        expect(round(0.000001333333).smart()).toBe(0.000001333)
        expect(round(0.0000003333333).smart()).toBe(0.0000003333)
    })

    it('should handle 0 and integers', () => {
        expect(round(0).smart()).toBe(0)
        expect(round(100).smart()).toBe(100)
        expect(round(1000000).smart()).toBe(1000000)
        expect(round(-42).smart()).toBe(-42)
    })

    it('should not round exact decimals', () => {
        expect(round(0.5).smart()).toBe(0.5)
        expect(round(0.001).smart()).toBe(0.001)
        expect(round(12.5).smart()).toBe(12.5)
        expect(round(0.000001).smart()).toBe(0.000001)
    })

    it('should handle negative values', () => {
        expect(round(-1.33333).smart()).toBe(-1.333)
        expect(round(-0.001333).smart()).toBe(-0.001333)
        expect(round(-1333.333).smart()).toBe(-1333.33)
    })

    it('should handle floating point edge cases', () => {
        expect(round(0.30000000000000004).smart()).toBe(0.3)
        expect(round(0.3333333333333333).smart()).toBe(0.3333)
    })

    it('should accept custom sigDigits', () => {
        expect(round(1.33333).smart({ sigDigits: 6 })).toBe(1.33333)
        expect(round(1.33333).smart({ sigDigits: 2 })).toBe(1.33)
    })

    it('should accept custom minDecimals', () => {
        expect(round(1333.33).smart({ minDecimals: 0 })).toBe(1333)
        expect(round(1333.33).smart({ minDecimals: 3 })).toBe(1333.33)
    })
})

// ============================================================
// atomic
// ============================================================

describe('atomic', () => {

    it('should return 0 for 0', () => {
        expect(round(0).atomic(1000, 1)).toBe(0)
    })

    it('should return exact values unchanged', () => {
        expect(round(100).atomic(10, 1)).toBe(100)
        expect(round(0.5).atomic(10, 1)).toBe(0.5)
        expect(round(0.001).atomic(1000, 1)).toBe(0.001)
    })

    it('should round length via mm', () => {
        // 1.2555 m → 1255.5 mm → 1256 mm → zurück
        expect(round(1255.5123).atomic(1, 1)).toBe(1256)
        expect(round(125.55123).atomic(10, 1)).toBe(125.6)
        expect(round(12.555123).atomic(100, 1)).toBe(12.56)
        expect(round(1.2555123).atomic(1000, 1)).toBe(1.256)
        expect(round(0.0012555).atomic(1_000_000, 1)).toBe(0.001256)
    })

    it('should round area via mm^2', () => {
        // 1.333333 m^2 = 1_333_333 mm^2 (exakt)
        expect(round(13333.33).atomic(100, 1)).toBe(13333.33)
        expect(round(1.333333).atomic(1_000_000, 1)).toBe(1.333333)

        // 1.33333377 m^2 = 1_333_333.77 mm^2 → 1_333_334
        expect(round(13333.3377).atomic(100, 1)).toBe(13333.34)
        expect(round(1.33333377).atomic(1_000_000, 1)).toBe(1.333334)
    })

    it('should round force via N', () => {
        expect(round(1567.899).atomic(1, 1)).toBe(1568)
        expect(round(1.567899).atomic(1000, 1)).toBe(1.568)
        expect(round(0.001567899).atomic(1_000_000, 1)).toBe(0.001568)
    })

    it('should round mass via g', () => {
        expect(round(1567.8).atomic(1, 1)).toBe(1568)
        expect(round(1.5678).atomic(1000, 1)).toBe(1.568)
        expect(round(678.9).atomic(1, 1)).toBe(679)
        expect(round(0.6789).atomic(1000, 1)).toBe(0.679)
    })

    it('should round force-to-mass via g', () => {
        expect(round(101.9368).atomic(1, 1)).toBe(102)
        expect(round(0.1019368).atomic(1000, 1)).toBe(0.102)
        expect(round(0.0001019368).atomic(1_000_000, 1)).toBe(0.000102)
    })

    it('should round moment of inertia via mm^4', () => {
        expect(round(1.55555).atomic(10_000, 1)).toBe(1.5556)
        expect(round(1.5).atomic(10_000, 1)).toBe(1.5)
    })

    it('should round volume via mm^3', () => {
        // 2.56789 m^3 → 2_567_890_000 mm^3 → exakt
        // → l: 2_567_890_000 / 1_000_000 = 2567.89
        expect(round(2567.89).atomic(1_000_000, 1)).toBe(2567.89)
    })

    it('should handle negative values', () => {
        expect(round(-1.2555).atomic(1000, 1)).toBe(-1.256)
        expect(round(-101.9368).atomic(1, 1)).toBe(-102)
        expect(round(-0.1019368).atomic(1000, 1)).toBe(-0.102)
    })
})

describe('round hardening edge cases', () => {
    it('should return NaN for NaN input in smart rounding', () => {
        expect(round(NaN).smart()).toBeNaN();
    });

    it('should return original value for atomic rounding with 0 target (preventing Infinity)', () => {
        expect(round(100).atomic(0, 1)).toBe(100);
    });

    it('should handle undefined input to toInteger safely', () => {
        expect(round(undefined as any).toInteger()).toBeNaN();
    });

    it('should return Infinity for Infinity input in decimal rounding', () => {
        expect(round(Infinity).toDecimals(2)).toBe(Infinity);
    });

    it('should return 0 for 0 input', () => {
        expect(round(0).toDecimals(2)).toBe(0);
        expect(round(0).toSignificant(2)).toBe(0);
        expect(round(0).smart()).toBe(0);
        expect(round(0).atomic(1, 1)).toBe(0);
    });

    it('should handle large factors safely (limit decimal places)', () => {
        // This expects the implementation to cap at 15
        expect(round(1.1234567890123456789).toDecimals(20)).toBeCloseTo(1.123456789012346, 15);
    });
});