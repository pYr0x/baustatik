---
trigger: always_on
---

Error handling in this monorepo — which of the four failure channels applies,
and why `!` is replaced by `atOrThrow` — is documented in
[`CODING_STANDARDS.md`](../../CODING_STANDARDS.md), section
*3. Errors and the three failure channels*.

The short version:

- Broken precondition → **throw** a named error class.
- Valid input, but this component does not know the answer and the port's type
  says so → return **`undefined`**.
- Batch validation → return **`{ errors, warnings }`**.
- Valid input, empty result, low-level utility in a loop → return a **safe
  value** (`[]`, `null`, the input as-is).

Index arrays with `atOrThrow(arr, i)` from `@baustatik/core`. Non-null
assertions (`!`) are not used in `src/`.
