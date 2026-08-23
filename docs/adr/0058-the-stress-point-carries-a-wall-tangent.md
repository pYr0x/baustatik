# The stress point carries a wall tangent

> **Amended by [ADR 0059](0059-the-stress-point-lies-on-a-wall-element.md) in
> two places.** The tangent — this ADR's central statement — stands, and that
> ADR gives it an owner: the point lies on a wall element and carries THAT
> element's tangent. What does not stand: the `branched` flag is gone (a
> location carries one point per element reaching it, so the flange node carries
> two), and the claim below that the rolled profile's printed sheet
> contradicts itself is **wrong**. It is coherent; it is written per element
> rather than per cross-section, and the package now follows it sign for sign
> at all 13 printed values, including points 4, 7 and 8. Read that ADR first if
> you are here about signs at the flange node.

You look this one up when `Sy` or `Sz` comes back positive where you expected a
negative number, when the rolled profile's sign no longer matches the printed
catalogue sheet at points 4, 7 and 8, or when someone asks how to combine `Vy`
and `Vz` — or, later, `Mt` — into one shear stress.

> **`Sy` and `Sz` are the first area moment of the part *already traversed* in
> `+s`, where `+s` is a tangent the point carries (`ty`, `tz`). The sign is
> computed, never set. With one direction per point the contributions from `Vz`
> (through `Sy`) and `Vy` (through `Sz`) point the same way and add as signed
> scalars:**
>
> ```
> q = −(Vz·Sy/Iy + Vy·Sz/Iz),   τ = q/t,   direction = (ty, tz)
> ```
>
> **At a branch — the flange point on the web axis — `Sy` is two-valued and the
> point says so (`branched`); a check adds the two contributions by magnitude
> there, which is exact, not conservative.**

## What was there

Three conventions, none of them a direction.

- `thin.ts` computed `Sy` from the nearest free tip (`Math.abs(y)`, so the
  reference direction mirrored across the web axis) and `Sz` continuously from
  the left tip (one fixed direction). Both were then forced negative.
- `hollow-rectangle` forced every one of its 32 values negative, although a
  *circulating* flow cannot have one sign: under `Vz` it runs down both webs,
  which is `+s` in one and `−s` in the other.
- `rolled-i.ts` copied the printed catalogue sheet: `Sy` uniformly negative,
  `Sz` mirrored between the flange halves.

Each was correct for `|τ|` from a **single** shear force, and every test in the
package compared through `Math.abs`, so the disagreement was invisible. The two
producers of the same 13 points in fact printed **different `Sz` signs** at
points 4, 7 and 8 while the documentation claimed bit-identity — true of the
magnitudes, never checked for the signs.

## The argument

Shear stress in a thin wall is not a tensor problem. It is a **shear flow
`q = τ·t` tangential to the wall midline** — a scalar with respect to a running
coordinate. Both `Vy` and `Vz` produce a flow along *that same tangent*, so
their superposition is an ordinary signed addition. It is exact and costs
nothing.

Without a direction there are only two escape hatches, and both are wrong or
weak: `sqrt(τ_Vz² + τ_Vy²)` treats two components of the *same* direction as
orthogonal, and `|τ_Vz| + |τ_Vy|` is a bound rather than a stress.

The decisive case is torsion. Bredt gives a **circulating** flow
`q_T = Mt/(2·Am)`; whether it adds to or cancels the shear-force flow on a given
wall lives entirely in the relative sign. `Mt` is not evaluated yet — but the
16 box points that will need it already exist.

## Following the printed sheet where it is coherent

The closed box's printed reference carries a **consistent** circulation: `Sy`
flips between the webs, `Sz` between the flanges. Our field turned out to be its
exact global negative — and a global sign is nothing but the choice of running
direction. `hollowStations` therefore runs `+s` *against* its own numbering, so
the reference matches sign for sign, and the fixture comparison could be
tightened from magnitudes to signed values.

The rolled I offers no such option. Its sheet counts `Sy` from the nearest free
tip and `Sz` continuously from the left — two directions at one point. No single
running direction reproduces both. There the package follows itself and deviates
at exactly three points (4, 7, 8), in both components; a test pins that list.
**Where the source is coherent we follow it; where it contradicts itself we
follow ourselves.**

The numbering stays untouched. It is the published contract; the signs never
were.

## The branch, and why symmetry is the reason rather than the cure

At the flange point on the web axis the two flange flows from `Vz` run toward
each other: `+q₀` from the left, `−q₀` from the right. Because the halves are
mirror images the two values are equal and opposite — **the symmetry is what
makes the point two-valued**, not what resolves it. `Sz` is single-valued there:
the web carries nothing for `Vy`, so that flow passes straight through.

The material point at `(0, ±h/2)` is in fact stress-free — `τ_xy` is odd in `y`
and `τ_xz` vanishes at the free outer fibre. The value the point carries is the
flange flow *immediately beside the web*, which is the flange maximum for `Vz`.
Dropping it was considered and rejected: the **rolled** branch has it nowhere
else, because its points 2 and 4 sit on the fillet (IPE 80: −3,13 against
−4,44 cm³).

So the point keeps the value and declares the branch. `|Vz·Sy/Iy| + |Vy·Sz/Iz|`
is then the maximum over the two signs — over the two branches — and therefore
exact.

## The box corner is not an exception

At the outer corner the mitre is the shortest path through material, and the
circulation runs through it smoothly under 45°: the tangent is the **bisector**.
What is undefined there is the tangent at the *material point* of the outer
edge — and that point is stress-free, two free surfaces meeting. So the corner
takes τ from the flow through the mitre and σ at the corner coordinate, which is
[ADR 0052](0052-stress-points-sit-on-the-extreme-fibre.md) again: `S` and `t`
belong to the cut, the coordinate belongs to σ. `t` stays the wall thickness
rather than the mitre's `t·√2` — documented, safe-side, and a separate decision.

## What this does not fix

The wall model still has no shear component **across** the wall. That is its
assumption, not a sign problem, and it is why the equilibrium check lands at
96,9 % of `Vz` for the I web and 97,5 % for the box webs rather than at 100 %.
Those checks are new and only became possible with signs: a field of magnitudes
integrates to nonsense, because the halves cannot cancel where they must.

## Consequences

- `StressPoint` gains `ty`, `tz` and `branched`. Additive for readers; the
  viewer needs no change.
- `stressPoint()` takes a `WallDirection` as its last argument. The station
  lists own it — a running direction is a statement about the order of the
  stations, not about the formula evaluated at one of them.
- Values of `-0` are normalised to `0` in the factory: computed signs produce
  them at the zero cuts, and `-0` prints as "-0" and fails `Object.is`.
- `@baustatik/cross-section-stress` (ADR 0054) can now write one formula for
  biaxial shear and has somewhere to put `Mt` later.
