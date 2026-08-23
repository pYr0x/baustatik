# The parametric solid section has no stress points

You look this one up when a rectangle or a `solid` T stops returning stress
points, when you wonder why κ keeps its Grashof approximation while the points
are gone, or when someone proposes to fill the gap with a template "until the FE
is ready".

> **A stress point is a cut model. `t` and `S` are the denominator of
> `τ = V·S/(I·t)`, and that formula assumes the shear flows along a wall and is
> constant across the cut. A solid section satisfies neither assumption, so
> `stressPoints` returns `undefined` for every parametric shape with
> `idealisation: 'solid'` and for `rectangle`, which carries no `idealisation`
> because it *is* the solid case. The parametric input is a convenience for
> entering a drawn figure — and the drawn solid figure answers with the FE.**

Amends [ADR 0029](0029-stress-points-follow-the-idealisation.md), which said the
outline model was "not a stopgap" for `solid`. The half of ADR 0029 that
survives is the one that matters: `idealisation` is still the **one** switch, and
it still steers κ and the stress points together. It just has nothing left to
choose on the `solid` side.

## What was there, and why it was not wrong

`stress-points/compact.ts` plus `stress-points/outline.ts` were the **outline
model**: a horizontal cut through the full figure at every height, `S` from the
material above it, `t` the total width there. That is Grashof, and within its
own assumptions it computes correctly — the rectangle parabola falls straight
out of it, the tests held it against hand-computed values at every free edge.

Removing it is not a bug fix. It is a decision about **which question the
parametric branch is allowed to answer**.

## The argument: one figure, one machine

The parametric shapes are not a separate kind of cross-section. They are a
**shorthand**: a rectangle is four numbers instead of four corner points, a T is
four numbers instead of a drawn outline. The user picks them because typing
`b` and `h` is faster than drawing, not because the mechanics differ.

The drawn solid figure gets its shear from the 2D FE
([ADR 0045](0045-solid-section-values-are-nu-free-coefficients.md),
[ADR 0047](0047-the-solid-section-fe-lives-in-its-own-package.md)), and its
stresses will come from the solved warping fields
([ADR 0054](0054-the-stress-is-the-numerator-and-lives-outside-cross-section.md)).
If the shorthand answered from Grashof instead, the **same figure** would give
two different numbers depending on how it was entered. That is the exact defect
ADR 0029 removed inside the package, one level up.

## The measurement that decides it

The gap is not a rounding difference. Grashof carries **two** approximations:

- it is ν-blind, and
- it assumes τ is constant across the cut width — and where the width jumps, at
  the flange/web junction of a T, `t` steps by `bf/bw`.

Measured on κ against the FE, at four T figures with 20000 Tri6 elements each,
Grashof comes out **+11 % to +134 %** too stiff:
[`docs/messungen/t-querschnitt-grashof-gegen-fe.md`](../messungen/t-querschnitt-grashof-gegen-fe.md).
For the rectangle the same comparison is 0.08 %, which is precisely why keeping
the rectangle would have been the most misleading case to keep: it would set the
expectation that the whole branch is that accurate.

The stress point is built on the *same* two assumptions as that κ, and it is
worse off than κ in one respect — see below. A number that a verification
prints, stamps with a point number and compares against a strength has to be one
we can defend. "Right within Grashof" is not that, when the same package
computes the exact answer next door.

## Why κ keeps Grashof and the points do not

The obvious objection: the measurement above is about **κ**, and κ stays. If
Grashof is not good enough for τ, how is it good enough for κ?

It is not, and the ADR does not claim it is. That gap stays open and stays
recorded (ADR 0045/0047, `packages/TODO.md`); the way out is the same one this
decision points at — the parametric solid figure goes through
`@baustatik/cross-section-fe`. What differs is what can be done **today**:

- **κ must exist.** Without it the beam has no shear stiffness and there is no
  analysis at all. Dropping it does not yield "no answer", it yields
  shear-rigid, which is a *different* model silently substituted — the very
  thing this ADR refuses. So the approximation stays until the FE replaces it.
- **A stress point need not exist.** `undefined` is already the contract of this
  door, the drawn geometry has always used it, and every caller handles it.
- **κ is an energy average over the whole section; a stress point is a local
  claim** at exactly the place where the constant-τ assumption fails hardest —
  the width jump. It is the sharper claim of the two, made in the worse spot.

So `undefined` is not a second machine standing next to Grashof. It is the
absence of an answer, and the absence of an answer is honest in a way that a
plausible-looking wrong number is not.

## What this costs, stated plainly

Between this decision and the FE stress recovery, a `solid` parametric section
has **no** stress output at all. There is no partial answer in between. That is
deliberate: an interim template is the thing this ADR exists to prevent, and its
number would have looked exactly as trustworthy as the final one.

Section values are untouched. `A`, `Iy`, `Iz`, `Iyz`, `ys`, `zs`, κ and `It`
answer exactly as before for every shape.

## Consequences

- **`stress-points/compact.ts` and `stress-points/outline.ts` are deleted**,
  with their tests. `OutlinePart`, `momentBefore` and `widthAt` go with them;
  `Part` in `calculation/shear.ts` stays, because κ still uses it.
- **`open-stations.ts` and `hollow-stations.ts` stay** and keep their numbering.
  They now have one reader instead of two, and their contract is with the
  printed report (`rolled-i.ts`), not with a second template.
- **The rolled catalogue profile keeps its 13 points.** It is a cut model with a
  fillet, not a solid figure: flange and web are walls, and its template is
  validated against 546 reference points.
- **No schema change.** `idealisation: 'solid'` remains a valid, mandatory
  field with unchanged meaning for κ and `It`; only the stress-point answer
  moves. A stored model neither breaks nor needs migrating.
- **The demo pages that printed the outline model now show `undefined`** with
  the reason, which is the state of the art the app should communicate.
