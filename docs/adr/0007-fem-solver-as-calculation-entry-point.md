# `createFEMSolver` is the entry point of the calculation, not `@baustatik/fem`

The calculation is reached through one factory, `createFEMSolver(config)` in
`@baustatik/fem-solver`, built to mirror `createFEMViewer` in
`@baustatik/fem-viewer`: a config of PULL getters over the store's raw data, and
a small returned object (`validate()`, `solve()`) that hides everything in
between.

The obvious guess is that `@baustatik/fem` should be that entry point — it is
the package named after the domain. It is not. `fem/src/index.ts` exports three
types and nothing else; the package has zero dependencies and not a single
function. It is the shared vocabulary that both sides speak, which is what
`render-core` is to the viewer. Giving it behaviour would cost it the property
that makes it safe for everything to depend on. `@baustatik/fem-solver` was
scaffolded for this role from the start (`AGENTS.md`: "Assembly, transformation,
boundary conditions and reactions") and had no `src/` until now.

Without such an entry point the application has to know the order of the chain —
validate in `fem-loads`, resolve in `fem-load-resolve`, `consistentLoad` in
`fem-element`, assemble here — and has to handle intermediate concepts like
`LoadModelGeometry` and `LocalElementLoad` that exist only to connect two
packages. An earlier sketch of the demo did exactly that, and it read wrong for
the same reason it would read wrong if `createFEMViewer` asked the caller for a
`SceneSpec`. PULL getters rather than arrays follow the viewer for a second
reason: there is then no second copy of the model to keep in sync with the
store. Every call sees the current state.

Two boundaries are worth stating because they are not obvious from the shape.

First, `solve()` is a throwing stub (`SolveNotImplementedError`) while
`validate()` is fully wired. That asymmetry is the reason the entry point exists
already: load validation is finished and has a caller today, whereas the path
from validated loads to displacements is all-or-nothing — equivalent nodal
loads, DOF numbering, assembly, the 6x6 transformation, boundary conditions, the
linear solve, reactions. A partial version of that returns numbers that look
like results and are not, the same argument that keeps `internalForces` a stub
in `fem-element`. `solve()` does run `assertValidLoads` before throwing, so the
gate is real and testable now.

Second, the input dialog does **not** go through this entry point. It validates
against `@baustatik/fem-loads` directly (`validateLoad` with a
`modelGeometry(...)`), because it checks a draft while the user is still typing —
a load that `getLoads()` cannot see yet. Routing that through the solver would
have meant either writing invalid loads into the store first, or adding a second
validation door to the solver for a caller that needs the rule, not the
calculation.

The config currently declares only `getNodes`, `getBeams` and `getLoads` — what
`validate()` actually reads. Supports, cross-sections and materials arrive with
`solve()`. A getter nobody calls would be state without effect, which this
codebase argues against elsewhere (moment loads carry no `frame`, point loads no
`referenceLength`). The cost is that adding them later changes a public
signature.
