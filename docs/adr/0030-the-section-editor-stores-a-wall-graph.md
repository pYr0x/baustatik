# The section editor stores a wall graph with its derived outline

> **Addendum (P3, [ADR 0037](0037-the-outline-comes-from-inflating-wall-runs.md)):**
> the sentence *"the gate derives the outline anyway, so the comparison costs
> nothing"* was an **intention** from P0 through P2 — the gate read
> `geometry.outline` and checked it only against itself. Since P3 the gate really
> does re-derive it and compares `A`, for **both** variants
> (`OutlineDriftWarning`). ADR 0037 also cashes in the reservation of the word
> `Branch` made below.

Adds a **third source** of section values next to the parametric shape and the
catalogue row, and fixes the record it stores. It decides the *type*, not the
mathematics: no Green integration, no offsetting, no `bulge` ↔ `Arc`. Those come
later and must not be able to move this contract.

> **The stored record is a positioned graph, and the outline it implies travels
> with it.**

## Why an editor at all

Sum the section values of a centre-line model's parts and they miss the
parametric shapes — at identical dimensions and identical plate thicknesses. The
cause is the **double count at the node**: the web runs from flange centre to
flange centre and reaches `tf/2` into each flange.

That is not a bug to patch in the four shapes. It is the point at which
"parametric shape" stops being enough, and an editor for **arbitrary**
cross-sections becomes the answer — for concrete (solid sections) and for steel
(thin-walled).

## The decision

```ts
type SectionGeometry =
  | { kind: 'midline'; nodes: SectionNode[]; walls: Wall[];
      idealisation: Idealisation; outline: Polygon[] }
  | { kind: 'outline'; rings: Ring[];        outline: Polygon[] };

type SectionNode = { id: string; y: mm; z: mm };
type Wall    = { id: string; startNodeId: string; endNodeId: string;
                 t: mm; bulge?: number };
type Vertex  = { y: mm; z: mm; bulge?: number };
type Ring    = { vertices: Vertex[] };            // INPUT  — outer CCW, hole CW
type Polygon = { points: { y: mm; z: mm }[] };    // RESULT — no bulge
```

### Both tags name a **line**, and the wall ends are named like a beam's

`midline` against `outline`: which line did you draw? An earlier `'walls'`
named the entity list where its counterpart named the model — two levels in one
union. `midline` is the term of the field ([SCIA][scia]: a thin-walled section
is "defined by its centreline (or midline) and the width"; SHAPE-THIN puts its
definition points on the "center lines"), and it spares the code the
centre/center split.

The entity stays `Wall`. `Element` is taken by the beam element
(`@baustatik/fem-element`), `Segment` by `ShearSegment` — and `Branch` means a
**run between junction nodes** in thin-walled theory, the word the wall path for
open profiles will need. What is left is the vocabulary of the code itself:
thin-**walled**, **wall** thickness.

> **Amended.** `ShearSegment` was later renamed to `ShearFlowInterval` (and
> `partSegments`/`crossWallSegment` to `partIntervals`/`crossWallInterval`) —
> `Interval` says what the type is, a stretch of the running coordinate `s` with
> no position of its own. `Segment` is therefore free again, and deliberately
> held for the **positioned** path piece that κ and the stress points are meant
> to read together (`packages/TODO.md`). `Wall` is unaffected: it was chosen for
> the reason that follows this paragraph, not for the blocked word.

`Wall.startNodeId`/`endNodeId` are the names `Beam` already uses in
`@baustatik/fem`. Same systematics — one object joins two nodes by id — so the
same names, and the `...Id` suffix says a reference stands there and not a
position.

[scia]: https://help.scia.net/26.0/en/modelling/cross-sections_and_library_editor/design_of_cross_sections/thin_walled_cross_section.htm

`CrossSection` gains the matching variant
`{ kind: 'section-geometry'; id; geometry }`. In P0 `sectionProperties` returns
`undefined` for it: `undefined` means "I do not know", which is honest, where a
guessed number would not be.

