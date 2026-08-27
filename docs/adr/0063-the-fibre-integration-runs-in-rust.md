# The fibre integration runs in Rust and the law travels as data

You look this one up when you ask why `@baustatik/cross-section-response` has a
Rust crate underneath it, why the material law arrives as a table of
coefficients instead of the σ(ε) function
[ADR 0055](0055-the-cross-section-response-is-the-shared-machine.md) described,
why the boundary carries a flat fibre list and not the FE mesh it was made from,
or why steel never reaches the Newton that concrete uses.

> **The forward integration of σ(ε) over the section, the Newton on the strain
> plane and the plastic zero-line search run in Rust, compiled to WebAssembly,
> in `@baustatik/section-response-wasm`. What crosses the boundary is a flat
> fibre list — `y`, `z`, `A`, law index — and a piecewise-polynomial description
> of each law: never a mesh, never a callback. The crate knows numbers.
> Producing the fibres, owning the vocabulary and converting the units stay in
> TypeScript, on the same line the linear solver has been cut along since
> [ADR 0012](0012-kinematics-is-detected-by-the-solver.md).**

This **realises** the port of ADR 0055, it does not replace it. Every normative
number still enters from `concrete-design`; only its *form* is fixed here. It
**overturns** the recommendation in
`packages/cross-section-response/TODO.md` question 1: the integration runs over
the FE mesh, not over lamellae — the half-sentence
[ADR 0062](0062-the-parametric-shape-writes-itself-out-as-an-outline.md) left
open ("whether it integrates over lamellae or over the mesh is open") is closed
here, in favour of the mesh.

## What ADR 0055 decided, and what it left open

ADR 0055 fixed *what* the machine is — the map from a strain plane to the
section forces and its inverse — and that the law enters as a port. It left
open, deliberately, the three things this decision needs: what the integration
runs over, which language it runs in, and what shape the port actually has once
it has to be crossed a few hundred thousand times.

## Why Rust, and what Rust is not doing

Two motives, and they are not the same one.

**Off the main thread.** The user-visible reason. A design run touches every
design location of every beam, and each location runs an iteration. That belongs
in a Worker, on the pattern of
[ADR 0039](0039-meshing-is-a-transient-worker-capability.md). WebAssembly does
**not** provide this — a WASM call runs on the thread that made it. The Worker
does, and it would do so for a TypeScript integrator just as well.

**The inner loop.** The reason for Rust specifically. The loop is fibres ×
Newton iterations × design locations × load cases, and the fibre count is set by
the mesh, so it is thousands and not tens. That is the first genuinely hot loop
in this repo outside the two solvers.

Stated plainly: **nothing is measured yet.** The loop count is the argument, not
a benchmark. If a measurement later shows the TypeScript integrator is fast
enough, the reference implementation named below *is* that integrator, and the
crate can be dropped without changing a single caller — the door shape does not
depend on which side of the boundary computes.

## The boundary is a fibre list, not a mesh

The fibres come from the FE mesh (next section). They do **not** cross as one.

- **The rebar is a fibre that no mesh contains.** A layer is a point with `As`,
  not an element. It has to be appended to the fibre list in any case, so the
  crate has to accept a list regardless of where the rest came from. A mesh
  interface would need a second channel for exactly the fibres that decide the
  concrete answer.
- **The oracles must run without a mesher.** `Mpl = b·h²/4·fy` for a rectangle,
  and `EA`/`EI` under a linear law, are the tests that make the integrator
  falsifiable against a closed formula. With a fibre list they are four lines of
  input. With a mesh interface every one of them drags in
  `@baustatik/mesh-2d-wasm`.
- **The crate stays free of Tri6.** No connectivity, no midside nodes, no
  element type, no notion of a cross-section — the same rule that keeps
  `linear-solver-wasm` free of FEM terms, where `K` arrives as flat numbers and
  the row index is translated back into a node and a direction by `fem-solver`
  alone.

The producer therefore stays a TypeScript decision and may differ per figure,
now and later, without the crate noticing.

## What produces the fibres: the FE mesh, for every figure

`packages/cross-section-response/TODO.md` recommended lamellae, on the grounds
that a cut through a lamella decomposition is closed-form and hand-checkable.
That argument holds for uniaxial bending and fails at **schiefe Biegung**.

