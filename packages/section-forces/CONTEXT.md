# `@baustatik/section-forces`

## Purpose

The six section forces at one location along a beam — and the sign convention
they are to be read in. One record, no dependency, no function.

The model is `@baustatik/actions`: this package carries terms, not arithmetic.

## Boundaries

Owns:

- `SectionForces` — `N`, `Vy`, `Vz`, `My`, `Mz`, `Mt`, every field optional.
- **The sign convention**, in the JSDoc at the fields themselves
  ([ADR 0060](../../docs/adr/0060-the-section-forces-are-right-handed-components.md)).

Does not own:

- **The stress formulas.** Those live in `@baustatik/cross-section-stress`, and
  they read the convention from here, not the other way round.
- **Where the numbers come from.** Whether `Vz` is filled by a plane frame, a
  later spatial solver or by hand is of no concern to this leaf.
- **A design location.** One `SectionForces` holds at ONE location; the loop
  over the locations belongs to the design step (ADR 0056).

## Invariants

- **Every field optional.** The plane frame fills three, a spatial one six. A
  mandatory field would make the step to 3D a breaking change at exactly the
  place every stress in the program flows through (ADR 0054).
- **No dependency**, not even `@baustatik/errors`: nothing is checked here and
  nothing is thrown.
- **`Mz` and `Vy` are a pair.** `Mz > 0` = compression on `+y` belongs to
  `dMz/dx = −Vy`. Deliver one of them under the other convention and τ comes
  out sign-wrong in the `Vy` share — and **no test in the repository fires**,
  because no solver here produces `Vy` today.

## The convention in four lines

```text
M = ∫ r × σₓ dA,   r = (0, y, z),   F = (σ dA, 0, 0)

  ⇒  My = +∫ z·σ dA           Mz = −∫ y·σ dA
  ⇒  My > 0 = tension on +z   Mz > 0 = COMPRESSION on +y
  ⇒  dMy/dx = +Vz             dMz/dx = −Vy
```

The unequal signs at `My` and `Mz` are not a break — they are the cross
product. Derivation, the rejected alternative, and the checks the repository
holds for it: ADR 0060.

## Why the convention lives HERE

It belongs to the **meaning of the number**, not to the formula that consumes
it. A later spatial solver imports this leaf and reads the convention off the
fields it is filling; it will never open `@baustatik/cross-section-stress`.
Were it written there, the producer of the numbers would learn the rule from
the consumer.

## The name collision with `fem-element`

`@baustatik/fem-element` also carries a type called `SectionForces`. That is
the plane beam's `N`/`V`/`M` triple; this is the general cut's six-tuple. The
collision is known and **deliberately unresolved** in ADR 0054 — it is not
renamed in passing.

## Navigation

- `src/types.ts` — the record and the convention.
- `src/index.ts` — the barrel.
