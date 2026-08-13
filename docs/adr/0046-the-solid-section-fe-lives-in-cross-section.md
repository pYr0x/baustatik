# The solid-section FE lives in `cross-section`

The assembly and evaluation of the solid-section FE — element matrices, the two
right-hand sides, the boundary walk, the energy integrals — live in
`@baustatik/cross-section` under `src/warping/`. **No new package.**

This reverses one bullet of
[ADR 0045](0045-solid-section-values-are-nu-free-coefficients.md) ("a new package
owns assembly and evaluation") and the corresponding decision 6 of
[`packages/plan-handoff-fe-vollquerschnitt.md`](../../packages/plan-handoff-fe-vollquerschnitt.md).
Everything else in ADR 0045 stands: what is computed, that it is ν-free, that it
is stored, and that the orchestration — mesher, solver, `await` — belongs to the
application.

## The reason the package was proposed does not hold

Decision 6 read: *`cross-section` imports no WASM ([ADR 0009](0009-fem-solver-ports-and-async-solve.md)),
therefore the assembly becomes its own package.* The second half does not follow
from the first, and the same plan says why — the proposed package was to import
no WASM either. It takes a **finished mesh** and returns numbers.

Both meshing ([ADR 0039](0039-meshing-is-a-transient-worker-capability.md)) and
the sparse solve ([ADR 0042](0042-sparse-and-dense-solvers-are-separate-wasm-artifacts.md))
are asynchronous Worker capabilities held by the caller. What remains between
them is pure and synchronous, in two doors:

```text
mesh                → { rows, cols, values, F }     assembly
mesh + d            → { It, yM, zM, d₀/d₂ per axis } evaluation
```

Neither door needs a WASM import to exist, so no package boundary is needed to
prevent one. The repository already solves exactly this with a **type**:
`packages/cross-section-viewer/src/fe.ts` declares `CrossSectionFEMesh` as
deliberately only *structurally* compatible with `Mesh2DResult`, and the viewer
therefore draws meshes without depending on the mesher. `src/warping/` takes its
mesh input the same way.

The port rule of ADR 0009 is untouched: the capability is supplied from outside,
the package holds the formulation.

## What actually moves: the quadrature sentence

The one real objection was `cross-section`'s own invariant, *"there is no
quadrature in `src/`"*. Read with its rationale — `S` is piecewise a quadratic,
so `S²` is a quartic and the integral is closed-form; the numerical integration
lives in `tests/oracle.ts` as an **independent oracle** — it is a rule against
approximating what can be written down exactly. It is not a rule against
numerics.

The FE has no closed form that a quadrature could undercut. The invariant is
therefore restated rather than defended by a package boundary:

> **Where a closed form exists, it is not quadratured.**

`packages/cross-section/CONTEXT.md` carries the corrected wording and a banner
saying what it used to say. The independent-oracle role of `tests/oracle.ts` is
unchanged, and `src/warping/` gets oracles of the same character (5/6 for the
rectangle at m = 0, the Fourier series for `It`, the closed circle field).

## Why inside is the better of the two

- **The result type belongs here.** `SolidSectionValues` is written into a
  `cross-section` record. A separate package could only hand back a loose object,
  and the door that puts it into the record would live here anyway.
- **The inputs are here.** The right-hand side and the Trefftz projection need
  `Iy`, `Iz`, `Iyz` and the centroid from `src/green.ts`, and the figure comes
  from `deriveOutline`. Inside, those are relative imports; outside, a dependency
  plus barrel exports for internals that have no other consumer.
- **A package earns its overhead from a second consumer**, and there is none in
  sight: `package.json`, tsconfig, build and test config, `CONTEXT.md`, the
  Turbo and AGENTS.md entries, its own changesets — for a handful of files.

Against that stands the honest counter-argument, recorded because it is the one
that would justify revisiting this: an FE kernel is a different craft from a
value engine built on closed formulas, and `cross-section` is already the largest
domain package.

## The exit is cheap, and that is why this is decidable now

`src/warping/` is pure, synchronous and has no identity of its own — mesh in,
numbers out. If it grows beyond the section problem, or a second consumer
appears, extracting it into `@baustatik/section-warping` is mechanical: move the
folder, keep the doors. The reverse — a package that never gains its second
consumer — is permanent.

The trigger to revisit: a consumer outside `cross-section`, or a formulation
that no longer answers a cross-section question.

## Consequences

- `src/warping/` is a folder with an internal barrel; `src/index.ts` exports only
  the two doors and `SolidSectionValues`, not the element level.
- `cross-section` gains **no** dependency — not on `mesh-2d-wasm`, not on
  `sparse-solver-wasm`. The mesh type is declared locally and structurally, after
  `cross-section-viewer/src/fe.ts`.
- The quadrature invariant in `packages/cross-section/CONTEXT.md` is restated as
  above.
- ADR 0045's consequence "a new package owns assembly and evaluation" is
  superseded by this ADR; the rest of it stands.
- The acceptance run loses its `@baustatik/section-warping` filter: the FE tests
  run under `pnpm --filter @baustatik/cross-section test`.
