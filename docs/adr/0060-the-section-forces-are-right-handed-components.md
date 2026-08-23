# The section forces are right-handed components

You look this one up when a shear stress comes back with the wrong sign under
`Vy`, when you wonder why `σ = N/A − Mz·y/Iz + My·z/Iy` carries a minus in one
term and a plus in the other, or when a spatial solver is about to be wired to
`@baustatik/section-forces` and you need to know what it is expected to deliver.

> **`N`, `Vy`, `Vz` are the components of the section force, `Mt`, `My`, `Mz`
> those of the section moment — in a right-handed `(x, y, z)` whose `x` is the
> beam axis. With `y` to the right and `z` downwards, `x` points **into** the
> section plane. Everything else is algebra, not choice.**

## The derivation

The moment is the resultant of the normal stresses over the cut. Nothing is
chosen here except the coordinate system itself:

```text
M = ∫ r × σₓ dA,   r = (0, y, z),   F = (σ dA, 0, 0)
r × F = (0, +z·σ dA, −y·σ dA)

  ⇒  My = +∫ z·σ dA        Mz = −∫ y·σ dA
  ⇒  My > 0 = tension on +z   Mz > 0 = COMPRESSION on +y
```

The shear forces follow from the same system through equilibrium of the
longitudinal direction, `∂σₓ/∂x + ∂τₓᵧ/∂y + ∂τₓ_z/∂z = 0`, integrated by parts
over the cut:

```text
dMy/dx = +Vz        dMz/dx = −Vy
```

**The unequal signs at `My` and `Mz` are not a break — they are the cross
product.** A moment is an axial vector, and its `z` component picks up the
`−y·σ` term. Any convention that gives both moments the same sign in `σ` has
stopped treating one of them as a vector component.

## The alternative that was rejected

`Mz` could be defined so that `σ` carries two plus signs (`σ = … + Mz·y/Iz`).
That reads more pleasantly and matches how a hand calculation is often written
down. It makes `Mz` a scalar that is *not* the `z` component of the moment
vector — and the price falls due exactly once, at the step to three dimensions,
where the moment has to rotate like a vector or nothing works. The pleasant
reading is a local optimum in the one place where it is cheapest to be wrong.

The pairing is the part worth remembering: **`Mz` and `Vy` come as a pair.**
`Mz > 0` = compression on `+y` belongs to `dMz/dx = −Vy`. Deliver one of them
under the other convention and the `Vy` share of τ comes out with the wrong
sign — and no test in the repository fires, because no solver here produces
`Vy` today.

## Checks, not sources

The convention is derived, so nothing in the repository can *justify* it. What
the following do is confirm that the repository already lives in this system —
each is a special case that has to fall out, and each does.

- `fem-element/src/types.ts` (`M > 0` = tension on the local `+z` side) and
  `internal-forces.ts` (`dM/dx = V`) are the plane frame's three components:
  `M` is `My`, `V` is `Vz`. Both signs fall out of the pair above unchanged.
- Substituted into the longitudinal equilibrium of a wall strip,
  `dq/ds = −t·∂σₓ/∂x`, the pair yields **verbatim** the formula of
  [ADR 0058](0058-the-stress-point-carries-a-wall-tangent.md):
  `q = −(Vz·Sy/Iy + Vy·Sz/Iz)`.
- `SectionProperties` puts the origin of the parametric shapes at the top edge
  and reports `zs = 0,1395 m` as a positive number — so `z` already points
  downwards today.
- The rotation `+y → +z` is the right-hand rotation about `+x`, which is exactly
  `Arc.sweep` and `alpha` from
  [ADR 0031](0031-the-cross-section-plane.md). There is no third sign in the
  repository.

## Where it is written down

In the JSDoc of `@baustatik/section-forces`, at the fields themselves — not in
the `CONTEXT.md` of `@baustatik/cross-section-stress`.

The convention belongs to the **meaning of the number**, not to the formula
that consumes it. A later spatial solver imports the leaf package and reads the
convention off the fields it is filling; it has no reason to ever open the
stress package. Putting it next to the formula would mean the producer of the
numbers learns the rule from the consumer.

## Consequences

- `@baustatik/cross-section-stress` writes σ and τ from one 2×2 resolution and
  needs no second sign decision.
- A spatial solver has a written target before it exists, which is the only
  time such a statement is cheap.
- `@baustatik/fem-element`'s `SectionForces` keeps its name. The collision is
  known and deliberately unresolved
  ([ADR 0054](0054-the-stress-is-the-numerator-and-lives-outside-cross-section.md)).
