# @baustatik/round

Atomic and smart numeric rounding for engineering applications with a focus on structural analysis.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Build Status](https://img.shields.io/github/actions/workflow/status/baustatik/baustatik/ci.yml)](https://github.com/baustatik/baustatik/actions)
[![npm version](https://img.shields.io/npm/v/@baustatik/round)](https://www.npmjs.com/package/@baustatik/round)

## About

`@baustatik/round` is a specialized numeric rounding library tailored for structural engineering and technical applications. Common rounding methods often fall short when dealing with the high-precision requirements and unit-specific conventions of technical data. This library provides a type-safe, fluent API to handle complex rounding logic—ranging from magnitude-aware "smart" precision to unit-driven "atomic" rounding.

## Features

- **Fluent API**: Highly readable syntax via `round(value).to...()`.
- **Smart Rounding**: Automatically adjusts decimal places based on the value's magnitude (e.g., higher precision for values $<1$, standard precision for values $>1000$).
- **Significant Digits**: Round to a set number of significant figures regardless of the decimal point position.
- **Atomic Rounding**: Precise rounding based on base-unit factors (e.g., "round to the nearest millimeter while working in meters").
- **Robustness**: Built-in guards for `NaN`, `Infinity`, and invalid inputs. Designed with a **no-throw guarantee** for production stability.

## Installation

```bash
npm install @baustatik/round
# or
pnpm add @baustatik/round
```

### Requirements

- Node.js >= 18
- TypeScript (optional, but recommended)

## Usage

The library centers around the `round()` function which returns a chainable object.

```typescript
import { round } from '@baustatik/round';

// Basic rounding
round(1.2555).toDecimals(2);   // 1.26
round(1.5).toInteger();        // 2

// Significant digits
round(0.001333).toSignificant(2); // 0.0013

// Smart rounding (Automatic precision based on magnitude)
round(1333.333).smart(); // 1333.33 (2 decimals)
round(1.33333).smart();  // 1.333 (3 decimals)

// Atomic rounding (Round to nearest base unit)
// Scenario: Round a value in meters to the nearest millimeter.
// targetToBase: 1000 (mm to m conversion factor)
round(1.2555123).atomic(1000, 1); // 1.256
```

### Advanced Smart Options

You can customize the "smart" strategy behavior:

```typescript
round(1.33333).smart({ sigDigits: 2 }); // 1.33
round(1333.33).smart({ minDecimals: 0 }); // 1333
```

## Safety & Hardening

This library is designed for mission-critical engineering applications where a crash due to invalid data is unacceptable. 

- **No-Throw Guarantee**: Functions will never throw errors on invalid input. Instead, they return `NaN`, `Infinity`, or the original value as appropriate.
- **Input Sanitization**: The `round()` entry point internally handles non-numeric types (e.g., from untrusted UI inputs) by treating them as `NaN`.
- **Floating Point Stability**: Atomic rounding uses high-precision normalization to minimize binary floating-point errors.

## Contributing

Contributions are welcome! This package is part of the [baustatik](https://github.com/baustatik/baustatik) monorepo.

### Development Setup

```bash
# From the monorepo root
pnpm install
cd packages/round

# Running tests
pnpm test

# Building
pnpm build
```

## License

`@baustatik/round` is licensed under the MIT license. See the [`LICENSE`](../../LICENSE) file for more information.
