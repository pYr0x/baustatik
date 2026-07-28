# The result carries a serialisable evaluation state

`SolveResult` used to end at the member end forces:

```ts
elementEndForces: Map<string, Vector6>
```

It now carries, per beam, everything needed to answer `N`, `V` and `M` at any
station without looking anything up:

```ts
beamStates: Map<string, ElementEvaluationState>

type ElementEvaluationState = {
  L: number;
  endForces: Vector6;           // [Fx1, Fz1, My1, Fx2, Fz2, My2], local
  endDisplacements: Vector6;    // released DOFs recovered
  load: LocalElementLoad;
  deformation: { kind: 'timoshenko-2d-iie'; phi: number; EI: number; EA: number };
};
```

Pure data. No closure, no class instance, no reference back to `config`.

## What this is for

The workflow is: the user enters a model and load cases, computes one case or
all of them, and the results are **stored**. From a stored result the viewer
wants a diagram, the design check wants a single value, and the report wants a
table — all three ask the same question, `N`/`V`/`M` at `x`. Whenever the model
or the loads change, every result is discarded and recomputed.

Storing means the result has to survive `structuredClone` — a worker boundary,
an IndexedDB write, a snapshot. That rules the two obvious alternatives out.

## Rejected: methods on the result

```ts
result.internalForcesAt('b1', 1.5)   // no
```

A method is a closure over the solver's internals. It does not clone and it does
not serialise; a result that came back from a worker would have data and no
behaviour, and the failure would show up as a missing function, far from the
cause. So the query functions are free functions —
`internalForcesAt(result, beamId, x, side?)` and
`internalForcesAlong(result, beamId, opts?)` in `@baustatik/fem-solver`, both
delegating to `@baustatik/fem-element`.

## Rejected: read `config` again, stamped with a `modelRevision`

The alternative is to keep the result thin and reach back into `config` for the
geometry, the loads and the section properties when asked, guarding against
staleness with a revision counter.

That mixes old state with new. The stamp can say *whether* the model has changed
since; it cannot make the answer right when it has. In the window between the
change and the check, the query mixes yesterday's displacements with today's
loads, and the number that comes out is plausible. Worse, the correctness of a
stored result would depend on a mutable object living somewhere else.

Because the state carries its own load and its own end forces, no stamp is
needed: **a result made only of numbers, which looks nothing up, cannot go
stale.** The application's rule "any change discards all results" then serves
memory and display, not correctness. `internal-forces.test.ts` pins this by
answering section forces from a `structuredClone`d result.

## `LocalElementLoad` becomes visible on the way back

ADR 0007 deliberately hides `LocalElementLoad` on the way *in*: the caller gives
`FEMLoad`s in the model world, and the resolution onto beams is internal to the
calculation. The evaluation state puts the resolved load back into the caller's
hands.

That is accepted, and it is not a leak of the same kind. On the way in, the type
being hidden protects an *invariant* — nobody should be able to hand the solver a
pre-resolved load and bypass `fem-load-resolve`. On the way out it is a
*measurement*: this is the load the element actually saw, and every station,
every discontinuity and every integral in the reconstruction is derived from it.
Hiding it would mean the reconstruction has to ask someone else, which is exactly
what this ADR rejects.

## Versioning rides on the discriminator

`deformation.kind` is the discriminator and therefore also the version
mechanism — the same pattern as `ActionCategory` and `BeamLoad`. There is
deliberately no `schemaVersion` field: a second kinematics would arrive as a
second `kind` with its own fields, and a reader that does not know it fails at
the `switch` rather than on a number comparison.

`Timoshenko2D` and `Timoshenko2DIntegrated` report the **same** `kind`. They
differ in how `K` is built, not in the kinematics, and a consumer of the state
cannot tell them apart — correctly.

`deformation` is also provisions for the deflection curve, which is not part of
this step: curvature from `M/EI`, shear from `V/GAs` with
`GAs = 12·EI/(phi·L²)` and `phi === 0` meaning shear-rigid, extension from
`N/EA`. `phi` is invisible from outside otherwise, which is why the record has to
come from the element and not from the solver.

## Consequences

- Breaking change to `@baustatik/fem-solver`: `elementEndForces` is gone. The
  numbers live on as `beamStates.get(id).endForces`; two copies would have been
  two things to keep in step when serialising. Outside the tests, one call site
  was affected (`apps/demo/fem-cantilever.ts`).
- Size, for the storage decision: roughly 1.5–3 MB per load case at 2000 nodes
  and 2500 beams. The `Map<loadCaseId, SolveResult>` itself is application
  state and belongs in the store, not in a package.
- `internalForcesAt` and `internalForcesAlong` never read `config` — not the
  geometry, not the loads, not the section properties. That is a rule about
  these two functions, and it is what the previous section buys.
