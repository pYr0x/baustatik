# Frame element formulation bound via a `prepare()` factory, not a flat method bag

The `FrameElement2DFormulation` interface exposes a single
`prepare(props, L): PreparedElement`. The returned `PreparedElement` carries
`stiffness()`, `consistentLoad(load)`, `internalForces(...)` and
`shapeFunctions(x)`, all closed over that one `props`/`L` binding. It is
deliberately **not** a flat bag of static methods that each re-accept
`(props, L)` — the shape the originating handoff (`Elementformulierung.md`)
first sketched.

The driving reason is the shear parameter `phi = 12*EI/(GAs*L^2)`, which depends
on both `props` and `L` and must be normalised at exactly one place (it maps the
`'rigid'`/`Infinity` shear-rigid case to `phi = 0`; see the `GAs`-only-in-`phi`
invariant in `packages/fem-element/CONTEXT.md`). A flat method bag would compute
`phi` in four places, so the rigid-case guard could drift between the stiffness
and the shape functions, or a caller could pass different `props` to
`localStiffness` than to `shapeFunctions` and silently mix theories within one
element — the exact "never mix formulas from different elements" failure the
package exists to prevent. `prepare()` computes `phi` once and hands every method
the same binding, while staying pure (a fresh bound object, no shared mutable
state). The cost is one extra concept (the "prepared element") and a `prepare()`
call in tests.

This changes the public interface shape, which is hard to reverse once
`fem-solver` and future elements depend on it, so recording it here: the solver's
per-element loop is `prepare()` then `stiffness()` + `consistentLoad(load)`, and
the flat static-method interface should not be reintroduced.
