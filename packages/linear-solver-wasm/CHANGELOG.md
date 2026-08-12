# @baustatik/linear-solver-wasm

## 0.0.1

### Patch Changes

- 1fda9e0: One factorization, many right-hand sides

  **Breaking — `solve(n, k, f)` becomes `solve(n, k, rhs_columns, f)`.** `f` and
  the returned `d` are column-major `n × rhs_columns` instead of a single column:
  first the `n` values of the first right-hand side, then those of the second.
  The same layout as the sister package `@baustatik/sparse-solver-wasm` — two
  solvers with two orderings would be two chances to confuse them. A wrong length
  is still a contract break and comes back as `JsError`.

  `pivotRatio` and `singularIndex` stay **single-valued**. They belong to the
  factorization, and therefore to the matrix, not to one right-hand side: `k`
  right-hand sides yield `k` displacement fields and exactly one verdict about
  the structure.

  This is what `solveAll` in `@baustatik/fem-solver` needs to pay the
  factorization once for all load cases
  ([ADR 0044](../docs/adr/0044-solveall-bundles-the-load-cases.md)). Per
  [ADR 0036](../docs/adr/0036-release-policy-before-the-first-consumer.md) the
  break is recorded as `patch`.
