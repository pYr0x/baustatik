# @baustatik/round Usage
Location: `packages/round`

## Overview
Atomic and smart numeric rounding for engineering applications with a focus on structural analysis. It provides a fluent API to handle complex rounding logic, magnitude-aware "smart" precision, and unit-driven "atomic" rounding.

## API Reference

### round()
**Signature:** `function round(value: number): RoundChain`
**Description:** Entry point for the fluent rounding API. Returns a chainable object providing various rounding methods.
**Example:**
```typescript
import { round } from '@baustatik/round';

const base = round(1.2345);
base.toDecimals(2);      // 1.23
base.toSignificant(2);   // 1.2
base.toInteger();        // 1
base.smart();            // 1.235 (magnitude based)
```

### RoundChain.toDecimals()
**Signature:** `toDecimals(n: number): number`
**Description:** Rounds the value to a fixed number of decimal places.
**Example:**
```typescript
round(1.255).toDecimals(2); // 1.26
```

### RoundChain.toSignificant()
**Signature:** `toSignificant(n: number): number`
**Description:** Rounds the value to a set number of significant figures.
**Example:**
```typescript
round(0.001333).toSignificant(2); // 0.0013
```

### RoundChain.toInteger()
**Signature:** `toInteger(): number`
**Description:** Rounds the value to the nearest integer.
**Example:**
```typescript
round(1.5).toInteger(); // 2
```

### RoundChain.smart()
**Signature:** `smart(options?: SmartOptions): number`
**Description:** Automatically adjusts decimal places based on the value's magnitude.
**Example:**
```typescript
round(1333.333).smart(); // 1333.33
round(1.33333).smart();  // 1.333
```

### RoundChain.atomic()
**Signature:** `atomic(targetToBase: number, atomicToBase: number): number`
**Description:** Rounds to a specific "atomic" step relative to a base unit (e.g., nearest mm in m).
**Example:**
```typescript
// Rounding 1.2555m to the nearest mm (1/1000m)
round(1.25551).atomic(1, 0.001); // 1.256
```

## Types

### SmartOptions
```typescript
interface SmartOptions {
  sigDigits?: number;    // Number of significant digits to target
  minDecimals?: number;  // Minimum number of decimals to keep
}
```
