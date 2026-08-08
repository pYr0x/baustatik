# `@baustatik/geometry-2d`

## Purpose

The plane-geometry primitives of the repo — `Point`, `Vector`, `Line`, `Arc`,
`Polyline`, `Polygon` — in `x`/`y`, plus the `bulge` ⇄ `Arc` codec `Bulge` and
`DEFAULT_ARC_TOLERANCE`, the **one** discretisation tolerance of the repo. It
draws nothing and knows no unit: what goes in decides what comes out.

`@baustatik/section-geometry` (`y`/`z`, cross-section plane) and
`@baustatik/fem-geometry` (`x`/`z`, beam plane) are thin adapters over this
package. **Neither of them is bypassed**: nothing above them imports this package
directly.

## Boundaries

- Owns: the `x`/`y` shapes, the rotation sense (*a positive rotation carries the
  first axis onto the second*), the winding rule, `Polygon.moments` as the raw
  signed integrals, and both clipping doors.
- Does not own: units, cross-section values, drawing, or the derivation of a
  section outline (`deriveOutline` and the drift check live in
  `@baustatik/cross-section`, whose types their signatures name).

## Two clipping libraries, deliberately

This is the one package with two of them, and the split is by **question**, not
by preference:

| Door | Library | Why |
| --- | --- | --- |
| `union` / `intersect` / `subtract` | `martinez-polygon-clipping` | in place since before P0; each result keeps ring 0 only, so these doors **cannot return a hole** |
| `inflate` | `clipper2-ts` | inflating open or closed runs, and the union that must follow it — including holes and their nesting ([ADR 0037](../../docs/adr/0037-the-outline-comes-from-inflating-wall-runs.md)) |

**This is not an end state.** Whether `clipper2-ts` replaces martinez entirely is
an open point in `packages/TODO.md` §5, and it hangs on a prerequisite this
package does not have: a **multi-ring polygon type**. `Polygon` here is a
*single* ring; "several rings are one figure" is a statement that belongs to the
consumer, not here. Swapping a library out across a package with foreign
consumers did not belong in P3.

**`clipper2-ts` is pinned exactly (`2.0.1`, no `^`).** The reason to say this out
loud: stored cross-section outlines depend on what this library returns, down to
the point count. The library's own promises — end types, the `arcTolerance`
series, and above all that a closed run under `EndType.Joined` yields the inner
ring — are pinned as tests in `tests/clipper2.test.ts` rather than trusted, so a
defect or a changed default fails in CI instead of in a scratchpad. (The decision
was originally taken against the prerelease `2.0.1-18`; `2.0.1` is the same code
with the release tag, which removes the only serious objection to it.)

## Invariants

- **`Polygon.make` validates, it does not turn.** The winding comes out the way
  it went in — that is what makes a hole ring expressible at all
  ([ADR 0034](../../docs/adr/0034-winding-is-mathematical-and-the-factory-does-not-normalise.md)).
  `mirror` **reverses** it, because a reflection is orientation-reversing.
- **The winding of a foreign library is not a statement of this package.** Both
  `fromMartinez` and `inflate` therefore *set* it at the boundary rather than
  passing it through. `inflate` additionally reads the **nesting** from
  Clipper2's `PolyTreeD` instead of guessing it from the sign, and sorts: outer
  rings by `|A|` descending, every hole directly behind its outer ring.
- **`Polygon.area` is the absolute value** and therefore the wrong door for a
  hole ring; `Polygon.moments(points).A` carries the sign.
- **`JoinType` is not configurable.** `inflate` is nailed to Miter: `Round` would
  round off every corner of an I-profile and break the identity
  `A = 2·b·tf + tw·(h − 2·tf)`.

## Constants

- `DEFAULT_ARC_TOLERANCE = 0.05` — the chord deviation of the discretisation, in
  the caller's unit; the number is chosen for **millimetres**. It decides how
  many points an outline carries and therefore which `A`, `Iy`, `Iz` fall out of
  it. Consumers that store the result pass their own explicitly (ADR 0032,
  ADR 0033).
- `OFFSET_PRECISION = 6` — the decimal places `inflate` rasters to. Clipper2
  computes on integers; its `…D` API quantises on entry, and the library default
  of `2` (`0.01 mm`) would sit in the same order of magnitude as
  `DEFAULT_ARC_TOLERANCE`. This is quantisation of the **computation path**, not
  a model assumption, and is deliberately **not** a `SectionPolicy` field.

## Validation

```text
pnpm --filter @baustatik/geometry-2d typecheck
pnpm --filter @baustatik/geometry-2d test
pnpm --filter @baustatik/geometry-2d lint
```

`typecheck` runs in no Turbo task and in no CI step — run it yourself. The
`Browser` project needs Playwright; `test` runs the `Unit` project only.
