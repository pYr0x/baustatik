---
'@baustatik/cross-section': patch
---

`jointFills` no longer cuts a chamfer narrower than `discretisationTolerance`

The miter fill of [ADR 0038](../docs/adr/0038-a-chained-joint-is-mitered-across-a-thickness-jump.md)
emulated Clipper2's cut with a chamfer between the two outer edges. Clipper2's
own cut is a *fixed* square; ours shrank as `miterLimit` approached the joint's
overshoot, and went to zero at the threshold. It never quite vanished — Clipper2
rounds to a `10^-6 mm` grid — so the derived outline carried an edge of exactly
one grid step next to edges of `200 mm`.

That outline is still an admissible PSLG: `mesh-2d-wasm` tests a zero-length
edge on exact equality, so it accepts the figure and hands Triangle a length
ratio of `10^8`, where the quality criterion cannot be met. The hazard is
reachable by dragging a node, not just by typing a `miterLimit`: a joint's
overshoot moves continuously with the figure.

`fillRing` now measures the chamfer and keeps the full miter when it would be
narrower than `discretisationTolerance` — the same chord tolerance the outline is
discretised with anyway. Snapping goes *upward*, to the full miter, which is
the continuous choice: the cut corner already tends to the full miter as
`miterLimit` grows, and only the last, unrepresentable part of that path is
skipped. The spike then stands less than `discretisationTolerance` further out than
`miterLimit` allowed.

Measured on the triangle with the tip pointing down (`tests/outline-meshability.test.ts`,
new): the shortest edge over `miterLimit` in `[1.001, 10]` rises from
`1.0·10^-6 mm` to `5.2·10^-2 mm`.

The gate is deliberately left alone. Just above the bound it now warns about a
cut that does not happen; it only ever promised "loses area there", and nothing
is lost. Making the condition agree would mean recomputing the chamfer width in
`validate.ts` — the duplication `chainedJoints` exists to prevent.