### An explicit node graph with string ids

Not because cell detection needs it — cell detection must never arrive. Because
the **wall path for open profiles** needs a traversal order, and in a flat model
that order would be the same epsilon search, only due earlier. Index references
were rejected: deleting a node would shift every following one, and a model diff
would be unreadable.

### `idealisation` sits *inside* the `midline` variant

The forbidden cell — a free outline computed as thin-walled — becomes a
**compiler error** rather than a runtime check. An outline has no centre lines
for a shear flow to run along.

### The derived outline travels with the record

This is a denormalisation, and it is deliberate. The reason is the one behind
[ADR 0027](0027-catalogues-are-import-sources.md): a report prints
`A = 5163.21 mm²`, a new version of a geometry library returns `5163.19` —
silently. The number of points is not incidental; `A`, `Iy` and `Iz` fall out of
exactly those points.

It is **not an unchecked** denormalisation. The gate derives the outline anyway,
so the comparison costs nothing, and silent drift becomes a finding.

Carrying it as `Ring[]` with `bulge` would secure only the **topology**, not the
point count — full price, half the protection. So the stored result is a
discretised `Polygon[]`, and input and result are distinguishable at the type:
`Ring`/`Vertex` carry `bulge`, `Polygon` does not.

`Ring` is the term OGC Simple Features and [RFC 7946][geojson] use — a *linear
ring*, exterior first, exterior CCW and holes CW, exactly the winding written
down above. One deviation is deliberate: in OGC a *Polygon* is the **set** of
its rings, here it is a **single** one, matching `Polygon` in
`@baustatik/geometry-2d` and `@baustatik/section-geometry`. The house
convention wins, so `outline: Polygon[]` means "one entry per ring", holes
included.

[geojson]: https://datatracker.ietf.org/doc/html/rfc7946

### Units: mm in, cm through the calculation

Branded `mm`, the same sentence `ShapeSpec` speaks — the unit in which a section
is drawn, dimensioned and printed. `bulge` stays unbranded: `tan(Δ/4)` is
dimensionless. The calculation path yields **cm** and therefore uses `toSI`
unchanged, so `cross-section/CONTEXT.md`'s claim that conversion happens at
exactly two places stays true ([ADR 0024](0024-units-at-the-package-boundary.md)).

### `Segment` is deleted outright

`Segment` was **dead code**. Nothing in `src/` ever constructed one; the four
parametric shapes produce `ShearSegment` (today `ShearFlowInterval`, see the
amendment above), a different, position-less type. Its
only consumer was `@baustatik/cross-section-viewer`, which received it from the
outside. There was nothing to migrate. The planned branch
`{ kind: 'thin-walled'; segments: Segment[] }` is gone with it.

### `schemaVersion` 5 → 6, without a migration tool

There are no stored v5 models that have to survive, and a migration tool exists
nowhere in the repo. **From here on every v5 file is lost.** That is chosen, not
overlooked, and it is written down here so nobody has to reconstruct the choice
from a rejected parse.

The new variant is purely additive at the record — a v5 could simply be waved
through, and that is precisely why the rejection is tested. A migration is a
tool somebody **calls**, sees and can decline.

## Consequences

- `@baustatik/cross-section` gains a dependency on `@baustatik/errors`, because
  the gate ([ADR 0032](0032-the-cross-section-gate-warns.md)) reports named
  classes. Same move as [ADR 0008](0008-model-rules-live-in-fem.md), same small
  price: every consumer already depends on it.
- `@baustatik/cross-section-viewer`'s port becomes
  `getGeometry(): SectionGeometry`. It draws the **carried** outline instead of
  deriving one — the first consumer that proves the denormalisation earns its
  keep.
- `@baustatik/script` passes the third variant through and rejects v5.
- Still open, and deliberately so: where the resolution graph → positioned
  geometry lives when P5 needs it and the viewer already has it; the
  self-intersection check; κ, cell solver, shear-centre derivation.
