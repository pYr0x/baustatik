# The cross-section response is the shared machine

You look this one up when you ask why concrete does not go through the stress
package, where `Mpl` is supposed to come from, or what the frame will need the
day it learns state II.

> **The operation steel and concrete share is not the stress. It is the map from
> a strain plane `(ε0, κy, κz)` to the section forces `(N, My, Mz)`, and its
> inverse. That map lives in `@baustatik/cross-section-response`. The material
> law σ(ε) enters as a port, so the package stays free of norms, partial factors
> and strengths. The elastic point evaluation of
> [ADR 0054](0054-the-stress-is-the-numerator-and-lives-outside-cross-section.md)
> is the special case where the map is linear and only the extreme fibres are
> asked for.**

## Why the stress is the wrong shared layer

An earlier sketch of the design chain put "the stress" in the middle and hung the
material packages off it. That works for exactly one verification, the elastic
stress check of a steel section. Two of the three that matter do not fit through
it.

**Concrete at ULS is not compared as a stress at all.** The section forces come
in, the nonlinear laws are integrated over the section, and what is sought is a
strain plane in equilibrium with them, inside the allowed strain limits. Whether
σ somewhere reaches fcd is a result of that, not the question.

**Plastic steel is the same problem with a different law.** `Npl`, `Mpl` and
their interaction are the resultants of a rigid-plastic strain state, not a
stress read at a point.

So the layer everything shares sits one level below the stress. It is the
integration itself.

## One machine, three laws

| law | what the map degenerates to | who asks |
| --- | --- | --- |
| linear elastic | a matrix whose entries are `EA` and `EI` | the frame, today |
| rigid-plastic | `Npl`, `Mpl` and the interaction fall out | `steel-design` |
| Parabel-Rechteck plus bilinear rebar | Newton on two or three unknowns, with strain limits | `concrete-design` |

The first row is worth pausing on. `@baustatik/fem-section-resolve` computes that
matrix today, and
[ADR 0020](0020-section-properties-versus-section-stiffness.md) already separated
`SectionProperties` from `SectionStiffness` along exactly this line. The elastic
case is not something this package adds. It is the case the repo has been
computing all along, and seeing it as one row of a table is the argument that the
table is the right object.

## The law is a port

`fcd = αcc·fck/γC`, `εcu2 = −3,5 ‰`, `fyd = fyk/γS`: every number in a material
law is normative. If they live inside the package, it is a norm package wearing a
mechanics name, and the next National Annex edits the integrator.

So the law is handed in, on the pattern this repo uses for every external
capability ([ADR 0009](0009-fem-solver-ports-and-async-solve.md)) and most
recently for the linear solver
([ADR 0043](0043-the-solver-is-an-analysis-setting.md)). `concrete-design` builds
the σ(ε) curves from `@baustatik/material`'s design values and passes them,
`steel-design` passes the plastic law, and the package integrates whatever it is
given.

What that buys is a suite that can be read without a code sheet next to it: a
rectangle under a linear law must reproduce `EA` and `EI` in closed form, and the
same rectangle under a rigid-plastic law must reproduce `Mpl = b·h²/4·fy`. Both
are checkable by hand, and neither needs a norm.

## The reinforcement is composed, not added

A rebar layer has a position and a material. The position is geometry in mm. The
material is a strength, and `cross-section` may not know one
([ADR 0054](0054-the-stress-is-the-numerator-and-lives-outside-cross-section.md)
keeps that rule greppable).

So there is no new field on `CrossSection`. This package defines
`ReinforcedSection = { section, layers }`, where a layer carries its position,
its `As` and a reference to its material, and the law behind that reference
arrives with the other laws.

The ideal section values of state I, where the rebar raises `A` and `I` through
`n = Es/Ecm`, are a different question with a different owner. That is a
stiffness, so it belongs to `fem-section-resolve`, the one place in the repo
where geometry is multiplied by material
([ADR 0045](0045-solid-section-values-are-nu-free-coefficients.md)).

## The frame needs this too

`solveAll` assembles and factorizes once for all load cases, and `AGENTS.md`
already records the expiry date of that invariant: it "expires with second-order
theory or state II" ([ADR 0044](0044-solveall-bundles-the-load-cases.md)).

When it expires, what the frame needs per iteration is the tangent of the section
response at the current strain plane. That is the same return value the Newton
step inside this package computes anyway. Building it for concrete is not a
detour around the frame. It is the piece the frame is missing.

## The name is a bet, and here is the exit

`cross-section-design` was the obvious alternative and was rejected. The package
must not know a norm, and a name that says `design` will not hold that line for
long. Two packages called `*-design` at different layers, one norm-free and one
norm-bearing, is a confusion nobody untangles afterwards.

The bet is that the port holds: that the strain limits and the side conditions
travel with the law instead of settling into the iteration. If they do not, if
`concrete-design` ends up reaching inside the Newton loop, then the package is
norm-bearing in fact and `cross-section-design` becomes the honest name. Rename
it then, and cite this paragraph instead of inventing a reason.

## What this does not decide

- **Concrete shear.** The Fachwerkmodell of EN 1992 6.2 is not a strain-plane
  problem, no integration over the section answers it, and it belongs to
  `concrete-design` end to end. Worth saying out loud, because "the concrete
  package" invites the assumption that everything concrete flows through here.
- **The search for `As`.** That is an outer loop over this machine and belongs to
  `concrete-design`, together with which strain range is aimed for.
- **Which Newton, which start value, and whether biaxial arrives with uniaxial or
  later.**
- **Serviceability, crack widths, creep.** Different laws, and whether they are
  the same map with different laws or a different map is left open on purpose.

## Consequences

- New package `@baustatik/cross-section-response`, `0.0.x`
  ([ADR 0036](0036-release-policy-before-the-first-consumer.md)). Depends on
  `core`, `cross-section`, `errors`, `section-forces`, `units`.
- It owns `StrainPlane`, the layered section record, the material-law port, the
  forward integration, the inverse solve and the tangent.
- It shares `@baustatik/section-forces` with `cross-section-stress` rather than
  defining a second record. That leaf exists for this reason.
- `steel-design` reaches it for the plastic resistances. `cross-section-stress`
  does not depend on it and is not built on it. Two doors, one level.
- No norm, no partial factor and no strength appears in `src/`. Same rule as the
  neighbour package, same grep.
