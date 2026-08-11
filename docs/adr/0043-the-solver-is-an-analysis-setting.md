# The solver is an analysis setting

You look this one up when `createFEMSolver` throws before anything has been
calculated, when you wonder why a frame model now needs *two* solver ports, or
when someone proposes picking dense or sparse automatically from the model size.

> **Which of the two paths through `K d = F` is taken is a *setting*:
> `AnalysisPolicy.linearSystem`, a string that persists. Whether a path is
> *available* is a *port*: `solveLinearSystem` / `solveSparseSystem`, both
> optional on `SolverConfig`. The default is `'sparse'`, and the reason is
> memory, not speed. A policy that asks for a path the config cannot serve
> throws `InvalidSolverConfigError` when the solver is created — not when it
> calculates.**

## Why now

[ADR 0042](0042-sparse-and-dense-solvers-are-separate-wasm-artifacts.md) built
`@baustatik/sparse-solver-wasm` and nobody used it. The frame path in
`@baustatik/fem-solver` assembled a **dense** `number[][]` over all degrees of
freedom and copied the reduced system out of it row by row.

The dense matrix was not merely a solver format, it was the storage. 2,000
nodes are 6,000 degrees of freedom, `36·10⁶` numbers, **288 MB** for `K` alone
in the main thread — plus the same size again as a `Float64Array` for the
reduced system. A plane frame has about twelve entries per row. Everything else
is a very large, very accurate zero.

That is a memory argument, and it is the whole argument. Sparse factorization
is also faster at that size, but a solver that cannot allocate is not slow, it
is broken.

## The line: setting versus capability

[ADR 0011](0011-analysis-settings-split-into-versioned-policy-and-ports.md) drew
the line already, and it names this exact case as an example: *"direct or
iterative solve" would be a persistable setting, "this solver implementation" is
a port*. Dense versus sparse is the first kind. It is a word, it round-trips
through JSON, and a project that was calculated with it must be reproducible
from the record.

The port stays a port for the reason it always was: `fem-solver` wires the whole
calculation chain and must therefore be testable on its own — without a WASM
toolchain, without a worker ([ADR 0009](0009-ports-for-external-capabilities.md)).

Both ports are **optional**, and that is the point of ADR 0042 arriving in the
application: whoever calculates one path loads one artifact. A required port
would force every frame calculation to fetch sparse ordering code it never
calls.

## The check happens at creation

`resolveAnalysis` picks the port for the configured mode and throws
`InvalidSolverConfigError` if it is missing. That happens inside
`createFEMSolver`, which resolves the configuration exactly once.

Deferring it to `solve()` would mean `createFEMSolver` returns a calculation
head that could never calculate — and the caller finds out at the third load
case. This package spends a lot of effort on *not* being ambiguous about
readiness (`check()` versus `solve()`, the report versus the gate); a
mis-wired config is the caller's mistake, not a state of the model, so it is
neither a report finding nor a fifth state.

## `SystemMatrix` owns its port

The format does not appear in `solve.ts`. A package-internal `SystemMatrix`
interface offers exactly what the calculation chain needs — `add`, `diagonal`,
`rowDot`, `solve` — and each of the two implementations
(`src/system-matrix/dense.ts`, `sparse.ts`) holds its own port and solves
itself.

The alternative — `solve.ts` hands numbers to a solver — fails because handing
over numbers *is* choosing a format. The chain would then exist twice, once per
format, and the two copies would drift. With the interface there is one chain
and two matrices, and `tests/solve.test.ts` runs the numeric blocks over both.

The sparse implementation keeps the **full, symmetric** matrix and sums
duplicates on `add`. Two reasons, and both matter:

- `rowDot` needs the full row *including the columns of restrained degrees of
  freedom* — that is how the support reactions fall out of `r = K d - F`.
  Storing only the lower triangle would mean mirroring on read, at a place
  where a sign error shows up only in the reactions.
- faer's duplicate semantics for triplets are not written down; the invariants
  of `@baustatik/sparse-solver-wasm` say nothing about them. What is not
  guaranteed is not relied on.

The lower triangle is filtered out only when handing over to the port, together
with the `global → reduced` renumbering.

## One outcome type, two input types

`LinearSolveOutcome` holds for both ports. Only the shape of `K` differs going
in; what comes back is the same statement about the same system of equations.
Two outcome types would force `solve.ts` to know the format it is built not to
know.

Both crates now take `n × k` — one factorization, several right-hand sides
(see [ADR 0044](0044-solveall-bundles-the-load-cases.md)). `pivotRatio` and
`singularIndex` stay **single-valued**: they belong to the factorization, and
therefore to the matrix, not to one right-hand side.

## Both crates report the same finding

For `'sparse'` to be the default, net 2 out of
[ADR 0012](0012-kinematics-is-detected-by-the-solver.md) has to keep working on
it — the *nearly* singular matrix that factorizes successfully and returns
noise. `@baustatik/sparse-solver-wasm` therefore learned `pivotRatio` and
`singularIndex`, on the same Jacobi scaling and the same `1e-12` threshold as
the dense crate. `unfixed` keeps its name and its meaning (*the fixation is
missing*, not *mechanism*); the translation into frame language is done by the
port adapter in the application, not by the crate.

Three things had to be true for that, and all three were measured against faer
0.24.4 before this decision was written:

1. `factorize_numeric_llt` reports `LltError::NonPositivePivot { index }` — and
   the index counts columns **from one**.
2. `SymbolicCholesky::perm()` hands out the AMD permutation, so the index can be
   mapped back into the caller's numbering. Without it the index points at the
   wrong node, which is worse than no node at all.
3. The diagonal of `L` is readable in the simplicial layout
   (`values[col_ptr[j]]`), which is what yields `pivotRatio` in the **successful**
   case.

For (3) the crate forces `SupernodalThreshold::FORCE_SIMPLICIAL`. faer's
heuristic between simplicial and supernodal is a speed decision; it must not
decide whether the pivot is obtainable at all. For frames — about twelve entries
per row — simplicial is the fitting choice anyway.

The evidence that both crates measure the *same* quantity is a number: the same
scaled cantilever yields exactly `1/4` on both, independently of `EI` and `L`.

## `schemaVersion` jumps to 3 without a migration path

Same reasoning as 1 → 2: at the time of the jump `parseAnalysisPolicy` had no
production caller, so nothing persisted exists to migrate. A silently added
default would be a setting the user never chose — and here it would be *the
choice of solver*. A version-2 document is rejected, not completed.

## What this does not decide

- **Choosing the solver automatically from the model size.** The setting is
  written down and reproducible; a heuristic would make the same project
  calculate differently on a different machine.
- **Retiring the dense path.** It stays. A second path with the same numbers is
  the only check a calculation core has against itself.
