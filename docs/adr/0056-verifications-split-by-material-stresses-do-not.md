# Verifications split by material, stresses do not

You look this one up when you wonder why there is no `concrete-stress` package,
why a verification result is not simply a number, or where the design locations
along a beam are decided.

> **`@baustatik/design-core` owns the verification vocabulary and knows no norm.
> The norm-bearing packages are one per material: `steel-design` (EN 1993),
> `concrete-design` (EN 1992), `timber-design` (EN 1995). A verification result
> is a discriminated union on `kind`, not a shared `{ Ed, Rd, eta }`. The
> National Annex stays a parameter, as it has been since
> [ADR 0002](0002-national-annex-via-factory-not-singleton.md). The composition
> root is `@baustatik/design-solver`, on the pattern of `createFEMSolver`.**

## The split sits above the mechanics, not through it

σ = N/A + My·z/Iy is the same equation for a steel plate, a timber beam and an
uncracked concrete section. Nothing in it is normative. Splitting it by material
means three copies of one formula, and they drift.

Normative is the comparison, and there the three have nothing in common. EN 1993
classifies the cross-section and then chooses between an elastic stress and a
plastic resistance, with buckling curves on top. EN 1992 asks for equilibrium of
a nonlinear section under strain limits
([ADR 0055](0055-the-cross-section-response-is-the-shared-machine.md)). EN 1995
multiplies by `kmod`, which depends on service class and load duration, both of
them already vocabulary in `@baustatik/material`.

Three chapters, three engines, and nothing shared beyond the words the answer is
given in.

## The result is a union

The temptation is one record: `Ed`, `Rd`, `eta = Ed/Rd`, done. It is wrong, and
the reason is what a printed calculation has to show.

| verification | what the answer actually is |
| --- | --- |
| steel, elastic | σv against fyd, at a named stress point |
| steel, plastic | the interaction value, and which of `N`, `V`, `M` governs |
| concrete, ULS | the equilibrium strain plane (εc, εs), and either a required `As` or "no equilibrium in the allowed range" |
| timber | the sum of the interaction terms, with the `kmod` that was used |

Flattening the third row into a quotient throws away the two numbers a reviewer
checks first. And "no equilibrium found" is not `eta > 1`. It is a different
outcome, and the difference matters, because one of the two can be fixed with
more reinforcement and the other cannot.

So `design-core` owns a union on `kind`. Lifted out is what is genuinely common
and nothing else: where the verification was made, which one it was, whether it
holds, and `eta` where an `eta` exists. That is the shape the repo already uses
for the report channel (`{ errors, warnings }`) and for the two variants of
`SectionGeometry`.

## The National Annex stays a parameter

[ADR 0002](0002-national-annex-via-factory-not-singleton.md) decided this once,
for the materials: the Annex goes into a factory, not into a singleton and not
into a package name. `createMaterials({ na })` is the shape.

`createSteelDesign({ na })` inherits it. There is no `en-1993-de` package and
there will not be one, because γM, the design situation and the material data
such a package would need all sit in `@baustatik/material` already. A package per
Annex means copying them, and copied safety factors are the worst kind.

## The composition root

`@baustatik/design-solver` is the counterpart of `createFEMSolver`: it holds the
wiring, and nothing else composes.

Its job is the one nobody else can do.

- Decide the design locations along the beam: the extrema of `N`, `V` and `M`,
  plus section changes and support faces.
- Pull the demand at each of them.
- Route to the material package that belongs to the beam's material.
- Collect the answers into one report.

The application composes nothing. That is the same reason `fem-solver` exists,
and the same reason the viewer pulls results instead of assembling them.

## The gap this exposes

Nothing in the repo forms `Ed`.

`@baustatik/actions` has the `ActionCategory` vocabulary and `@baustatik/fem-loads`
has the load cases, but the EN 1990 combination, `ΣγG·Gk + γQ·Qk1 + Σψ0·Qki`, is
written nowhere. Until it is, a design run either takes a hand-built combination
or verifies a single load case, and a single load case is not a verification.

It belongs before the design and not inside it, and it is cheap: `solveAll`
already computes every load case on one factorization
([ADR 0044](0044-solveall-bundles-the-load-cases.md)), so combining is arithmetic
on results. This ADR names the gap and does not fill it. The package that fills
it is its own decision.

## Consequences

- New package `@baustatik/design-core`: the verification union, the design
  location, the report. No norm, no material, no mechanics.
- `@baustatik/steel-design` first, `concrete-design` and `timber-design` later.
  Each depends on `design-core`, `material`, and the mechanics it needs:
  `cross-section-stress` for the elastic checks
  ([ADR 0054](0054-the-stress-is-the-numerator-and-lives-outside-cross-section.md)),
  `cross-section-response` for the plastic and nonlinear ones.
- `@baustatik/design-solver` as the composition root, depending on `fem-solver`
  for the demand and on the material packages for the checks.
- Order of construction: steel elastic first, because it exercises `design-core`
  and the design locations with the least mechanics behind it. Then plastic steel
  against a tabulated `Mpl`. Concrete last, because it adds the rebar geometry,
  the laws and the strain limits in one step.

## What this does not decide

- The combination package. Named above, not designed here.
- Stability. A buckling length is a property of the system, not of the section,
  and where it comes from is untouched by this decision.
- Whether the report is a data structure or a document. `design-core` produces
  the first. Anything that prints is a later question.
