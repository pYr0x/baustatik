# Model rules live in `@baustatik/fem`, which gives up being dependency-free

`validateModel`, `assertValidModel`, `isolatedNodeIds` and the
`ModelValidationError` / `ModelValidationWarning` hierarchies live in
`@baustatik/fem`. The package therefore depends on `@baustatik/errors` and is no
longer three types with an empty `dependencies` block.

Until now the model had no rules anywhere. Load rules lived in
`@baustatik/fem-loads`; the only place a broken model was noticed was
`fem-viewer/src/scene.ts`, which throws `UnknownNodeReferenceError` **while
drawing**, one message per attempt. That is a side effect of rendering, not a
gate: anyone who never draws computes with a broken model, and `solve()` would
have met the damage as a `NaN` in the global stiffness matrix, far from its
cause.

## Why here and not somewhere else

The load-bearing ordering in this repository is *whoever owns the type owns its
rules*. `Node`, `Beam` and `NodeSupport` are owned by `@baustatik/fem`. ADR 0006
took exactly this step once already, for `FEMLoad`: the rules needed a house, so
the package gave up its purity.

Two alternatives were rejected.

Putting the rules in `@baustatik/fem-solver` would place the rules about a type
in a package that merely uses it, and would break the symmetry with `fem-loads`
that makes the pair legible. It would also lock the rules behind the calculation
entry point, so any future caller that wants to judge a model without computing
one — an importer, a file-format validator, the viewer — would have to depend on
the solver.

A separate `fem-model-check` package would be a package for one file.

## The price, stated honestly

`solver.ts` used to argue that `@baustatik/fem` is "pure vocabulary — three
types, zero dependencies, what `render-core` is to the viewer". That analogy does
not survive scrutiny. `render-core` is vocabulary *between two interchangeable
sides*, an adapter and a viewer, and it stays empty so either side can be
swapped. `@baustatik/fem` has no interchangeable side; it is the model itself.

The measurable cost is one new edge, `fem → errors`. Every package that depends
on `fem` today — `fem-loads`, `fem-viewer`, `fem-solver` — already depends on
`errors`, so no new node appears in the dependency graph and nothing becomes
transitively heavier.

## Consequences

`fem-viewer` keeps its own `UnknownNodeReferenceError`, so the name now exists
twice. Merging them is a separate cleanup: the viewer's variant is thrown during
rendering and carries different call sites and tests, and folding it in here
would have pulled a third package into this change.

`ZeroLengthBeamError` is deliberately *not* called `DegenerateBeamError`, which
`fem-loads` already uses for "this load sits on a zero-length beam". Two
triggers, two names — the load-side one only fires when a load happens to sit on
the beam, this one always fires.

`isolatedNodeIds` is exported as a public utility rather than kept private to
`validateModel`, because `fem-solver` needs the same graph to warn about a node
load on a node with no beam. That keeps the graph computed in one place while
`@baustatik/fem` stays ignorant of loads.