A lamella decomposition is a slice along one axis. Under a strain plane with
`kappaZ ≠ 0` the zero line runs at an arbitrary angle, and the slices have to be
re-cut for every angle the iteration tries — inside the Newton, where the
geometry is supposed to stand still. A two-dimensional fibre field has no such
step: ε = ε0 + κy·z − κz·y is evaluated per fibre, and the angle is nothing but
two numbers in that expression.

The mesh is available for every figure that can carry a strain plane. The drawn
solid section always meshed; since ADR 0062 every parametric shape writes itself
out as an outline and meshes too. Choosing the mesh therefore costs no new
geometry path, and it removes the one that lamellae would have added.

**The catalogue profile is the exception, and it stays outside.**
`CrossSection.kind === 'profile'` carries the table row and no geometry; nothing
writes it out as rings, and its root radius `r` is a true arc, which
`shapeOutline` deliberately avoids (`i-symmetric` is the *welded* I). A rolled
IPE therefore reaches no fibre list. It does not need one: `Wply`/`Wplz` stand
tabulated in `@baustatik/steel-profiles` and are the oracle for this machine
anyway. A `profileOutline` is a decision of its own and is not taken here.

## The law travels as data

ADR 0055 wrote the law as a port and pictured a function. A function cannot
cross this boundary: a JavaScript callback per fibre per iteration would
dominate exactly the cost the crate exists to remove, and inside a Worker it is
not reachable at all.

So a law crosses as a **piecewise polynomial**: breakpoints in ε, per segment
the coefficients of σ(ε) and of dσ/dε, plus the strain limits `epsMin`/`epsMax`.
All four laws of ADR 0055's table fit without a special case:

| law | segments | degree |
| --- | --- | --- |
| Parabel-Rechteck, EN 1992-1-1 3.1.7 | 2 | 2, then 0 |
| bilinear rebar | 2 | 1, then 0 or 1 |
| rigid-plastic | 2, breakpoint at ε = 0 | 0 |
| linear elastic | 1 | 1 |

**ADR 0055's bet is untouched.** `fcd`, `fyd`, `εcu2` and `εud` are still built
by `concrete-design` and still travel in with the law; the strain limits still
ride on the law rather than settling into the iteration. What is decided here is
the encoding, not the ownership. The exit clause of ADR 0055 — rename to
`cross-section-design` if the limits migrate into the Newton — applies unchanged,
and it applies to the crate as well: `grep -r 'fy\|gamma\|alphaCC' rust/src`
finds nothing.

## Three doors, not one

ADR 0055 describes forward, inverse and tangent. The inverse is **two**
different problems, and treating them as one is the mistake this section exists
to prevent.

```text
resultants(fibres, laws, plane)          → (N, My, Mz), tangent      shared
solveStrainPlane(fibres, laws, forces)   → plane | no equilibrium    concrete
plasticResultants(fibres, laws, N)       → Npl, Mpl(N)               steel
```

Under a rigid-plastic law σ = ±fy is independent of |ε|: **dσ/dε = 0 everywhere
except a jump at ε = 0.** The Jacobian of the map is singular, the strain plane
is determined only up to a factor, and only the position of the zero line
carries information. A Newton on (ε0, κy, κz) has nothing to converge on.

What steel solves instead is a bracketed root find on the **zero-line position**
under the constraint ∫σ dA = N, after which `Mpl,N = ∫σ·z dA` falls out of the
forward direction. It is monotone in that position, so bisection or regula falsi
is unconditionally safe where Newton is not. One integrator underneath, two
solvers on top.

This also settles what steel gets out of the machine at all: **resistances, never
stresses.** The elastic check σv ≤ fyd is answered today, by
`@baustatik/cross-section-stress` at the stress points and by `recoverStresses`
([ADR 0061](0061-the-fe-stress-is-a-vector-at-a-node.md)) on the drawn solid
figure. The machine adds `Npl`, `Mpl` and their interaction and nothing else,
and it earns its place for steel only where no table answers: the welded or
drawn figure, and biaxial `N + My + Mz`.

The linear-elastic row of ADR 0055's table has **no caller**. It is an oracle: a
rectangle under σ = E·ε must reproduce `EA = E·b·h` and `EI = E·b·h³/12`. In
production that case stays with `fem-section-resolve`, which computes it in
closed form and exactly, where the fibre integration would carry a
discretisation error.

## The named risk: the kink inside a cut element

