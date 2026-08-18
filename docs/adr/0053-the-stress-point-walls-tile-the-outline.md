# The stress-point walls tile the outline

For the open thin-walled templates, `S` is the first area moment of a wall
decomposition that **tiles the outline figure** — flange `bf × hf`, web
`bw × (h − hf)`, no overlap and no gap — taken about the **outline centroid**
`zs`. The mid-line development survives in exactly one place: the shear-energy
path from which κ falls.

Extends [ADR 0051](0051-the-closed-box-tiles-the-outline-figure.md), which did
the same for the closed box, and settles the loose end that
[ADR 0052](0052-stress-points-sit-on-the-extreme-fibre.md) left in the T.

## The question this answers

> `S` is only needed for τ, and τ needs the wall model. The wall centroid of an
> unsymmetric section differs from the outline centroid. Which one is right?

Neither, as a choice. The reference axis is **not a free parameter** — it is a
property of the area you integrate. The shear flow follows from

```
∂q/∂s = −t · ∂σx/∂x = −(Vz/Iy) · t · z      →   q(s) = −(Vz/Iy) · S(s)
```

and `q` must vanish at the free edge it started from *and* at the last free edge
it reaches. That is the statement `∫ z t ds = 0` over the whole model — i.e. the
axis passes through the centroid of **that** area distribution. Run the mid-line
walls about the outline centroid and the T's web path closes on 433 262 mm³
instead of zero; `S` would depend on which side you cut from.

So one does not pick a centroid. One picks an **area** — and it has to be the
area that `A`, `Iy`, `W` and σ already come from, because nobody will accept
`zs = 79,70` for a figure whose centroid is 80,58. The walls therefore have to
tile the figure, and then the centroid question dissolves: two disjoint
rectangles that cover the T **are** the T, and their centroid is `zs` by
construction.

## What changed, in numbers

T 200/15/10/300 [mm], `Sy` in cm³:

| | before (mid-line) | now (tiled) | reference |
| --- | --- | --- | --- |
| P2 flange `y = −5` | −102,884 | **−104,135** | −103,65 |
| P3 flange `y = 0` | −108,299 | **−109,615** | −108,32 |
| P6 web top | −216,598 | **−219,231** | −219,60 |
| P7 centroid | −242,658 | **−240,732** | −240,73 |

The whole of the old deviation was one number: the mid-line model's web starts
at the flange mid-line and so counts a 10 × 7,5 = 75 mm² sliver twice. That
sliver sits high (z = 11,25) and pulled the centroid to 79,699, i.e. by
**0,8776 mm**. Multiplied by each severed area it is the gap exactly:

```
P2   1425 mm² × 0,8776 = 1,251 cm³
P3   1500 mm² × 0,8776 = 1,316 cm³
P6   3000 mm² × 0,8776 = 2,633 cm³
```

The reference printout's own web values are now matched to the last printed digit (240,73 at the
centroid; 216,63 at mid-height, a station we do not carry). Its three
**junction** values remain unreproducible from any elementary model — −0,47 %,
−1,18 %, +0,17 % against exact geometry, in both directions. As with the box, we
do not name its model.

## What it costs, and what it does not

The second equilibrium identity is that the shear stresses must **add up** to
`Vz`:

```
∫ q dz  =  (Vz/Iy) ∫ S dz  =  Vz    ⟺    ∫ S dz = Iy   of the same model
```

| | closes at the free edge | resultant |
| --- | --- | --- |
| mid-line, `S` about `zsWall`, `Iy` of the wall model | ✓ | 1,00000 · Vz |
| mid-line, `S` about `zsWall`, `Iy` of the outline — **the old state** | ✓ | 1,00574 · Vz |
| **tiled, `S` about `zs`, `Iy` of the outline** | ✓ | **0,96744 · Vz** |
| outline model throughout | ✓ | 1,00000 · Vz |

The 3,256 % is **not** a safety margin and not a bookkeeping error: it is
`τ_xz` in the flange, which a wall model does not carry by definition. It is
small because it is smeared over the full flange width — 2,10 N/mm² at the
flange underside at `Vz = 100 kN`, against the 13,99 N/mm² of `τ_xy` the wall
model does report there (+1,1 % on the resultant if added vectorially).

At our stress points it is **exactly zero**, and not by convention: the flange's
outer face is traction-free, so `τ_zx = 0` there and with it `τ_xz`. `τ_xy` is
untouched by that condition — its partner acts on a `y`-face, free only at the
flange tips. The outer fibre still governs (σ_v 156,16 against 127,92 at the
flange underside), so ADR 0052's placement survives the component we drop.

The old state's 0,574 %, by contrast, stood for nothing: `S` about one axis,
`Iy` about another.

## κ keeps the mid-line, and that is not a compromise

The shear correction factor is an **energy** integral over the whole wall, not a
local cut, and the shear areas of the profile catalogue are defined on the
mid-line development. Tiling shortens the web by `tf/2` at each end and hands
that material to a branch that runs transverse to the shear — so it stops
carrying `τ_xz` at all. (For the closed box this did not arise: there, tiling
only moves the boundary between segments, the circuit length is unchanged. That
is why ADR 0051 was free and this is not.)

Over all 42 IPE and HEA profiles, `Az` against the table:

| | deviation |
| --- | --- |
| mid-line | −6,2 % (IPE 80) … −3,5 % (HEA 180) |
| tiled | **+1,0 % … +7,0 %** |

A welded I is the rolled profile minus its fillets. It cannot have the larger
shear area. The mid-line model respects that for every profile; the tiled model
violates it for every profile. Adding the flange's `τ_xz` energy back does not
rescue it (0,3801 → 0,3790 for IPE 80) — it is spread over `b`, so it carries
almost no energy.

`tSectionWall` therefore stays, with one caller instead of two, and
`shapes/*.ts` keeps the mid-line `thinPaths`. `It` and `zM` are untouched for
the same kind of reason: `l·t³/3` over the mid-line development is the
conventional St.-Venant formula, whose junction over-length is a deliberate
correction, not an oversight.

## The I: one point, and a coincidence retired

For a doubly symmetric section the centroid cannot move, so only the web start
changes — and of the thirteen points only **P13** with it: 11,60 → **11,25 cm³**
for IPE-80 dimensions.

The 11,60 looked like a triumph, because the catalogue says `Sy,max` = 11,61.
It was a coincidence, and it decomposes:

```
outline, r = 0                       11,247
+ the two fillets above the axis      0,361   →  11,608   (catalogue 11,61)
mid-line double-count                 0,357   →  11,604
```

Two different pieces of geometry, 1 % apart in size. The welded I has no
fillets, so 11,247 is its value.

The evidence that this is the right way round is internal: **`rolled-i.ts` — the
template validated against the catalogue points — has always run its web over
the clear height.** Since ADR 0052 the two templates share a numbering; they now
also share every number at `r = 0`, all thirteen points, to the last bit. The
one deliberate difference that ADR 0029 recorded at P13 is gone, and the
comparison loop in the test runs `1..13` with no translation table.

## What this does not touch

- **The outline model.** Not one number.
- **The rolled profile.** It was already tiled; it is now the pattern for the
  second time (ADR 0052 was the first).
- **The box.** `hollow-stations.ts` and its path already tile (ADR 0051).
- **κ, `It`, `zM`, the shear centre.** Mid-line, as before, for the reasons
  above.
- **`stressPoints`' station lists.** `open-stations.ts` is unchanged: this ADR
  moves no point, it only changes what `S` is at the points that were already
  there.
