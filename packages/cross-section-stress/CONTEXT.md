# `@baustatik/cross-section-stress`

## Purpose

The **numerator** of the stress formulas. `@baustatik/cross-section` supplies
the denominator — section values and stress points — and this package turns
them into σ, τ and σv once a section force is added
([ADR 0054](../../docs/adr/0054-the-stress-is-the-numerator-and-lives-outside-cross-section.md)).

```text
CrossSection ──sectionProperties()──→ SectionProperties  (m², m⁴, m)  ┐
             └─stressPoints()───────→ StressPoint[]      (mm, cm³)    ├─→ σ, τ, σv [MPa]
                                      SectionForces      (kN, kNm)    ┘
```

## Boundaries

Owns:

- `StressAtPoint` — one row per stress point, 1:1 with the input list.
- σv, the von Mises equivalent stress. It is **material-free**: the factor 3
  comes from distortion energy, not from EN 1993 (ADR 0054/0056).
- The unit gate of this path (`src/units.ts`).

Does not own:

- **Any strength.** No `fyd`, no γM, no cross-section class. The acceptance
  condition is literal: `grep -r 'fy' src` finds nothing (ADR 0055).
- **A maximum or a "governing point".** Which point governs depends on the
  verification and belongs to the design step (ADR 0056).
- **Plastic resistances.** Those fall out of `cross-section-response`
  (ADR 0055).
- **FE stresses.** `@baustatik/cross-section-fe` recovers them itself, from the
  warping fields it already solved. **It imports nothing from here and does not
  depend on this package**
  ([ADR 0061](../../docs/adr/0061-the-fe-stress-is-a-vector-at-a-node.md),
  amending the one bullet of ADR 0054 that said otherwise): τ at a mesh node is
  a **vector** at a place with no distinguished direction, while `tau` here is a
  signed flow along a known wall tangent. A shared record would have to carry
  `wall`, `ty`, `tz`, `tauY` and `tauZ`, half of them undefined on each side.
  **Shared is σv as a formula, not as a type** — four operations, written twice,
  with one term in the bracket here and two there. And the FE produces no
  `StressPoint`: in an FE field there is neither a cut width `t` nor a truncated
  `S` (ADR 0054).
- **Torsion.** `Mt` throws here (`TorsionNotSupportedError`) and is **answered**
  in `cross-section-fe`, which has ω. That is not an inconsistency but the
  capability difference the two packages are cut along (ADR 0054/0061).
- **A viewer or a demo page.** ADR 0054 foresees that as a separate step.

## The two doors

```ts
stressesAtPoints(
  properties: SectionProperties,
  points: readonly StressPoint[],
  forces: SectionForces,
): readonly StressAtPoint[];

sectionStresses(
  cs: CrossSection,
  forces: SectionForces,
): readonly StressAtPoint[] | undefined;
```

Both public. **The separate arguments of `stressesAtPoints` are not an
oversight:** the `Iyz` branch cannot be reached through the convenient door at
all, because every shape that carries stress points today is at least singly
symmetric. `tests/biaxial.test.ts` needs invented `SectionProperties` with
hand-made points.

`sectionStresses` **inherits** its `undefined` from `stressPoints` — one
`undefined`, three reasons, and none of them is patched here:

1. drawn geometry (`kind: 'section-geometry'`) — no template,
2. **every parametric solid figure** (ADR 0057) — no cut model,
3. invalid dimensions — the gate sits in `sectionProperties()`.

## Invariants

- **Internally mm and N, and the exit is the identity.** `N[N]/A[mm²]` *is*
  MPa, `q[N/mm]/t[mm]` *is* MPa. There is no output conversion for a factor to
  hide in — and that is exactly where an order-of-magnitude error would stay
  invisible. One input conversion per source, all in `src/units.ts`, all drawn
  from `@baustatik/units`, never as a literal (ADR 0024).
- **σ and τ BOTH carry the general `Iyz` form**, resolved in one place
  (`src/field.ts`) and called twice. The shear flow IS σ under the substitution
  `My → Vz`, `Mz → −Vy`, negated and with `S` instead of a coordinate. The
  decoupled form of ADR 0058 holds only for `Iyz = 0`; taking it would give σ
  the general branch and τ not, with the seam written down nowhere.
- **`Mt` throws.** `TorsionNotSupportedError`, as soon as `Mt` is set and
  non-zero. `Mt: 0` and `Mt: undefined` pass through.
- **`tau` is signed**, relative to the tangent (`ty`, `tz`) travelling in the
  same row. Without it the sign is meaningless (ADR 0058/0059).
- **`D === 0` and `A === 0` are deliberately unguarded.** For every
  `SectionProperties` that `@baustatik/cross-section` produces, `D > 0` and
  `A > 0` hold; `sectionProperties()` is the gate, and a second one beside it
  would be two answers to the same question. Synthetic input is the caller's
  business.

## The formulas

```text
D  = Iy·Iz − Iyz²

σ  = N/A + cy·y + cz·z          with (cy, cz)   = field(My, Mz)
q  = −(c'y·Sz + c'z·Sy)         with (c'y, c'z) = field(Vz, −Vy)
τ  = q / t
σv = sqrt(σ² + 3τ²)

field(aboutY, aboutZ) = {
  cy: −(aboutZ·Iy + aboutY·Iyz) / D,
  cz:  (aboutY·Iz + aboutZ·Iyz) / D,
}
```

At `Iyz = 0` both collapse exactly onto the familiar form:
`σ = N/A − Mz·y/Iz + My·z/Iy` and `q = −(Vz·Sy/Iy + Vy·Sz/Iz)`.

**The signs are not chosen.** They live in `@baustatik/section-forces` and fall
out of the cross product there
([ADR 0060](../../docs/adr/0060-the-section-forces-are-right-handed-components.md)).

## Why `Mt` throws rather than keeps quiet

The omission is **technically forced** today, not merely a priority.

- Bredt needs `Am`, and `Am` is not in `SectionProperties`. Back-computing it
  from `It` does not work: `It = 4·Am²/∮(ds/t)` needs the circulation integral,
  which is equally absent. Evaluating `Mt` would mean extending
  `@baustatik/cross-section`.
- On an **open** profile `τ = Mt·t/It` varies linearly across the wall
  thickness with a zero at the midline. That contradicts the very assumption a
  stress point is built on ("τ constant across the cut width", ADR 0057) — a
  torsion share does not fit into a `StressPoint` as defined today.
- Silently ignoring it would be **unconservative**: a `sigmaV` that is too
  small, without a warning. Literally the case ADR 0057 cites as its reason
  for `undefined`.

When `Mt` does arrive it is an addition to `q` and not a breaking change —
because the tangent already travels along.

## Navigation

- `src/units.ts` — the one gate.
- `src/field.ts` — the 2×2 resolution shared by σ and τ.
- `src/stresses.ts` — both doors.
- `src/types.ts` — `StressAtPoint`.
- `src/errors.ts` — `TorsionNotSupportedError`.
- `tests/signs.test.ts` — the coupled sign test. `My`/`Vz` on the **same**
  cross-section in **one** test; two separate tests would let the pair be
  consistently wrong.
- `tests/equilibrium.test.ts` — the only end-to-end test of the unit gate.
  Bounds inherited from `cross-section`.
- `tests/hand-check.test.ts` — IPE 300, `My = 100 kNm`, `Vz = 50 kN`, both
  numbers checkable by hand.
