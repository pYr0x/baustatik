# The FE stress is a vector at a node

You look this one up when you wonder why the solid-section FE does not answer in
`StressAtPoint`, when a `Mt` throws on one side of the repo and is answered on
the other, or when someone proposes one stress record for both idealisations.

> **The FE stress recovery returns `τ_y` and `τ_z` at a MESH NODE, not a `tau`
> along a tangent. It therefore does not borrow `StressAtPoint` and does not
> depend on `@baustatik/cross-section-stress`. The two producers share σv as a
> formula, not as a type.**

Amends the one Consequences bullet of
[ADR 0054](0054-the-stress-is-the-numerator-and-lives-outside-cross-section.md)
that said `cross-section-fe` "depends on it for those types". Everything else in
ADR 0054 stands, and the sentence that matters most stands hardest: **the
idealisation is not a package boundary. The capability is.**

## The idealisation is not a package boundary — but it is a type boundary

ADR 0054 refused to cut a package per idealisation, and that was right: the two
producers differ by capability (closed form and synchronous against mesh,
factorization and a promise), not by which figure they serve. The step it took
one line too far was to conclude that they can therefore answer in the same
record.

τ is not the same quantity in the two theories.

| | thin-walled | solid FE |
| --- | --- | --- |
| what τ is | a signed flow along a **known** wall tangent | a **vector** at a place with no distinguished direction |
| where it lives | a numbered stress point on a wall element | a mesh node, transient, gone with the mesh |
| what identifies it | `nr` **and** `wall` (ADR 0059) | a node number of a mesh that is not serialized |
| does ν appear | no | yes, through `m = ν/(1+ν)` |

A shared record would have to carry `wall`, `ty`, `tz`, `tau`, `tauY` and
`tauZ`, with three of the six undefined on each side. That is the same argument
with which ADR 0054 already forbids the FE to invent `S` and `t`: they would be
made up in order to be cancelled a line later. `wall` and a tangent are exactly
as made up at a node in the interior of a solid figure.

So `@baustatik/cross-section-fe` owns `StressAtNode`, `StressAtElement` and
`FEStressField`, and it gains **no** dependency on `cross-section-stress`.

## What the two do share, and why sharing it as a formula is enough

σv = sqrt(σ² + 3·(τ_y² + τ_z²)) is written twice, once per package, and in the
thin-walled case the bracket has one term instead of two.

That duplication is cheaper than the coupling that removes it. σv is the von
Mises form of the Saint-Venant rod, where `σ_y = σ_z = τ_yz = 0`; it is four
operations, it is material-free, and it is pinned in both `CONTEXT.md` files. A
shared helper would put a `cross-section-stress` import into the package whose
whole point ([ADR 0047](0047-the-solid-section-fe-lives-in-its-own-package.md))
is that it can be checked by grep for what it does *not* import.

## ν now appears in two places, and ADR 0045's real claim survives

`AGENTS.md` said `fem-section-resolve` is "the only place ν enters".
[ADR 0045](0045-solid-section-values-are-nu-free-coefficients.md) is the reason,
and its argument is about the **record**: a cross-section carries no material,
so κ is stored as a ν-free coefficient pair and ν is substituted where geometry
meets material.

The stress recovery takes ν as a bare number, and it must: τ is affine in
`m = ν/(1+ν)`, and unlike κ it is not stored — it is evaluated for a known
material and thrown away with the mesh. Returning τ as a coefficient pair per
node instead would double every field and help nobody who wants to draw a
picture.

What ADR 0045 actually decided is untouched: **no ν stands in the section
values.** `FESectionValues` names no material, no grade and no ν, and
`SectionProperties` stays material-free.

`recoverStresses` takes no `Material`. In an elastic recovery on a homogeneous
section neither `E` nor `G` appears anywhere — the material contributes exactly
ν, and a dependency on `@baustatik/material` would be a package boundary crossed
for one scalar.

**ν is mandatory and guarded**: finite and in `[0, 0,5)`, or it throws. `ν = 30`
instead of `0,30` is a plausible typo, and at `ν = −1` `m` divides by zero. The
timber case (`ElasticModuli.nu === undefined`) is **not** solved here: without ν
there is no transverse shear field at all, and silently substituting `ν = 0`
would be an invented number inside a verification value.

## `Mt` is answered here and thrown next door

`cross-section-stress` throws `TorsionNotSupportedError`, because Bredt needs an
`Am` that `SectionProperties` does not carry, and because τ from open-profile
torsion is not constant across a wall — the assumption its stress point is built
on ([ADR 0057](0057-the-parametric-solid-section-has-no-stress-points.md)).

The FE has ω. `τ_T = (Mt_SV/It)·(ω,y − z, ω,z + y)` is the Saint-Venant field
itself, on the mesh that solved for it. Answering there and refusing here is not
an inconsistency; it is the capability difference ADR 0054 cut the two packages
along, showing up in the output for the first time.

**Saint-Venant only.** Warping torsion is out of scope. For a drawn open figure
with restrained warping that is the unsafe side, and it is stated in
`CONTEXT.md` rather than left unsaid.

## Equilibrium is closed over the Weber moment, not over the shear centre

