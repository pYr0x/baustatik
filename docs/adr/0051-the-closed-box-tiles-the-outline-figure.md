# The closed box tiles the outline figure

The thin-walled `hollow-rectangle` computes its first area moments `S` on walls
that **tile the outline figure**, not on the mid-lines. `S` is therefore
**exact**, not approximated, at every one of its twelve wall stress points.

Extends [ADR 0029](0029-stress-points-follow-the-idealisation.md), which decided
that κ and the stress points read the *same* shear machine. That rule is
untouched and is the reason this change could not stay in the stress points
alone: `closedBoxPath` moved with them, and κ moved by 0.07–0.11 % for ordinary
wall thicknesses.

## What was wrong

The mid-line model does not tile the figure. At every corner it counts one
`t/2 × t/2` square **twice** and leaves the opposite one out:

```
       y=90        y=95       y=100
         │           │           │
z=-150 ──┼───────────┼───────────┼──  outer face
         │     A     │  B (gap)  │
z=-145 ──┼───────────┼───────────┼──  flange mid-line
         │  C (×2)   │     D     │
z=-140 ──┼───────────┼───────────┼──  inner face
                     ↑
              web mid-line
```

The flange rectangle ends at `y = 95` and covers A and C; the web rectangle
starts at `z = −145` and covers C and D. B is covered by neither.

**The area balances** — both squares are `t²/4`, so `A = 9600 mm²` came out
exactly right and nothing looked wrong. **The first moment does not**: the two
squares sit `t/2` apart in both directions, so each corner costs

```
ΔS = (t/2)² · (t/2) = t³/8      (t = 10 mm → 125 mm³ = 0.125 cm³)
```

and always in the same direction — the mid-line model moves material inwards,
shortening the lever arm. Every `S` past a corner was too small by exactly that.

## The fix

Two decompositions, one per shear direction, each covering the figure with no
gap and no overlap:

| | wall **across** the shear | wall **along** it |
| --- | --- | --- |
| `Sy` | flange, out to the **outer face** `b/2` | web, over the **clear** height `h/2 − t` |
| `Sz` | web, out to the **outer face** `h/2` | flange, over the **clear** width `b/2 − t` |

The lever arm stays on the mid-line — it is the wall's centroidal distance.
**The circuit length does not change**: `b/2 + (h/2 − t)` equals
`(b−t)/2 + (h−t)/2`. Only the split between the two walls moves, by `t/2`.

## The corner is a mitre, and that is derived

At the four outer corners there is no wall cut: two traction-free faces meet.
The shortest path through the material runs to the **inner** corner — the
diagonal. The severed part is then the flange strip out to the clear width plus
half the corner square:

```
S = zm·t·(b/2 − t) + (t²/2)·(h/2 − t/3) = t·(a·c − a·t/2 − c·t/2 + t²/3)
```

with `a = b/2`, `c = h/2`. **The expression is symmetric in `a` and `c`**, so the
web side yields the same number and `Sy = Sz` holds at the corner — the same
property the mid-line node had, now with a derivation behind it rather than a
convention.

`t` stays the wall thickness at all sixteen points, although the mitre cut is
`t·√2` long. That follows the package rule ("at a step the smaller width
governs") and is the safe side: at a convex outer corner the true shear flow is
zero anyway, because both adjoining faces are traction-free.

## Evidence

Reference printouts, `packages/cross-section/tests/fixtures/hollow-rectangle-stress-points.json`.
The reference is **not** uniformly better than the old model — each side hits a
different half of the table:

| | exact | ours (now) | ours (before) | reference |
| --- | --- | --- | --- | --- |
| P8/P16 `Sy` (web mid) | 375.500 | **375.500** | 375.375 | 375.50 |
| P4/P12 `Sz` (flange mid) | 230.500 | **230.500** | 230.375 | 230.50 |
| P3 `Sy` (flange) | 175.500 | **175.500** | 175.500 | 175.54 |
| P1 `Sy` (web) | 195.000 | **195.000** | 194.875 | 194.97 |

At the two symmetry points the value is unambiguous — half the outline figure's
first moment — and the reference prints it exactly. P3 is unambiguous in a second,
stronger sense: between the zero at `y = 0` and the cut at `y = 90` the severed
part is **pure flange**, a 90 × 10 rectangle whose centroid is `z = −195` by
definition. No corner is crossed, so the one modelling choice in this whole
scheme — where flange ends and web begins, somewhere in `90 < y < 100` — cannot
reach it. Both models therefore print 175.500 there, and always did.

**What the reference's 175.54 is, we do not know.** Its deviations mirror perfectly
between `Sy` and `Sz` (+0.04 / −0.013 / −0.03 / 0.00 along the walk), so they are
systematic, not transcription noise; and its corner increment P3 → P1 is 19.43
against the corner square's exact `10 × 10 × 195 = 19.50`. It distributes the
corner region differently, at ~0.02 %. Whether that is another corner
convention, a discretised wall chain, or an `S = τ·I·t/V` read back out of a 2D
shear solution — in which case it is not the same quantity at all — four printed
numbers cannot say. The claim here is only the narrow one: **our value is exact
for the definition we compute**, and a characterisation test holds the size of
the gap so a future change to it is visible.

## The price: the drawn box does not follow

`calculation/wall-path/` computes κ for the **drawn** thin-walled geometry from
the mid-line graph, and it still does. The same box entered two ways therefore
differs:

```
100 × 200 × 8:   κz = 0.6238 (wall graph)  vs  0.6226 (shape)   — 0.19 %
```

`tests/wall-path.test.ts` used to assert equality here and now records the gap
with a number instead. **This is an open item, not a tolerance.** Carrying the
tiling over to the graph means handling arbitrary joint angles and thickness
jumps, where the corner block is a kite rather than a square and the correction
depends on the mitre angle. The geometry for that exists —
`geometry/outline/miter-joints.ts` (ADR 0038) — but the shear path does not read
it today.

The shape branch is on the more accurate side of that gap: its `S` and the `I`
that `shearArea` divides by now come from the same figure.

## What this does not touch

- **`solid`.** The band machine cuts the full outline figure and was always
  exact; `hollowRectangle`'s `solid` paths are unchanged.
- **`It`.** Bredt uses the mid-line enclosed area `A_m = (b−t)(h−t)`, which is
  the correct area for the shear-flow circuit and has nothing to do with this.
- **The rolled and welded profiles.** Their paths are untouched, and the
  catalogue agreement of `Ay`/`Az` rests on the convention `shearArea`
  documents: exact `I`, idealised `S`. For the box that mix is now gone; for the
  open shapes it stands, because no reference says otherwise.
- **The stress-point coordinates.** They were always on the outline figure, for
  σ. This decision brings `S` onto the same figure — inside `τ = V·S/(I·t)`, all
  three of `S`, `I` and the coordinate now describe one body.
