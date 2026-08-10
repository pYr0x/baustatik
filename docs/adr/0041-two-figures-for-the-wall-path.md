# Two figures for the wall path: κ takes `I` from the outline, the shear centre from the wall model

The second P5 decision, and it has its own file because the question has its own
chain of reasoning and has to be **findable** when someone next wonders which
`Iy` a number was divided by.

> **`S` always comes from the wall model. `I` does not: κ divides by the `I` of
> the outline figure, the shear centre by the `I` of the wall model.**

| Quantity | `S` from | `I` from | bound to |
| --- | --- | --- | --- |
| κ | wall model | **outline figure** | the outside |
| `yM`/`zM` | wall model | **wall model** | the inside |

This is a decision inside [ADR 0040](0040-the-wall-path-is-positioned.md), not a
qualification of it.

## The two figures

A drawn `midline` cross-section has **two** areas, and they are not the same
number:

- The **outline figure** — the walls inflated by `t/2` and unioned, the polygon
  that travels in the record. `A`, `Iy`, `Iz`, `Iyz`, `ys`, `zs` fall out of it
  by Green ([ADR 0035](0035-the-editor-section-yields-values-without-kappa.md)).
- The **wall model** — line elements times `t`, without the `t³/12` self term.
  This is the figure the shear flow runs along.

For a doubly symmetric I the difference is a couple of per cent in `Iy`, and the
centroids coincide; for a T they do not even coincide.

## Why κ is bound outward

Because κ is **checked against the world**. The whole κ machinery of this
package exists to reproduce the IPE and HEA series
([ADR 0021](0021-section-values-separate-from-tabulated-profiles.md)), and RSTAB
computes `A_s = I²/∫(S/t)² dA` with `I` of the **outline** figure while running
`S` along the centrelines. That mixture is not an accident of ours: it is what
the tabulated `Az` was produced with, and it is what
`shapes/t-section.ts` and `shapes/i-symmetric.ts` have been doing since long
before P5 — `thinPaths` builds `S` on the centrelines, `toProperties` divides by
the closed-form `Iy` of the outline.

Changing that for the drawn section would mean the same steel profile gets one κ
when it comes from the catalogue and a different one when someone draws it. The
drawn wall graph must land on the shape's number, and a test pins exactly that.

## Why the shear centre is bound inward

Because `∫S·u_z ds = −I` holds for **one** figure, and the shear centre's
derivation is nothing but that identity read sideways.

The moment of the shear flow about the origin is

```text
T = ∮ q·r ds ,   q = −V_z · S_y / I_y
```

and `T = y_M · V_z` requires that the resultant of `q` actually **is** `V_z`.
That resultant is `−(V_z/I_y)·∫S_y u_z ds`, and it equals `V_z` precisely when
`S_y` and `I_y` come from the same figure. Mix them and the resultant becomes
`V_z · I_wall/I_outline` — the flow no longer carries the force it is supposed
to carry, and `y_M` is off by that ratio. For an IPE 300 that is about **2 %**,
which is exactly the size that looks like a plausible number and is not one.

The same identity is what makes the result **origin-independent**: shift the
coordinate system and `y_M` shifts with it, but only because
`∫S u_z ds = −I` and `∫S u_y ds = 0` hold on the one figure. So the invariant of
[ADR 0031](0031-the-cross-section-plane.md) — *`yM`/`zM` live in the same system
as `ys`/`zs`* — is not a convention here, it is a consequence.

## The wall centroid is internal and never published

`S` is accumulated about the centroid of the **wall model**, in both directions.
It has to be: about any other point the path would not close to zero at the free
ends, and `S` would be ambiguous depending on which side you cut from.
`shapes/t-section.ts` has carried this as a one-off (`tSectionWall`) since
[ADR 0029](0029-stress-points-follow-the-idealisation.md); with P5 it holds for
every drawn cross-section.

`ys`/`zs` in `SectionProperties` remain the centroid of the **outline**.
`wallMoments` is not exported as a value of the section — it is a computational
figure, and publishing it would create a third coordinate system nobody asked
for.

## What is knowingly inconsistent, and why that is fine

κ mixes figures. That is, on its face, less pure than the shear centre. It stays
because the mixture is the *external* contract and purity here would break
agreement with the catalogue — and because the error it carries is bounded and
known: the two figures differ in `I` by the `t³/12` terms and the overlaps at
the joints, a few per cent, and `Az` in the tables is systematically a little
low anyway (`cross-section/CONTEXT.md` records the 0,05 % … 4,6 % band).

The shear centre has no external contract to honour, so it gets the consistent
answer.

## Consequences

- `wallMoments` (`src/segment.ts`) exists and returns `{ A, ys, zs, Iy, Iz, Iyz }`
  of the wall model — line elements times `t`, without `t³/12`.
- `wallPath` takes the outline figure as a parameter (`OutlineFigure`) rather
  than deriving it: the outline is the one that travels in the record, and
  re-deriving it on the calculation path would be the second opinion ADR 0030
  removes.
- The T wall graph reproduces `tSection`'s κ **and** its `zM = hf/2` — the same
  figure answering both, which is the sharpest evidence that the split is drawn
  in the right place.

## What this decision does not do

It does not change any existing value: the parametric shapes already computed
this way, and the catalogue branch never had a wall model. It says nothing about
stress points, which follow `idealisation` under ADR 0029 and read their own
templates.
