# @baustatik/units

Unit conversion and parsing library for structural engineering with precision guarantees.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/@baustatik/units)](https://www.npmjs.com/package/@baustatik/units)

## About

`@baustatik/units` is a specialized unit conversion library designed for engineering applications. It provides a fluent, type-safe API for converting between common units in structural analysis, with a focus on precision and engineering-standard rounding.

Unlike generic conversion libraries, `@baustatik/units` implements **Atomic Rounding** for core physical quantities, ensuring that results don't exceed the resolution of the smallest meaningful measurement (e.g., 1mm for length or 1g for mass).

## Features

- **Fluent API**: Highly readable `convert(10).from('m').to('cm')` syntax.
- **Physical Quantities**: Supports Length, Area, Volume, Moment of Inertia, Mass, Force, Linear Loads, and Surface Loads.
- **Mass-Force Integration**: Automatic conversion between Mass (kg/t) and Force (N/kN) using gravity ($g = 9.81 m/s^2$).
- **Intelligent Rounding**:
  - **Atomic Rounding**: Automatic rounding based on base units for consistent engineering results.
  - **Smart Rounding**: Utilizes legacy-compatible smart rounding for derived units.
- **Unicode Support**: Recognize units like `m²`, `m³`, `m⁴` alongside ASCII equivalents like `m^2`.
- **Zero Dependencies**: Lightweight and fast (aside from workspace internal rounding logic).

## Installation

```bash
pnpm add @baustatik/units
```

## Usage

### Basic Conversions

```typescript
import { convert } from '@baustatik/units';

// Length
convert(5).from('m').to('cm'); // 500

// Area
convert(1).from('m²').to('cm²'); // 10000

// Force
convert(2.5).from('kN').to('N'); // 2500
```

### Mass to Force (and vice versa)

The library handles the physical conversion between Mass and Force using $g = 9.81$.

```typescript
// Mass to Force (kN)
convert(100).from('kg').to('kN'); // 0.981

// Force to Mass (kg)
convert(1).from('kN').to('kg'); // 101.937
```

### Complex Units

Supports linear and surface loads common in structural analysis.

```typescript
// Force per Length (Linear Load)
convert(10).from('kN/m').to('N/mm'); // 10

// Force per Area (Pressure/Stress)
convert(20).from('MN/m²').to('N/mm²'); // 20
```

## Supported Units

| Category | Base Unit | Supported Units |
| :--- | :--- | :--- |
| **Length** | mm | `mm`, `cm`, `dm`, `m`, `km` |
| **Area** | mm² | `mm^2` (`mm²`), `cm^2`, `dm^2`, `m^2`, `km^2` |
| **Volume** | mm³ | `mm^3` (`mm³`), `cm^3`, `m^3`, `ml`, `l` |
| **Inertia** | mm⁴ | `mm^4` (`mm⁴`), `cm^4`, `dm^4`, `m^4` |
| **Mass** | g | `g`, `kg`, `t` |
| **Force** | N | `N`, `kN`, `MN` |
| **Linear Load** | N/mm | `N/m`, `N/cm`, `N/mm`, `kN/m`, `kN/cm`, `kN/mm`, `MN/m`, ... |
| **Surface Load** | N/mm² | `N/m^2`, `N/cm^2`, `N/mm^2`, `kN/m^2`, `kN/cm^2`, `kN/mm^2`, ... |

## Precision & Rounding

To prevent floating point artifacts and ensure engineering realism, this library uses two rounding strategies:

1.  **Atomic Rounding**: For primary units (Length, Area, Mass, Force), it rounds to the nearest "atomic" increment (e.g., 1mm).
2.  **Smart Rounding**: For derived units or specific conversions (like Force to Mass), it uses a multi-stage rounding process to keep the result mathematically robust.

## Error Handling

The library throws specific errors for invalid operations:

- `IncompatibleUnitsError`: When trying to convert between different categories (e.g., `m` to `kg`).
- `UnknownUnitError`: When an invalid unit string is provided.
- `InvalidValueError`: When provided with `NaN` or `Infinity`.

```typescript
import { IncompatibleUnitsError } from '@baustatik/units';

try {
  convert(10).from('m').to('kg');
} catch (e) {
  if (e instanceof IncompatibleUnitsError) {
    console.error('Cannot convert length to mass!');
  }
}
```

## Development

### Running Tests

This package uses `vitest` for testing.

```bash
pnpm test
```

## License

@baustatik/units is licensed under the MIT license.
