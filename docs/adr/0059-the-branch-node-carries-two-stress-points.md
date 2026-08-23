# The branch node carries two stress points

You look this one up when the I-section suddenly has 15 points instead of 13,
when a stress point number no longer lines up with the printed catalogue sheet,
or when you go looking for the `branched` flag and cannot find it.

> **A stress point lies on a WALL ELEMENT, not on a cross-section. The point
> carries the id of its element (`wall`), and every point carries exactly ONE
> value of `Sy` and one of `Sz`. Where two elements meet at a branch node, the
> node carries TWO points — same coordinate, same `t`, different element,
> opposite tangents. The flag `branched` is gone; there is nothing left for it
> to say.**

Amends [ADR 0058](0058-the-stress-point-carries-a-wall-tangent.md) in two
places. Its central statement — the point carries a tangent, and the sign is
computed from it — stands unchanged.

## The printed sheet is coherent after all

ADR 0058 claimed the rolled profile's catalogue sheet contradicts itself: `Sy`
counted from the nearest free tip, `Sz` continuously from the left, two
directions at one point. That is wrong, and the fixture proves it. All 13
printed values of `tests/fixtures/rolled-i-stress-points.json` (IPE 80) fall out
of ONE rule:

> Every wall is an element, oriented along the shear flow of a positive `Vz`.
> `S` is the first area moment of the part already traversed in that direction.

Four flange elements, one web:

| Element | runs | from | to |
| --- | --- | --- | --- |
| top flange left | `+y` | free tip | node |
| top flange right | `−y` | free tip | node |
| web | `+z` | top node | bottom node |
| bottom flange left | `−y` | node | free tip |
| bottom flange right | `+y` | node | free tip |

The top flange elements begin at a free tip, so what is traversed is the near
outstand. The bottom flange elements begin at the node, so what is traversed is
everything *else* — and the first area moment of a complement is the negative
of the part's, because the whole section's vanishes. Both give the same closed
form:

```
Sy = −zf · t · (b/2 − |y|)        at every one of the twelve flange stations
Sz =  ty · t · (y² − (b/2)²)/2    ty is the element's tangent
```

The magnitudes were never in doubt. The signs now match the sheet at all 13
values, including points 4, 7 and 8, where the package deviated under ADR 0058.
That deviation was the evidence: those are exactly the three stations whose
element runs in the *opposite* direction from the global `+y` the package used.

**Where the source is coherent we follow it.** It is coherent. It is simply
written per element rather than per cross-section — which is what RSTAB shows
under "Elemente + Spannungspunkte", and what an overview with one value per node
collects back up.

## Why the flag cannot stay

`|q| = |Vz·Sy/Iy| + |Vy·Sz/Iz|` is exact **as long as the two branches are `+S`
and `−S`**. That holds only under mirror symmetry about the `z` axis. At a node
with unequal branches the two values are two independent numbers with
`S₁ + S₂ = S_in`, and the magnitude formula evaluated on the stored branch can
then UNDERSTATE the other one.

The three templates are symmetric, so the flag is not wrong today. But it
carries its validity in a precondition it never states and no reader can check.
Two points per node have that problem in no topology at all.

## Where the two-valuedness went

It did not disappear, it moved — and that is the whole point of naming the
element.

| | at the node |
| --- | --- |
| ADR 0058 (one direction `+y` per cross-section) | `Sy` flips, `Sz` runs through |
| element convention | `Sy` single-valued, `Sz` flips |

Both flange elements arrive at the node with the same `Sy` (`−zf·t·b/2`) and
opposite `Sz` (`∓t·(b/2)²/2`). The two points state it directly instead of one
point declaring a flag. A reader that wants the worst case at that location
takes the maximum over the two points, which is an ordinary maximum over a list
and needs no special case.

## What it costs

The numbering. It now falls out of the traversal order and is no longer promised
against the printed sheet anywhere: the I has 15 points, the T has 10, the box
still 16. `nr` stays unique per list and stays the point's identity — for the
viewer's symbol ids, for a report, for `data-nr` in the demo. What it is not, any
more, is a contract with an external document. The fixture comparison carries a
13-row mapping table instead, and that table lives in the test.

The `junction` station kind goes with it. Since
[ADR 0053](0053-the-stress-point-walls-tile-the-outline.md) the web starts at the
flange underside, so a "cut immediately below the flange" IS the web element's
first station — the same `t`, the same `S`, computed by the same formula. It was
a special case that had already stopped being one.

## What this does not change

- The magnitudes. All 546 reference values are untouched.
- The tangent, and everything ADR 0058 built on it: `q = −(Vz·Sy/Iy +
  Vy·Sz/Iz)`, `τ = q/t`, direction `(ty, tz)`, and the place `Mt` will go.
- The box. It has no branch node — its outer corner joins TWO walls and is
  single-valued, the mitre being one more element in a closed circuit.
- The equilibrium checks. They now project onto the global axes (`q·ty`, `q·tz`)
  instead of summing wall by wall, which is more general and covers the mixed
  directions; the known bounds are unchanged (96,9 % of `Vz` through the I web,
  99,9 % of `Vy` through its flanges, 97,5 % through the box webs).
- `stressPoints` still answers `undefined` for `kind === 'section-geometry'` and
  for every solid figure ([ADR 0057](0057-the-parametric-solid-section-has-no-stress-points.md)).

## Consequences

- `StressPoint` gains `wall: string` and loses `branched`. `WallDirection.branched`
  and `BRANCH_ALONG_Y` go with it; `AGAINST_Y` and `AGAINST_Z` come in.
- `stressPoint()` takes the wall id as its second argument.
- Readers that draw the points get two markers at one location and should draw
  the location once — the viewer deduplicates by coordinate.
- `@baustatik/cross-section-stress` (ADR 0054) needs no `branched` in
  `StressAtPoint`, and its `tau` may carry an honest sign.
