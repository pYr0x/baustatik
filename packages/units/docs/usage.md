# @baustatik/units Usage
Location: `packages/units`

## Overview
Unit conversion and parsing library for structural engineering. Supports Length, Area, Volume, Force, Mass, and derived units like Linear and Surface loads.

## API Reference

### convert()
**Signature:** `function convert(value: number): ConvertChain`
**Description:** Entry point for the unit conversion API. Throws `InvalidValueError` if the value is not a finite number.
**Example:**
```typescript
import { convert } from '@baustatik/units';

const result = convert(10).from('m').to('cm'); // 1000
```

### ConvertChain.from()
**Signature:** `from(unit: string): FromChain`
**Description:** Sets the source unit. The unit string is resolved against supported aliases (e.g., 'm', 'meter', 'm²').
**Example:**
```typescript
convert(1).from('kN');
```

### FromChain.to()
**Signature:** `to(unit: string): number`
**Description:** Converts the value to the target unit and applies category-specific rounding. This is the **report-facing** variant and the default.
**Example:**
```typescript
convert(2.5).from('MN/m²').to('N/mm²'); // 2.5
```

### FromChain.toExact()
**Signature:** `toExact(unit: string): number`
**Description:** The same conversion **without any rounding** — the variant for calculation chains. Compatibility is checked exactly as in `to()`.

> ⚠️ **Use `toExact` whenever the result is calculated with, not printed.**
> `to()` rounds to whole millimetres (and mm², mm³, mm⁴). That is correct for a
> printed value and wrong for a centroid or a stress-point coordinate.

**Example:**
```typescript
convert(139.5).from('mm').to('m');      // 0.14    ← atomically rounded
convert(139.5).from('mm').toExact('m'); // 0.1395

convert(6.9).from('mm').to('m');        // 0.007
convert(6.9).from('mm').toExact('m');   // 0.0069
```

Typical use — pull the factor once at module level, so its provenance stays in
the code and no regex runs per value:

```typescript
const CM4_TO_M4 = convert(1).from('cm^4').toExact('m^4'); // 1e-8
```

### Quantity types
**Description:** Phantom-branded numbers that document a unit at the call site.
At runtime each is a plain `number`; the brand is **optional**, so a bare
`number` assigns freely and arithmetic works without unwrapping. This documents
units — it does **not** enforce them.

```typescript
import type { mm, cm2, cm4, MPa } from '@baustatik/units';

type Beam = { h: mm; A: cm2; Iy: cm4; E: MPa };
```

Available: `mm`, `cm`, `m`, `mm2`, `cm2`, `m2`, `mm3`, `cm3`, `m3`, `mm4`,
`cm4`, `m4`, `MPa`, `KNm3`, `Kgm3`, `PerK`, `PerMille`, `Percent`, and the
generic `Quantity<U>`.

## Supported Units

The library supports ASCII (`^2`) and Unicode (`²`) superscripts. For example, `m^2` and `m²` are equivalent.

### Categorized Units

You can only convert between units within the same category (except for Mass and Force, see below).

| Category | Units | Rounding Logic |
| :--- | :--- | :--- |
| **Length** | `mm`, `cm`, `dm`, `m`, `km` | **Atomic**: Increments relative to `mm`. |
| **Area** | `mm²`, `cm²`, `dm²`, `m²`, `km²` | **Atomic**: Increments relative to `mm²`. |
| **Volume** | `mm³`, `cm³`, `m³`, `ml`, `l` | **Atomic**: Increments relative to `mm³`. |
| **Moment of Inertia** | `mm⁴`, `cm⁴`, `dm⁴`, `m⁴` | **Atomic**: Increments relative to `mm⁴`. |
| **Mass** | `g`, `kg`, `t` | **Atomic**: Increments relative to `g`. |
| **Force** | `N`, `kN`, `MN` | **Atomic**: Increments relative to `N`. |
| **Force per Length** | `N/m`, `N/cm`, `N/mm`, `kN/m`, `kN/cm`, `kN/mm`, `MN/m`, `MN/cm`, `MN/mm` | **Smart**: Professional rounding to significant digits. |
| **Force per Area** | `N/m²`, `N/cm²`, `N/mm²`, `kN/m²`, `kN/cm²`, `kN/mm²`, `MN/m²`, `MN/cm²`, `MN/mm²` | **Smart**: Professional rounding to significant digits. |

## Special Conversions

### Mass and Force (Gravity)
The library automatically handles conversions between Mass (`kg`, `t`) and Force (`N`, `kN`, `MN`) using standard gravity ($g = 9.81 m/s^2$).

**Example:**
```typescript
convert(100).from('kg').to('kN'); // 0.981
convert(1).from('kN').to('kg');   // 101.937
```

## Error Handling

All errors in this package extend `BaustatikError` from `@baustatik/errors`.

### BaustatikError
Base class for all library errors. Catch this if you want to handle any error produced by the conversion logic.

### IncompatibleUnitsError
Thrown when attempting to convert between different physical categories (e.g., Length to Mass) that are not covered by special gravity logic.
```typescript
try {
  convert(10).from('m').to('kg');
} catch (e) {
  // Handle incompatibility
}
```

### UnknownUnitError
Thrown when a unit alias cannot be resolved.

### InvalidValueError
Thrown if the input to `convert()` is not a finite number (`NaN` or `Infinity`).
