# A chained joint is mitered — across a thickness jump too

You look this one up when the outline of a welded box or a welded angle comes
back with a **step at the outer corner** instead of a mitre, when `A` is short by
`t₁/2 · t₂/2` per corner, or when you wonder why the gate warns about a mitre cap
at a joint that looks almost straight.

> **A chained joint is mitered. Where the walls are collinear, the step is real.**

This extends [ADR 0037](0037-the-outline-comes-from-inflating-wall-runs.md); it
does not replace it. Everything about run decomposition, straightest
continuation and winding stays exactly as it was.

## Why now

ADR 0037 splits the offset path at every thickness jump, because Clipper2 takes
**one** `delta` per offset call, and it justifies the resulting figure for the
case it examined:

> Two **collinear** walls `t = 6` and `t = 10` then butt against each other, and
> that is the correct figure — the step is real.

Collinear. The case where the jump coincides with a **corner** was never
examined, and there the same split produces a figure nobody chose: both pieces
end butt, and the wedge between their outer edges is left out. Measured on the
angle in `apps/demo/cross-section/cross-section-viewer.ts` (flange `t = 8`, web
`t = 6`, 90°):

```text
before   A = 1548 mm²   … (-63,100) (-63,0) (-60,0) (-60,-4) (60,-4)
after    A = 1560 mm²   … (-63,100) (-63,-4) (60,-4)
```

The missing `t_web/2 · t_flange/2 = 12 mm²` is not a demo curiosity. **Every
welded box with `tf ≠ tw` has this joint at all four corners** and was silently
computing `A` and `Iy` too small — for `400 × 200`, `tf 20`, `tw 10` that is
`4 · 50 = 200 mm²`.

So the derivation already believed a rule — *a chained joint is mitered*; the box,
the tube and the angle all live off it — and the rule had a hole in it that came
from the library, not from the model. This ADR closes the hole instead of
documenting it.

## 1 · The outer contour at a joint is canonical, so nothing is warned

The alternative was a gate finding: *"chained joint with a thickness jump: the
outer corner butts instead of mitering"*. It was rejected, because a warning
claims that something is **undecided**, and nothing here is:

- The outer boundary is bounded by the two outer offset lines. Their
  intersection `M` is the single point that fills both bands **without reaching
  beyond either**. Less leaves a notch, more sticks out of a plate.
- The inner side needs nothing: the two bands overlap there, and the union
  already ends at the intersection of the inner edges.

There is nothing to decide, hence nothing to report. What does stay is
`MiterLimitExceededWarning` — capping a spike loses area, and that has been a
warning since ADR 0037.

**Only at chained joints.** The crotch of a Y stays open: there the material
really branches, and which two walls continue each other is decided by the
straightest continuation of ADR 0037, not by this decision.

## 2 · The fill is a ring with `delta: 0`

`Polygon.inflate` already unions everything it offsets, so the wedge enters
**that** union rather than a second boolean operation next to it — a second
library would mean a second rounding on the same figure.

```ts
{ polyline: { points: wedge }, delta: 0, endType: 'joined' }
```

`delta: 0` is the identity and is documented as such on `InflatePath`. The
wrapper skips Clipper2's offset call for it instead of relying on that library's
internal small-delta shortcut, whose threshold lives in scaled units this repo
does not control. An **open** run with `delta: 0` carries no area and is dropped.

The ring is turned into the winding of the offset results before the union:
`FillRule.NonZero` would let a counter-rotating ring *erase* what the offsets
set. That is not a breach of
[ADR 0034](0034-winding-is-mathematical-and-the-factory-does-not-normalise.md) —
`inflate` sets the winding of its **result** anyway, and the direction of an
input run has never meant anything in that door.

Two places now produce a mitre: Clipper2 within one path, `jointFills` at the
seam. The duplication is deliberate — rebuilding all joins by hand would move
every existing outline — and it is pinned by a **continuity test**: the same
corner with `t = 8/8` (Clipper2) and with `t = 8/8.000001` (fill) must agree.

## 3 · The cap is bounded by `miterLimit`, and the cut is ours

Two different things make a spike run away, and one bound catches both:

