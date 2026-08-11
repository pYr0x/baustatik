---
'@baustatik/fem-solver': patch
---

Two solver paths for the frame, and the sparse one is the default

`AnalysisPolicy.linearSystem` (`'dense' | 'sparse'`) chooses which way `K d = F`
is calculated; the two optional ports `solveLinearSystem` and
`solveSparseSystem` supply the capability. Which path runs is a *setting* and
persists; whether it is available is a *port*. See
[ADR 0043](../docs/adr/0043-the-solver-is-an-analysis-setting.md).

The default is `'sparse'`, and the reason is memory, not speed: 2,000 nodes are
6,000 degrees of freedom and `36e6` numbers — 288 MB for `K` alone in the main
thread, at about twelve occupied entries per row.

**Breaking — `ANALYSIS_POLICY_SCHEMA_VERSION: 2 → 3`, no migration path.**
`AnalysisPolicy` gains the mandatory field `linearSystem`, and
`parseAnalysisPolicy` is strict, so every v2 document is rejected. Same
reasoning as 1 → 2: `parseAnalysisPolicy` still has no production caller, so
nothing persisted exists to migrate, and a silently added default would be a
setting the user never chose — here, the choice of solver. Per
[ADR 0036](../docs/adr/0036-release-policy-before-the-first-consumer.md) this is
recorded as `patch`.

**Breaking — `SolverConfig.solveLinearSystem` is now optional, and its
signature changed.** It takes `(n, K, rhsColumns, F)` instead of `(n, K, F)`;
`F` and the returned `d` are column-major `n × rhsColumns` instead of a single
column. The new `solveSparseSystem` takes
`(n, rows, cols, values, rhsColumns, F)` with lower-triangle triplets. A config
whose policy asks for a path it cannot serve now throws the new
`InvalidSolverConfigError` **at `createFEMSolver`**, not at `solve()`.

**Breaking — `solveAll` bundles.** One assembly, one factorization, all load
cases; `solve(id)` is that batch with one case. See
[ADR 0044](../docs/adr/0044-solveall-bundles-the-load-cases.md). Two observable
consequences: every load case is validated before the first number is
calculated (previously the second case was validated only after the first had
been fully calculated), and `SingularStiffnessMatrixError` hits the whole batch
— the finding belongs to the factorization, and a kinematic model is kinematic
in every load case.

**The invariant that carries the bundling has an expiry date.** `K` is
load-free because `getSectionStiffness(beam)` deliberately receives no load
case. With second-order theory or state II reinforced concrete, `EI` hangs on
the pair (beam, load level) — then bundling is not slow, it is wrong. Whoever
grows that signature has to unbundle `solveBatch` in the same move.

**Additive.** `LINEAR_SYSTEM_KINDS`, `LinearSystemKind`, `SparseSolve` and
`InvalidSolverConfigError` are exported. The package-internal `SystemMatrix`
(`src/system-matrix/`) owns its port, so `solve.ts` never sees a matrix format;
`tests/solve.test.ts` runs the numeric blocks over both paths.
