# Kinematics is detected by the solver, not predicted by the report

A model is *kinematic* when it is a mechanism: the reduced stiffness matrix
`K_ff` is singular and `K d = F` has no unique solution. Until now `fem-solver`
caught this with two nets, and neither was good enough:

1. `assertHeld` — a free DOF whose diagonal is exactly `0`. Cheap, exact, and it
   can name node and direction. But it only sees the one case where a row is
   *empty* (the unbraced Pendelstab).
2. `!Number.isFinite(d[r])` on the result. This worked only by accident: faer's
   `PartialPivLu` divides by a zero pivot and lets `NaN`/`Infinity` through.

Between them sat the case that matters most in practice: a **nearly** singular
system — a frame that is technically braced and practically falls over. It
returns large but finite numbers, passes both nets, and is rendered as a
displacement field. A plausible-looking wrong answer is the worst possible
outcome for a structural calculation.

## Cholesky, not the determinant

`K_ff` is symmetric positive **semi**definite by construction. Stable ⟹ positive
definite; kinematic ⟹ merely semidefinite. That boundary is exactly where a
Cholesky factorization fails — the textbook "zero or negative pivot is a
mechanism". So the failure *is* the signal, and it costs half of an LU.

**Not the determinant.** `det(K) = 0` ⟺ singular is mathematically correct and
numerically useless. `det` is the product of all `n` eigenvalues: with realistic
stiffnesses (`EA ~ 1e9`) and a few hundred DOF it overflows or underflows. A
perfectly stable frame yields `det = 0` by underflow; a mechanism can yield
`det = 1e-5`. It is also not scale-invariant — changing units changes it by
`2^n`.

**Not SVD or `col_piv_qr`.** Both are more expensive, and worse: they *succeed*
on a mechanism. They return one arbitrary least-squares displacement field out
of an infinite solution space instead of failing.

## Scale first, then compare pivots

An exact zero pivot almost never occurs in floating point, so the criterion has
to be a threshold — and a threshold is meaningless on the raw matrix. `K` holds
axial stiffnesses (`EA/L`) next to bending stiffnesses (`EI/L³`), orders of
magnitude apart; a fixed threshold would either flag a well-braced frame or miss
a mechanism, depending on the units.

Jacobi scaling fixes this: `Ks = S K S` with `S = diag(1/sqrt(K_ii))` puts `1`
everywhere on the diagonal. The smallest pivot of `Ks` is then also its ratio to
the largest — a cheap estimate of the reciprocal condition number, and
unit-free. The threshold is `1e-12`, and its exact value is uncritical because
the gap is enormous: a cantilever sits at `0.25` — independent of `EI`, `L` and
material, because scaling cancels the stiffness and leaves only the geometry
(`1 − 36/48 = 1/4`) — while a mechanism falls to `1e-16` and below.

The price is that results are no longer bit-exact: scaling and unscaling cost
the last ulp. Two solver tests moved from exact equality to `toBeCloseTo(…, 12)`.
That is cheap for a threshold that means something.

## The finding travels as a result, not as a throw

`LinearSolve` used to return `Float64Array`. It now returns:

```ts
type LinearSolveOutcome =
  | { kind: 'solved'; d: Float64Array }
  | { kind: 'singular'; index: number; pivotRatio: number };
```

A mechanism is **not an error of the port**. It is a statement about the user's
model; the port did its job and has an answer. Errors — a broken contract, a
crashed worker — stay on the throwing channel. Putting both in one channel makes
them indistinguishable afterwards, which is precisely the bug that a `catch`
around the port call would have introduced.

`index` is the row of the *reduced* system, which is what lets `fem-solver` turn
a number into `SingularStiffnessMatrixError(nodeId, dof)` via `free[index]`.
Only `fem-solver` can do this: `linear-solver-wasm` knows nothing about nodes,
and the application knows nothing about the reduction. This is the ownership
split the port existed for (ADR 0009), now with a wider contract.

**The named DOF is a hint, not a proof.** Cholesky does not pivot, so the index
is deterministic — but it marks where the rank deficiency became visible during
elimination, not necessarily the DOF that moves. The real mechanism is the
eigenvector to the smallest eigenvalue, which costs a multiple of the
factorization. The error message says so; `UnrestrainedDegreeOfFreedomError`,
which *is* exact, does not have to.

## `check()` still cannot answer this

The question that prompted this ADR was whether `check()` could report
kinematics. It cannot, and not for want of effort: kinematics is not a property
of any single node, beam or support, but of how all of them combine. It becomes
visible only in the factorization. `canSolve` therefore means "no rule violation
found", never "this will succeed", and `CheckState` gains no sixth state.

A topological pre-check (counting `n·3 − constraints`) was considered and
rejected. The count is necessary but not sufficient: it calls a laterally
unbraced frame with the right number of supports stable, and reports statically
indeterminate systems as faulty. It would give `canSolve` a promise it cannot
keep.

## Consequences

- `PartialPivLu` is gone. `K` must be symmetric — true for every linear
  first-order formulation, and recorded as an invariant in the package's
  `CONTEXT.md` so a future non-symmetric formulation trips over it.
- The WASM boundary returns `Result<SolveOutcome, JsError>`. The former
  `assert_eq!` shape checks became `unreachable executed` in release builds,
  losing the message and leaving the instance unusable.
- The test double in `fem-solver` had to reimplement the detection to satisfy
  the contract. Those tests therefore no longer prove that faer does it — that
  is inherent to any port. `cargo test` in `linear-solver-wasm` and the hand
  calculation in `apps/demo/fem-cantilever.ts` cover the real path.

## Addendum: incomplete, but not wrong

See [ADR 0016](0016-kinematics-shows-in-the-displacement-not-in-the-pivot.md).

Everything above still holds. What it does not say is that the pivot is a
**one-sided** test. A model with an inclined beam mixes `EA/L` and `12EI/L³` into
the same row; the cancellation during assembly leaves a noise floor far above
`1e-12`, and the stored matrix becomes the exact matrix of a slightly different —
load-bearing — model. A mechanism can therefore be factorized cleanly and return
a large but finite displacement field, the very failure this ADR set out to
close.

A pivot below the threshold is still certainly a mechanism. The other direction
proves nothing, and no better decomposition changes that, because they all read
the same corrupted matrix. The threshold stays at `1e-12` and stays where it is;
ADR 0016 adds a fourth net at the *result*.
