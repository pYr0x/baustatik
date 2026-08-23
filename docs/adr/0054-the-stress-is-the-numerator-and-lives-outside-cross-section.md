# The stress is the numerator and lives outside cross-section

You look this one up when you want to know where `sigma` is computed, when the
drawn solid section answers from a different package than the rolled profile, or
when someone proposes one package per idealisation.

> **σ and τ are computed in `@baustatik/cross-section-stress`, out of the section
> values, the stress points and a set of section forces.
> `@baustatik/cross-section` keeps supplying the denominator and never the
> numerator. The stress recovery of the drawn solid section stays in
> `@baustatik/cross-section-fe`, where the mesh and the solved warping fields
> already are. The idealisation is not a package boundary. The capability is.**

## The decision was already written down, only not built

`packages/cross-section/src/stress-points/types.ts` carries it in the type's own
JSDoc:

> DIESES PACKAGE RECHNET DIE SPANNUNGEN NICHT. Es liefert den NENNER, `t` und
> `S`, und die Koordinaten.

and `CONTEXT.md` states the rule that follows, under "Die Grenze zur Bemessung,
mechanisch pruefbar": no symbol in the package knows a section force or a
strength. No `N`, no `My`, no `fy`, and therefore no `normalStress`.

Nothing here revises that. What was missing is the other side of the boundary. A
rule with nowhere to send the excluded thing does not survive contact with the
first caller who needs a stress.

## Why the rule earns a package and not a folder

The rule is worth keeping because a reviewer can check it without reading
anything: grep the package for `fy` and for `My`.

A folder `cross-section/src/stress/` would end that. The first function there
takes a section force, the second reaches for `sectionProperties` directly
instead of through the barrel, and the third gets asked to compare against `fyd`
because everything it needs is already in scope. Nothing stops any of the three
except somebody remembering.

That is the argument that built `cross-section-fe`
([ADR 0047](0047-the-solid-section-fe-lives-in-its-own-package.md)). The point
there was never that the FE is large. It was that `cross-section` then stays free
of WASM by construction instead of by discipline.

## The idealisation is not the boundary

The obvious alternative is two packages, one for the thin-walled stress and one
for the solid one. It is the wrong cut, twice over.

**The idealisation is already answered inside the model.** `SectionGeometry`
carries it, [ADR 0029](0029-stress-points-follow-the-idealisation.md) made it
steer κ and the stress points together, and `stressPoints()` returns `undefined`
for the drawn geometry. That `undefined` is the seam. It says "there is no
template here, ask the FE", and a package boundary on top of it would restate in
the file system what the type says already.

**The split this repo makes is by capability.** Thin-walled stress is closed
form, synchronous, and testable against a hand calculation. Solid stress needs a
mesh, a factorization and a promise. That difference is real, and it already has
a package.

## The stress recovery stays where the mesh is

τ of the drawn solid section falls out of the warping fields that
`cross-section-fe` solves for. The mesh is transient
([ADR 0039](0039-meshing-is-a-transient-worker-capability.md)): it does not enter
the record and it is not serialized.

A third package would therefore have to be handed the mesh together with the
solution, or solve the system a second time. The first makes a transient object
public API. The second computes one factorization twice and gives the picture and
the number two chances to disagree. Both are worse than a second door in the
package that already holds all of it.

`cross-section-fe` gains a dependency on `cross-section-stress` for the result
vocabulary, so both producers answer in the same words. No cycle:
`cross-section-fe` depends on `cross-section` already.

## The input record is not the frame's `SectionForces`

`SectionForces` in `@baustatik/fem-element` is `N`, `V`, `M`, the three of the
plane frame. The stress points already carry `Sz` next to `Sy`, so the templates
answer a `Vy` the plane frame cannot deliver, and `Mz` and `Mt` are the same
story.

Taking the frame's triple would make the step to a spatial frame a breaking
change at the one place every stress in the program passes through. So the
general record gets a **terms-only leaf package**, `@baustatik/section-forces`:
`N`, `Vy`, `Vz`, `My`, `Mz`, `Mt`, the sign convention in JSDoc, no dependency
and no function. `@baustatik/actions` is the precedent, and its entry in the
repository map says the same thing about itself: "Terms only."

