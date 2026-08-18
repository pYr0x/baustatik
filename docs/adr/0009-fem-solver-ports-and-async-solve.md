# `fem-solver` takes three ports, and `solve()` is asynchronous because of one

`SolverConfig` carries two kinds of field. The **getters** (`getNodes`,
`getBeams`, `getSupports`, `getLoads`) pull raw data from the store, as ADR 0007
established. The **ports** supply capabilities the package deliberately does not
own:

```ts
getSectionProperties: (beam: Beam) => SectionProperties | undefined
solveLinearSystem:    (n, K, F) => Float64Array | Promise<Float64Array>
formulation?:         FrameElement2DFormulation   // default Timoshenko2D
```

> Renamed by [ADR 0020](0020-section-properties-versus-section-stiffness.md):
> the port is now `getSectionStiffness` and its return type
> `SectionStiffness`. The text below keeps the original names — it is a record
> of a decision, not API documentation. Nothing about the port argument
> changes; only the word does.

> Amended by [ADR 0012](0012-kinematics-is-detected-by-the-solver.md):
> `solveLinearSystem` no longer returns a bare `Float64Array` but a
> `LinearSolveOutcome` — either the displacements or the finding that the system
> is kinematic. The port ownership argument below is unchanged; the contract
> simply carries one more thing the solver alone can observe.

All three exist for one reason: **`fem-solver` must be testable alone.** It is
the package that wires the entire calculation chain together, so it is the one
package where a test must be able to say "the assembly is wrong" rather than
"some number came out different". With the ports it needs no WASM toolchain, no
cross-section catalogue and no particular beam theory.

## What each port buys

`solveLinearSystem`. `@baustatik/linear-solver-wasm` is built with `wasm-pack
--target web`: `init()` is asynchronous and the module loads over `fetch`/`URL`,
which does not run in Vitest under Node without contortions. A direct dependency
would have made the calculation-chain package the least testable one in the
repo. It also would have prevented the application from putting the solve on a
worker — which is the only wiring that exists today (`apps/demo/fem/linear-solver.ts`
predates this change). Tests inject a twenty-line Gaussian elimination.

`getSectionProperties`. The path `crossSectionId → stiffness` does not exist yet
anywhere: `@baustatik/cross-section` exports a single type, `Segment`, and no
package computes an area or a second moment of area.
`fem-element/src/types.ts` already anticipated an adapter over `material ×
cross-section`; the port is the seam it plugs into. Returning `undefined` rather
than throwing lets a missing cross-section become a model error in `check()`
instead of a surprise in `solve()` — see ADR 0010 for why that matters.

`formulation`. Not for the reason it first appears. ADR 0004 ships two
production formulations, but they produce the *same* 6×6, so running a model
through both proves nothing about assembly, transformation or condensation —
they receive identical matrices and would make identical mistakes. What the port
actually buys is a **trivial** formulation: identity stiffness and a constant
load vector, against which DOF numbering, assembly, the transformation and the
boundary conditions are checkable with numbers computable by hand.

## The consequence nobody can opt out of

Because `solveLinearSystem` may return a promise, `solve()` returns
`Promise<SolveResult>`, and `async` is viral into every caller. The gate
(`assertValidModel`, then `assertValidLoads`) therefore surfaces as a rejected
promise rather than a synchronous `throw`. For any caller using `await` inside a
`try` this is indistinguishable; only a caller that ignores the promise sees the
failure later than it would have.

The alternative was to put the *whole solver* into the worker and keep
everything synchronous inside. That destroys the PULL pattern: getters do not
survive a `postMessage` boundary, so the application would have to serialise the
model — producing exactly the second copy that ADR 0007 exists to avoid.

## What is not a port

The shear switch. `shearDeformation` is a plain boolean, not a port, and the
solver substitutes `'rigid'` for `GAs` when it is false. Every cross-section
*has* a shear stiffness; neglecting it is a decision about the **analysis**, not
a property of the section. So the catalogue is never asked to answer a question
nobody put to it, and the switch lives where the analysis lives (anticipated
in `fem-element/src/types.ts`).

> Amended by [ADR 0011](0011-analysis-settings-split-into-versioned-policy-and-ports.md):
> the switch is still not a port, but it no longer sits directly on
> `SolverConfig` — it moved into `AnalysisPolicy.shearDeformation`, which is the
> same argument carried one step further. Being a decision about the analysis
> *and* writable as JSON is exactly what makes something policy rather than
> port.
