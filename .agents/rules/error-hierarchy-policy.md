---
trigger: always_on
---

# Baustatik error hierarchy policy

Documented in full in [`CODING_STANDARDS.md`](../../CODING_STANDARDS.md),
section *3. Errors and the three failure channels*.

1. Every library error extends `BaustatikError` from `@baustatik/errors`, not
   the native `Error`.
2. Names end in `Error` and describe the rule that was broken.
3. A package that defines errors declares `@baustatik/errors` in its
   `dependencies`.
4. Call `super(message)`; never assign `this.name` — `BaustatikError` sets it
   from `this.constructor.name`.
5. Carry the affected ids as `readonly` fields, not only in the message text:
   validation results are returned, and the surface highlights the element
   from those fields.

```typescript
import { BaustatikError } from '@baustatik/errors';

export class SpecificError extends BaustatikError {
  readonly beamId: string;

  constructor(beamId: string) {
    super(`Stab "${beamId}": …`);
    this.beamId = beamId;
  }
}
```
