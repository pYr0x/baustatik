# The cross-section plane: axis directions, the sense of `alpha`, reference systems

Fixes the value range of `SectionProperties` and the sign conventions in it.
Sits next to [ADR 0030](0030-the-section-editor-stores-a-wall-graph.md), which
fixes the stored *geometry*; this one fixes the *numbers* that fall out of it.

It exists as its own document for the same reason
[ADR 0005](0005-rotation-sense-phiy-versus-theta.md) does: you look up a
rotation sense while debugging a sign, not while reading a type.

> **One rotation sense in the section plane, and it is the one `Arc.sweep`
> already uses: positive turns from `+y` towards `+z`.**

## The value range

```ts
type SectionProperties = {
  A: number; Iy: number; Iz: number; Iyz: number;   // [m2], [m4]
  ys: number; zs: number;                           // [m]
  kappaY?: number; kappaZ?: number;                 // [-]
  alpha: number;   // [rad]  MANDATORY
  Iu: number;      // [m4]   MANDATORY
  Iv: number;      // [m4]   MANDATORY
  yM?: number;     // [m]    undefined = NOT DETERMINED
  zM?: number;
};
```

### `alpha`, `Iu`, `Iv` are mandatory

They are **pure algebra on `Iy`/`Iz`/`Iyz`** and therefore total for every
source. `undefined` at an IPE 300 would not be a piece of information, it would
be an untruth.

```text
tan 2α = −2·Iyz / (Iy − Iz)
Iu, Iv = (Iy + Iz)/2 ± sqrt(((Iy − Iz)/2)² + Iyz²)
```

Taken from `atan2`, not from `atan`: only then does the quadrant come out right,
`alpha` lands in `(−π/2, +π/2]`, and `Iu` becomes the **larger** of the two. The
two riders — `Iu ≥ Iv` and the range — make the statement unique; without the
first, every position would be describable twice, once rotated by 90°.

`Iyz === 0` is short-circuited, and the short cut is **exact**: if the deviation
moment vanishes, `y` and `z` *are* the principal axes. The general formula would
reach the same answer through a square root and a division, and `Iu === Iy`
would then hold only to floating-point noise. Every source in the repo today
runs through the short cut.

A consequence worth stating, because it is easy to expect otherwise: `alpha = 0`
is **not** a constant the sources write down. It is the result for an *upright*
section. A plate beam with a 2 m flange has `Iz > Iy`, so its strong axis lies on
`z` and `alpha` comes out as `+π/2`. A characterisation test holds both cases.

### The sense of `alpha`, and the mirror against Dlubal

Positive turns from `+y` towards `+z`. This is **not a third rotation sense** but
the decision already taken for `Arc.sweep`
(`section-geometry/src/types.ts`), which the DXF sign rule for `bulge` already
leans on.

**Against Dlubal the sign is mirrored** — an L 30×20×3 reads `+23.12°` here and
`−23.12°` there. The mirroring happens **once**, in the report output. That is
the same figure as `phiY = −theta` in ADR 0005: one internal sense, one mirror at
the printed edge, never a second convention inside the calculation.

### `yM`/`zM` are optional, and `undefined` means *not determined*

Following the pattern of `kappaY?`. It does **not** mean "coincides with the
centroid".

### There is no third reference system

`ys`/`zs` stay in the **input system of their source** — the top edge for the
parametric shapes, the table's system for a rolled profile. The editor brings
"as drawn" as a third one, and the temptation is to invent a convention for the
shear centre on top of that.

Instead an **invariant** is fixed:

> **`yM`/`zM` lie in the same system as `ys`/`zs`.**

No migration, no changed test value. `fem-section-resolve` does not read `ys`/`zs`
at all, so nothing downstream is touched.

## What the existing sources have to deliver

| Source | `alpha` | `Iu` / `Iv` | `yM` | `zM` |
| --- | --- | --- | --- | --- |
| `rectangle`, `i-symmetric`, `hollow-rectangle` | `0` when upright | `Iy` / `Iz` | `ys` | `zs` |
| `t-section` | `0` when upright | `Iy` / `Iz` | `ys` | **`undefined`** |
| IPE, HEA | `0` | `Iy` / `Iz` | `0` | `0` |

`yM = ys` everywhere: all of them have a symmetry axis in y, so the shear centre
lies on it.

**`zM` stays `undefined` at the `t-section`,** and that is the one entry worth
reading twice. The T is only **singly** symmetric: `yM = ys = 0` holds, but
`zM ≠ zs`. Writing `zs` there would be an untruth, and it would make the gate's
sentence 2 report torsion where there is none. The number falls out of the wall
path later.