A leaf rather than ownership by one of the consumers, because there will be
several and none of them should have to depend on a sibling to name a moment.

**The name collides with `fem-element`'s local type, and this ADR does not
resolve it.** The plane frame's `SectionForces` is the three-component subset.
Merging the two is a change across the whole frame path and needs its own
decision. Until then they live in different packages and the import says which
one is meant.

## Units: one conversion, in this package

The two inputs do not speak the same language, and neither is wrong.

| | unit | why |
| --- | --- | --- |
| `SectionProperties` | m², m⁴, m | `fem-section-resolve` multiplies with `E` in kN/m² |
| `StressPoint` | mm, `S` in cm³ | what the printed calculation shows, and what the reference fixture holds |

`S` in cm³ times `V` in kN over `Iy` in m⁴ produces a number that looks entirely
plausible and is off by a power of ten. That is the failure mode
`stress-points/types.ts` already warns about for the factor of a thousand inside
`cross-section`, and it does not become less likely across a package boundary.

So: one entry conversion per source, one exit unit, and the exit unit is MPa,
because that is the unit a strength is compared in
([ADR 0024](0024-units-at-the-package-boundary.md)).

## What the package computes, and what it inherits

σ from `N`, `My`, `Mz`. τ from `Vy` and `Vz` over `S` and `t`. The comparison
value σv = sqrt(σ² + 3τ²).

Two details are not free:

- **The bending term carries `Iyz`.** The drawn geometry produces one, and
  `cross-section` publishes `Iyz`, `alpha`, `Iu` and `Iv` precisely so somebody
  can use them. A formula that assumes `Iyz = 0` is correct for every parametric
  shape and wrong for the case the section editor exists to serve. Whether the
  package evaluates in the principal axes or with the full `Iy·Iz − Iyz²`
  denominator is its own choice; the sign convention is pinned in its
  `CONTEXT.md`, not here.
- **τ is constant across the cut width.** That is the assumption the stress
  points are built on, `cross-section`'s `CONTEXT.md` states it, and this package
  inherits it rather than repairing it. The repair is the FE, and it lives
  elsewhere.

## This is not the general layer

It is tempting to read this package as the middle of the whole design chain. It
is not, and
[ADR 0055](0055-the-cross-section-response-is-the-shared-machine.md) says why:
the shared operation is the strain plane and its equilibrium, and the elastic
point evaluation is the special case where the map is linear and only the extreme
fibres are asked for. Concrete never comes through here, and neither does the
plastic steel resistance.

The package is called `stress` and not `design` for that reason.

## Consequences

- New package `@baustatik/cross-section-stress`, in the `0.0.x` band
  ([ADR 0036](0036-release-policy-before-the-first-consumer.md)). Depends on
  `cross-section`, `errors`, `section-forces`, `units`.
- New leaf `@baustatik/section-forces`, terms only, no dependencies.
- `cross-section-stress` owns `StressAtPoint` and σv.
  `@baustatik/cross-section-fe` depends on it for those types and gains a second
  door for the FE recovery, returning per node alongside the mesh, transient like
  everything else there.

  > **Amended by [ADR 0061](0061-the-fe-stress-is-a-vector-at-a-node.md) — this
  > bullet only.** The second door exists and returns per node, transient. What
  > is withdrawn is the borrowed type: τ at a mesh node is a **vector** with no
  > distinguished direction, so the FE owns `StressAtNode` and takes **no**
  > dependency on `cross-section-stress`. The two share σv as a formula, not as
  > a type. The rest of this ADR — above all "the idealisation is not a package
  > boundary, the capability is" — stands unchanged.
- `@baustatik/cross-section` gains nothing and loses nothing. Its rule stays
  greppable, and that is the point of the whole decision.
- `cross-section-viewer` can pull a stress field later through a fourth optional
  pull, on the pattern of `getStressPoints` and `getFEMesh`. Not decided here.

## What this does not decide

- The plastic section resistances and the cross-section class. Those are
  ADR 0055 and
  [ADR 0056](0056-verifications-split-by-material-stresses-do-not.md).
- Which section forces get checked, and where along the beam. The design
  locations belong to the composition root in ADR 0056.
- Any comparison at all. Nothing in this package knows a strength.
