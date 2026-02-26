# @baustatik/errors Usage
Location: `packages/errors`

## Overview
Base error hierarchy for the Baustatik ecosystem. All library-specific errors should extend the `BaustatikError` class.

## API Reference

### BaustatikError
**Signature:** `class BaustatikError extends Error`
**Description:** The base class for all errors thrown by `@baustatik/*` packages. It automatically sets the `name` property to the constructor name.
**Example:**
```typescript
import { BaustatikError } from '@baustatik/errors';

try {
  // Call some library function
} catch (e) {
  if (e instanceof BaustatikError) {
    console.error(`Library error: ${e.message}`);
  }
}
```

## Extending BaustatikError
When creating a new package, use `BaustatikError` as the base class for your custom errors to ensure they can be caught globally.

**Example:**
```typescript
import { BaustatikError } from '@baustatik/errors';

export class MyCustomError extends BaustatikError {
  constructor(detail: string) {
    super(`My custom error occurred: ${detail}`);
  }
}
```