- **A sharp angle** — the classic case, `1/sin(α/2)` grows without bound.
- **A thickness difference at an almost straight joint** — two nearly parallel
  outer lines offset by `|t₁ − t₂|/2` meet far away *along the wall*, while `α`
  stays near `π`.

Therefore `overshoot` is **measured on the corner that gets built**
(`|NM| / (max(t)/2)`) instead of computed from `α`, and `chainedJoints` hands
that number to the gate. For equal thickness it is exactly `1/sin(α/2)`, so no
existing figure changes its warning; for the second case the gate stops being
silent about a cap it did cause.

Capping cuts **across the direction of the spike** at `miterLimit · max(t)/2`
from the node — not across the angle bisector, which would never meet a spike
that runs along the wall. The bound is Clipper2's, the cut is ours (a bevel where
Clipper2 squares). The difference is a sliver, and it only ever appears where the
gate already reports `MiterLimitExceededWarning`.

> **Amendment, 2026-08-13 — the sliver is not harmless, and the bevel has a
> floor.** The sentence above underrated the difference. Clipper2's square has a
> *fixed* width; our bevel shrinks as `miterLimit` approaches the joint's
> overshoot and goes to zero at the threshold. It does not disappear there:
> Clipper2 rounds to a `10^-6 mm` grid, so what remains is an edge of exactly one
> grid step. `mesh-2d-wasm` accepts that outline — it tests a zero-length edge on
> exact equality — and Triangle then meets a length ratio of `10^8` next to a
> `200 mm` edge, where the quality criterion cannot be met. Since a joint's
> overshoot moves continuously with the figure, dragging a node is enough to hit
> any fixed `miterLimit`.
>
> `fillRing` therefore **measures the bevel and keeps the full miter when it
> would be narrower than `arcTolerance`** — the chord tolerance the same outline
> is discretised with anyway, so a bevel below it is beneath the resolution in
> which the figure is described at all. Snapping goes *upward*, which is the
> continuous choice: the capped corner already tends to the full miter as
> `miterLimit` grows, and only the last, unrepresentable part of that path is
> skipped. The spike then stands less than `arcTolerance` further out than
> `miterLimit` allowed. `tests/outline-meshability.test.ts` holds the bound.
>
> **The gate is deliberately not adjusted.** Just above the bound it warns about a
> cap that no longer happens. It only ever promised "loses area there", and
> nothing is lost; making the condition agree would mean recomputing the bevel
> width in `validate.ts`, which is the duplication `chainedJoints` exists to
> prevent.
>
> **The policy field it compares against is renamed.** `arcTolerance` is now
> called `discretisationTolerance` (ADR 0033) — the chamfer keeps the full miter
> below that same chord tolerance. The constant keeps its name
> (`DEFAULT_ARC_TOLERANCE` stays). This ADR keeps the old name in the text; the
> decision it records is unchanged.

Two more details, both deliberate:

- **The fill starts inside the material**, `min(t)/2` behind the node, so it
  overlaps both bands instead of touching them. On an arc wall the discretised
  edge sits up to `arcTolerance` away from the tangent the fill is built on, and
  a gap of that size would be a notch in the result.
- **The union leaves collinear seam vertices** in the outline where a fill ring
  meets a band. They contribute nothing to `A`, `Iy` or `Iz`, and removing them
  would mean simplifying every outline — including the discretised arcs.

## Consequences

- **Values move**, and only where they were wrong: at a chained joint with a
  thickness jump and an angle. Every fixture in the repo that has a thickness
  jump is collinear, so nothing else changed. Recorded as `patch` per
  [ADR 0036](0036-release-policy-before-the-first-consumer.md), with the break in
  the changeset body.
- `ChainedJoint` carries `overshoot`; `validate.ts` no longer computes it.
- `MiterLimitExceededWarning` now refers to the **thicker** of the two walls.

## What this decision does not do

No change to the run decomposition, the chaining rule or the winding. No
fabrication detail — which plate runs through is not derivable, and the outer
contour does not depend on it. No fill at unchained ends (Y crotch, butt ends).
No simplification of outlines. No κ, no shear centre, no stress points.
