# The solid-section FE lives in its own package

The whole solid-section FE — building the rings, meshing, assembly, the two
boundary-value problems, evaluation — lives in **`@baustatik/cross-section-fe`**.
It depends on `@baustatik/cross-section`, `@baustatik/mesh-2d-wasm` and
`@baustatik/sparse-solver-wasm`, and it exposes one asynchronous door:

```ts
computeFESectionValues(
  geometry: SectionGeometry,
  policy: SectionPolicy,
): Promise<FEComputation>
```

**This supersedes [ADR 0046](0046-the-solid-section-fe-lives-in-cross-section.md)**,
which put assembly and evaluation in `cross-section/src/warping/`. Everything in
[ADR 0045](0045-solid-section-values-are-nu-free-coefficients.md) about *what* is
computed stands unchanged.

## ADR 0046 declined a different object

Its argument was: *"the proposed package was to import no WASM either […] no
package boundary is needed to prevent one."* That premise was true of the object
it was looking at — a pure assembler taking a finished mesh and returning
numbers.

**It is not true of what was built.** `cross-section-fe` is the *orchestrator*:
it imports both WASM artifacts, holds the `await`, and hands the mesh back out so
the application can draw what was computed. ADR 0046 rejected a package that
would have been pure. This one cannot be.

That alone would not settle it — a package still has to earn its overhead. Four
findings do.

## The oracles need a real mesh, and it cannot live where the code lives

`κ = 0,833333333333` on twelve digits does not fall out of a hand-written
fixture. It needs thousands of elements, so it needs the mesher — and
`cross-section` keeps its suite deliberately Emscripten-free:
`tests/outline-meshability.test.ts` refuses to run Triangle and says so.

Leaving `warping/` there would have put **the code and its sharpest oracles on
opposite sides of a package boundary**. That is the finding ADR 0046 could not
have had, because at the time the oracles were a plan and not a run.

## It costs no new export

The counter-argument in ADR 0046 was that the inputs live inside
`cross-section`: `Iy` for the right-hand side and the boundary datum, `A` for
`maxElementArea`, the figure from `deriveOutline`.

Measured against the built thing, that is not so. `green.ts` exports only
`greenValues`, which is not public — and is not needed: `A` and `Iy` are in the
public `sectionProperties`, `deriveOutline` is in the barrel, and the FE computes
its own moments from the mesh anyway (which is what makes the equilibrium check
`∫τ_z dA = 1` mean something). **Zero new exports.**

## The structural mesh-type copy disappears

ADR 0046 copied the pattern of `cross-section-viewer/src/fe.ts`
(`CrossSectionFEMesh`) so that `warping/` could take a mesh without depending on
the mesher. `cross-section-fe` depends on the mesher regardless and takes
`Mesh2DResult` **directly** — one copy less that can drift apart.

The viewer's structural copy stays where it is and keeps its reason: the viewer
draws meshes and must not learn about WASM. `Mesh2DResult` fits into it without
conversion.

## The two-door seam becomes an internal detail

ADR 0046's seam — assembly here, evaluation there, the solver in between —
survives as *structure*: `assemble.ts` and `evaluate.ts` are pure and
synchronous, and `compute.ts` takes the solver as a plain function, so the
formulation is testable without WASM. But it is no longer public API. Nobody
outside needs to know there are two doors.

## What this buys, stated plainly

`@baustatik/cross-section` stays free of WASM **by construction** instead of by
discipline. Before, the rule "no WASM in `cross-section`" was a thing a reviewer
had to remember; now the package simply has no such dependency to reach for.

The price is honest and is not hidden: **ADR 0046 is superseded, not amended** —
its title says the opposite of what now holds. Its restated quadrature
invariant, though, **stands**:

> **Where a closed form exists, it is not quadratured.**

That is a better rule than the one it replaced, and it is no worse for having
lost its original occasion. `cross-section` still contains no quadrature;
`cross-section-fe` contains three (3-point, 6-point, and 3-point Gauss on the
boundary), and each is chosen because the integrand's degree demands it, not
because a closed form was avoided.

## What the door does and does not know

**One geometry in, one result out — no ID.** The door knows neither
`CrossSection.id` nor a cache and keeps no key: what it is given, it computes.
That each distinct section is computed exactly once comes from the application
walking its own section list and skipping the filled record — the guard is the
field `feValues` in the record itself.

**The mesh comes back out** rather than being discarded. The alternative was to
throw it away and let the application mesh again for drawing — then the picture
would show a different mesh than the number came from. It is transient
([ADR 0039](0039-meshing-is-a-transient-worker-capability.md)): it does not go
into the record and is not serialized.

**One run, no refinement.** There is no convergence loop, no second refined pass,
no stored convergence figure and no warning about one. Mesh density is a *setting
of the user* (`SectionPolicy.FEElements`), and that is the whole control. An
automatic second pass at four times the density is precisely the case, on large
figures, where the computation becomes unusably slow — and it would happen
unasked. The evidence that the formulation converges comes from the oracles, not
from the runtime.

## Consequences

- New package `@baustatik/cross-section-fe`, in the `0.0.x` band like every other
  ([ADR 0036](0036-every-package-stays-in-the-0-0-x-band.md)). Three layers
  inside: `mesh.ts` (rings, mesh input), `assemble.ts`/`evaluate.ts`/`compute.ts`
  (pure and synchronous), `index.ts` (the one asynchronous door).
- `@baustatik/cross-section` **owns the types** `FESectionValues`,
  `FESectionState` and the field `feValues` on both variants of
  `SectionGeometry`, plus `kappaFromCoefficients`. It gains no dependency.
- ADR 0046 gets a banner. Its quadrature invariant stays.
- The acceptance run gains `pnpm --filter @baustatik/cross-section-fe test`.
- `@baustatik/core`'s `atOrThrow` widens from `readonly T[]` to `ArrayLike<T>`:
  the FE computes in typed arrays, and the house rule "`!` appears in no `src/`"
  was otherwise not keepable there.
- Evidence for the formulation:
  [`docs/messungen/nu-abhaengigkeit-schubwerte.md`](../messungen/nu-abhaengigkeit-schubwerte.md),
  [`docs/messungen/loch-zusatzbedingung.md`](../messungen/loch-zusatzbedingung.md),
  and — for the gap the two machines leave —
  [`docs/messungen/t-querschnitt-grashof-gegen-fe.md`](../messungen/t-querschnitt-grashof-gegen-fe.md).
