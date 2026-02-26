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
**Description:** Converts the value to the target unit and applies category-specific rounding.
**Example:**
```typescript
convert(2.5).from('MN/m²').to('N/mm²'); // 2.5
```

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