`(Vy, Vz, Mt)` is the complete resultant of the shear stresses about the
centroid. A "shear force with an eccentricity" is that pair and nothing else; a
separate point of application would state the same information twice.

The bending shear field carries a moment of its own, and the remainder is
Saint-Venant:

```text
Mt_SV = Mt − ( Vz'·T_Z(m) − Vy'·T_Y(m) )
```

`T` is the **raw** moment of the solved unit field, `∫(y·τ_z − z·τ_y) dA`, which
`evaluate.ts` calls "the shear centre after WEBER". It is **not** `yM`/`zM`:
those are Trefftz, `torque − projection`, and ADR 0045 chose Trefftz for the
stiffness `G·It` for reasons that have nothing to do with this equilibrium.
Substituting them violates `∫(y·τ_z − z·τ_y) dA = Mt` by exactly `projection`,
and nothing throws.

The visible consequence: **`Mt = 0` is not a torsion-free case for an
unsymmetric figure.** A channel whose shear force runs through the centroid
twists. The FE door delivers that share; `cross-section-stress` does not, and
cannot.

## Two shapes out of one pass, and neither is the maximum

`FEStressField` carries `nodes` and `elements`.

`elements` is the raw picture: one value per element, at the element centroid,
unsmoothed. `nodes` is the **verification shape**: area-weighted from the
element values at that node, and it carries the boundary.

Element centres are not smoother, they are coarser — one facet per triangle.
They are pointwise more accurate, because the gradient of a C0 field is better
in the interior than at the corners, and they **never lie on the boundary**, so
they systematically understate the maximum. That is why `nodes` is the
verification shape, and why both come out of one pass: two doors would be two
passes and the opportunity to call them with different ν.

Extrapolating from Gauss points after Zienkiewicz–Zhu is **rejected**: a
least-squares problem per node patch, for a gain that the averaging already
mostly takes.

**There is no maximum and no governing point**
([ADR 0056](0056-verifications-split-by-material-stresses-do-not.md)). Which node
is a verification point depends on the verification and belongs to the design
location. Nothing is filtered and nothing is capped — including the node at a
reentrant corner, where τ is genuinely singular in the **continuous** solution
(`τ ~ r^(−1/3)`) and the nodal value grows with every refinement. It is **named**
instead, in the diagnostics, together with the node numbers of the worst jump
and the worst boundary traction. Without those numbers next to them, the two
ratios read like a bug at a figure with an inner corner — they do not converge
there, because the singular node dominates them — and somebody starts repairing
the averaging.

## Rejected

- **Widening `StressAtPoint` by `wall?`, `tauY?`, `tauZ?`.** Every field
  optional means every consumer branches on which producer answered, which is
  the coupling the shared type was supposed to remove.
- **Zienkiewicz–Zhu superconvergent patch recovery.** See above.
- **A selectable beam axis as a cross-section field.** It needs an N–M coupling
  in `SectionStiffness` that does not exist; as long as it is missing, the beam
  axis **is** the centroid. That is a decision at the beam element.
- **Projecting out the boundary traction.** `τ·n = 0` holds exactly on a free
  boundary and the FE satisfies it only weakly. Removing the normal component
  would look right and be invention; it is measured and reported instead.

## Consequences

- `@baustatik/cross-section-fe` gains a second door,
  `recoverStresses(fields, forces, nu)` — pure and synchronous — and owns
  `FEStressField`, `StressAtNode`, `StressAtElement` and `FEStressDiagnostics`.
- It gains a dependency on `@baustatik/section-forces` and **none** on
  `@baustatik/cross-section-stress` or `@baustatik/material`.
- `FEComputation` becomes a `kind`-discriminated union (`'refused'` |
  `'solved'`), because the solved arm now carries `fields` alongside the mesh
  and both are absent before meshing. Breaking change. It is **not**
  discriminated on `state.status`: `fe-section-values.ts` carries an optional
  `It` in its `unsupported` arm precisely because a refusal after meshing can
  come back, and a union on `status` would rule that case out.
- The fields are transient exactly like the mesh
  ([ADR 0039](0039-meshing-is-a-transient-worker-capability.md)): not in the
  record, not serialized.
- Units change at this door and only at this door. The mesh is metres, the
  computation is SI, and the output is **MPa and mm** — a strength is printed in
  MPa ([ADR 0024](0024-units-at-the-package-boundary.md)). The section-value
  part (`It`, `yM`, `zM`, κ) stays SI. `CONTEXT.md`'s sentence "SI in, SI out"
  loses its second half.
- `@baustatik/cross-section` gains nothing and loses nothing. `stressPoints()`
  still answers `undefined` for `kind: 'section-geometry'`, and the FE still
  produces no `StressPoint`.
- `AGENTS.md` corrects the ν sentence: `fem-section-resolve` remains the only
  place where geometry is multiplied by a material; it is no longer the only
  place ν appears.

## What this does not decide

- Which node is a verification point. That is the design location (ADR 0056).
- Drawing the field. That is a step at `cross-section-viewer`, and a fourth
  optional pull there is still undecided (ADR 0054).
- The ellipse as the one oracle with `ω ≠ 0` against a closed solution. It is
  named as an open proof site in `CONTEXT.md`, not built here.