A fibre is a point sample of its element. Where the zero line crosses an
element, σ(ε) has a kink inside it — for concrete, a kink *and* the tension
cut-off — and no sampling of that element sees it. Under biaxial bending the
zero line runs at an arbitrary angle, so no mesh alignment can help.

This decision accepts that error and controls it by **fibre density alone**,
because the alternative — subdividing cut elements while the iteration runs —
would need element topology inside the crate and would turn the fibre list back
into a mesh.

**The error is unmeasured.** The measurement that settles it is a rectangle with
`N ≠ 0` against the closed `MN,pl`, over a density sweep, kept in
`verifaction/`. Two consequences follow immediately, and both belong in the
suite:

- `Mpl` must be tested with **`N ≠ 0`**. At `N = 0` the zero line falls on the
  symmetry axis, where a symmetric mesh has an element edge, and the test then
  passes for the wrong reason.
- The mesh density of `SectionPolicy.FEElements` was chosen for the torsion and
  shear problems. Whether it also resolves a compression zone is a different
  question with a different answer, and it is not assumed here.

If density turns out not to be enough, the exit is to pass element topology **in
addition to** the fibre list. That is an extension of the boundary, not a
rewrite of it, and no caller changes.

## Units

The crate computes in **N and mm** and receives them: fibres in mm and mm², laws
in MPa, forces in N and Nmm. `N/mm²` *is* MPa, so no factor lives in Rust and
none can hide in an output conversion — the same construction as in
`@baustatik/cross-section-stress`. The conversion to kN and kNm happens at the
TypeScript door, at one place, out of `@baustatik/units`
([ADR 0024](0024-units-at-the-package-boundary.md)).

## Consequences

- **New package `@baustatik/section-response-wasm`**, `0.0.x`
  ([ADR 0036](0036-release-policy-before-the-first-consumer.md)), on the pattern
  of `@baustatik/sparse-solver-wasm`: `rust/`, a generated `pkg/`, no `src/`, no
  TypeScript, no internal dependency at all.
- **It is the third WASM artifact** and stays separate from the other two, for
  the reason of
  [ADR 0042](0042-sparse-and-dense-solvers-are-separate-wasm-artifacts.md): a
  caller loads what its path needs.
- **`@baustatik/cross-section-response` becomes the WASM-bearing package** of
  the design chain, as `cross-section-fe` is for the section FE
  ([ADR 0047](0047-the-solid-section-fe-lives-in-its-own-package.md)). It owns
  `StrainPlane`, `ReinforcedSection`, the fibre production, the units gate and
  the result union; it delegates the arithmetic.
- **Its solve door becomes asynchronous.** The fibres come from a mesh, and
  `FESectionState` stores only `values` and `fingerprint` — the mesh out of the
  `'solved'` arm is transient (ADR 0039). Whoever integrates needs a mesh at
  design time, and no synchronous door can produce one.
- **A TypeScript reference integrator lives in the test suite**, on the
  precedent of `gaussSolve` in `fem-solver/tests/support.ts`. It is the second
  opinion for figures that have no closed formula, and the fallback if the crate
  is ever dropped.
- **The lamella decomposition is not built.** ADR 0062 named it as a possible
  second consumer of `shapeOutline`; that consumer does not appear.
- **No changeset and no `schemaVersion` change.** Nothing user-visible ships and
  no record shape moves — where the rebar layers live in the model is still
  open, and that is the decision that will move `schemaVersion`.

## Not part of this decision

- **Where the reinforcement layers live in the model.** Still open, still an ADR
  of its own, still the thing that raises `schemaVersion`
  ([ADR 0049](0049-the-tool-document-is-the-versioned-record-unit.md)).
- **The search for `As`.** An outer loop over this machine, and
  `concrete-design`'s (ADR 0055).
- **Concrete shear.** The Fachwerkmodell of EN 1992-1-1 6.2 is not a
  strain-plane problem, and no fibre integration answers it.
- **`profileOutline` for the catalogue branch**, and with it plastic resistances
  for rolled profiles out of this machine.
- **Which Newton and which start value** for the biaxial case, and whether
  biaxial arrives with uniaxial or later.
- **Whether the frame's state II and second-order theory call this machine.**
  ADR 0044 names its own expiry date; that it will be *this* tangent it consumes
  is likely, and is not decided here.
- **Serviceability, crack widths, creep.**
