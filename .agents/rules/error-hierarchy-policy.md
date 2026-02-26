---
trigger: always_on
---

# Baustatik Error Hierarchy Policy

All custom error classes within the `@baustatik` monorepo must adhere to the central error hierarchy:

1.  **Base Class**: Every library-specific error must extend `BaustatikError` from the `@baustatik/errors` package. Do not extend the native `Error` class directly for public-facing API errors.
2.  **Naming**: Error classes should have descriptive names ending in `Error` (e.g., `InvalidValueError`, `IncompatibleUnitsError`).
3.  **Dependency**: Any package that implements custom errors must include `@baustatik/errors` in its `dependencies`.
4.  **Implementation**:
    *   Initialize using `super(message)`.
    *   Do not manually set `this.name`, as `BaustatikError` handles this automatically using `this.constructor.name`.

**Example Pattern:**
```typescript
import { BaustatikError } from '@baustatik/errors';

export class SpecificError extends BaustatikError {
  constructor(details: string) {
    super(`Contextual message: ${details}`);
  }
}
```
