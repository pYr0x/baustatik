# `solveAll` bundles the load cases — and that has an expiry date

You look this one up when a load-case error is reported that used to come after
a result, when you wonder why the solver port is called once for five load
cases, or — and this is the one that matters — when second-order theory or
state II reinforced concrete is about to be added.

> **`K` is identical across all load cases, because `getSectionStiffness(beam)`
> deliberately receives no load case. So `solveAll` assembles once, factorizes
> once, and back-substitutes every case on that one factorization.
> **The invariant that carries this has an expiry date**: as soon as `EI`
> depends on the pair (beam, load level), bundling is not slower — it is
> wrong.**

## Why now

[ADR 0043](0043-the-solver-is-an-analysis-setting.md) made the sparse path the
default, and with it a solver contract that takes `n × k` right-hand sides. That
capability had no user: `solveAll` was a loop that called `solve(id)` per case
and paid the whole chain each time — validation, assembly, factorization.

The factorization is the expensive part. For `k` load cases it was paid `k`
times for a matrix that was identical every time.

## The invariant, stated exactly

`SolverConfig.getSectionStiffness` takes a `Beam` and nothing else. It has no
load case, no load level, no displacement field. Consequently

- the element stiffness of a beam,
- its condensation (releases are geometry, not load),
- its transformation,
- and therefore the assembled `K`

are load-free. What depends on the case is `f` — the consistent load vector —
and everything downstream of the displacements.

`PreparedBeam` was split along exactly that line: `{ beam, K, T, map, element }`
once per calculation, `{ f, loaded }` once per case. `element.withLoad(...)` is
the only call in the whole chain that sees a load case at all.

## What changed observably

- **All load cases are validated before the first number is calculated.**
  Model once, then every case and its loads. Previously the second case was
  validated only after the first had been fully calculated; someone with two
  faulty cases now gets the load error instead of the first case's result. This
  is deliberate: an invalid load input means the input is not finished, and
  which of the two errors surfaces should not depend on how far the arithmetic
  got.
- **The abort on the first error is otherwise unchanged.** `assessDisplacements`
  still runs per case in order, and the third case's error still aborts the
  batch — only now the whole factorization has already been paid.
- **`SingularStiffnessMatrixError` hits the whole batch.** That is not a
  regression but a truth made visible: the finding belongs to the
  factorization, and the factorization belongs to all cases at once. A
  kinematic model is kinematic in every load case.

`solve(id)` is `solveBatch([case])[0]`. There is one calculation, not two that
could drift apart.

## The expiry date

This is the part worth finding again.

The bundling rests on `K` being load-free, and that holds for first-order
theory with linear-elastic material. It stops holding for:

- **Second-order theory.** The geometric stiffness matrix depends on the normal
  force, and the normal force depends on the load case. `K = K_e + K_g(N)` is
  then a different matrix per case.
- **State II in reinforced concrete.** A cracked section has a different `EI`,
  and whether it is cracked depends on the load level. `EI` then hangs on the
  pair (beam, load level).

In both cases `getSectionStiffness` would have to receive more than a beam —
and the moment its signature grows, this ADR is void. The bundling would not
become slow, it would become **wrong**: every case after the first would be
calculated with the first one's stiffness, silently, with plausible-looking
numbers.

Whoever changes that signature has to unbundle `solveBatch` at the same time.
There is no test that catches it, because there is nothing to catch until the
signature changes: the test would have to know a future formulation.

## What this does not decide

- **Combinations.** Calculating cases side by side is not superimposing them.
  A combination is a load case built from others; it goes through the same
  batch like everything else.
- **Parallelism.** The port runs over a single worker; parallel calls would
  queue up there anyway. Bundling removes the work, it does not distribute it.
