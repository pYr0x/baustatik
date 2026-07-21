# @baustatik/core Usage
Location: `packages/core`

## Overview
Core utility functions, custom error classes, and mathematical angle conversions used across the `@baustatik` codebase.

## API Reference

### AssertionError
**Signature:** `class AssertionError extends BaustatikError`
**Description:** A specialized error class representing an assertion failure or an internal guard violation. It inherits from `BaustatikError` in the `@baustatik/errors` package.
**Example:**
```typescript
import { AssertionError } from '@baustatik/core';

throw new AssertionError('An internal precondition was violated.');
```

### at() / atOrThrow()
**Signature:** `function at<T>(arr: T[], i: number): T`
**Description:** Assertion-guarded array element accessor. Returns the element at index `i` of array `arr`. If the element is `undefined`, it throws an `AssertionError`. This function acts as a compiler type assertion guard to safely narrow array accesses from `T | undefined` to `T` without using forbidden non-null assertions (`!`).
**Example:**
```typescript
import { atOrThrow } from '@baustatik/core';

const items = ['first', 'second', 'third'];
const second = atOrThrow(items, 1); // returns 'second'

// Throws AssertionError: at(5): Index außerhalb des Arrays
const outOfBounds = atOrThrow(items, 5);
```

### degToRad()
**Signature:** `function degToRad(deg: number): number`
**Description:** Converts a given angle in degrees to radians.
**Example:**
```typescript
import { degToRad } from '@baustatik/core';

const rad = degToRad(90); // returns Math.PI / 2 (~1.57079)
```

### radToDeg()
**Signature:** `function radToDeg(rad: number): number`
**Description:** Converts a given angle in radians to degrees.
**Example:**
```typescript
import { radToDeg } from '@baustatik/core';

const deg = radToDeg(Math.PI); // returns 180
```
