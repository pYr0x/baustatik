# The reinforcement lives on the cross section, and carries no material

You look this one up when you ask why `CrossSection` has a `reinforcement`
field after
[ADR 0055](0055-the-cross-section-response-is-the-shared-machine.md) said there
would be none, why a Bewehrungslage and a Bewehrungsrang are the same object,
why `Asmax` sits on the element and not on the layer, or why adding
reinforcement does not move a single section value.

> **The reinforcement layers live on `CrossSection`, on the `shape` and
> `section-geometry` variants, as `readonly ReinforcementLayer[]`. A layer is a
> named group — it *is* the Bewehrungsrang, there is no second grouping. An
> element is a position in mm, an `As` in cm² and an optional `Asmax` in cm².
> No material, no grade and no strength reaches the record.
> `sectionProperties` does not read the field, and `computeFESectionValues`
> cannot see it: that door takes a `SectionGeometry`, one level below.**

This closes the question ADR 0063 left open by name ("Where the reinforcement
layers live in the model. Still open, still an ADR of its own, still the thing
that raises `schemaVersion`"), and the identical question in
`packages/concrete-design/TODO.md` (2) and
`packages/cross-section-response/TODO.md` (3). It **narrows** ADR 0055; it does
not overturn it.

## What ADR 0055 actually forbade

ADR 0055, "The reinforcement is composed, not added":

> A rebar layer has a position **and a material**. The position is geometry in
> mm. The material is a strength, and `cross-section` may not know one. So there
> is no new field on `CrossSection`.

The prohibition is a conclusion, and it stands on one premise: that a layer
carries a material reference. Remove the material from the model layer and the
premise is gone, and with it the conclusion. What survives untouched is the rule
the prohibition was protecting, and it is still greppable —
`packages/cross-section/CONTEXT.md`:

> **Kein Symbol in diesem Package kennt eine Schnittgroesse oder eine
> Festigkeit.**

`{ y, z, As, Asmax }` knows neither. It is geometry in mm and an area in cm² —
the same category as `SectionNode.y` and `Wall.t`, and the same mixture of units
`StressPoint` already carries (`y`, `z`, `t` in mm, `Sy`, `Sz` in cm³).
`grep -r 'fy\|fck\|gamma\|alphaCC' packages/cross-section/src` finds nothing
after this change, exactly as before it.

**Where the grade goes instead: nowhere in the model, for now.** Every normative
number is built by `concrete-design` and travels in with the law (ADR 0055,
ADR 0063). `MaterialKind` keeps its three families;
`packages/material/src/model.ts` already writes down why:

> KEIN `'reinforcement'`: Betonstahl ist nie das Material eines Stabs, sondern
> die Einlage eines Stahlbetonquerschnitts.

`ReinforcedSection = { section, layers }` in `cross-section-response` remains
what ADR 0055 made it: the **calculation** object, composed at design time, where
the law joins the geometry. This decision gives that geometry a persistent home;
it does not move the composition.

## Why on `CrossSection` and not on `SectionGeometry`

`SectionGeometry` is the obvious-looking place — `feValues` sits there, and the
drawn figure's rings sit there. It is the wrong one, and the reason is a type,
not a preference:

```ts
computeFESectionValues(geometry: SectionGeometry, policy: SectionPolicy)
```

`packages/cross-section-fe/src/index.ts:139`. Its second line is
`deriveOutline(geometry, policy)`, and from there on the pipeline sees
`readonly Polygon[]` and nothing else. A reinforcement field on `SectionGeometry`
would be silently dropped there — correct behaviour, arrived at by accident, and
one refactor away from not being true any more.

One level up, next to `geometry` rather than inside it, "the section values do
not change" stops being a promise and becomes the **type**: the FE door cannot
be handed the reinforcement at all. The same holds for `deriveOutline` and for
every consumer that takes a geometry rather than a record.

**Not on the `profile` variant.** ADR 0063 keeps the catalogue profile out of
the fibre list — it carries a table row and no geometry, nothing writes it out
as rings, and `Wply`/`Wplz` stand tabulated. Leaving the field off that arm makes
that a compile error instead of a runtime check.

## The field is legal only on a Vollquerschnitt

Being on the right variant is not enough. `kind: 'shape'` covers both
idealisations, and so does `kind: 'section-geometry'`. Reinforcement belongs to
neither thin-walled arm: a thin-walled figure is a **cut model**, its κ, `It` and
shear centre come from the wall path (ADR 0040/0041), and a bar sitting on a wall
centre line answers no question there.

The permitted cell is the same one `computeFESectionValues` serves:

```text
profile           → never
section-geometry  → geometry.kind === 'outline'  ||  geometry.idealisation === 'solid'
shape             → shape.kind === 'rectangle'   ||  shape.idealisation === 'solid'
```

The `rectangle` arm carries no `idealisation` at all — it *is* the solid section,
which is why it is named rather than tested.

**This one cannot be a compile error, and the contrast is worth naming**, because
the neighbouring case *is* one. `SectionGeometry` forbids its own bad cell —
"freier Umriss, aber duennwandig gerechnet" — at the type, and its JSDoc says how:
`idealisation` sits **inside** the `midline` arm, so the illegal combination
cannot be written down. That trick does not reach here. `idealisation` lives
inside `ShapeSpec` and inside `SectionGeometry.midline`, while `reinforcement`
sits beside them on the record — and an optional field cannot be conditioned on a
value nested in a sibling without splitting the union on something other than
`kind`, which is the repo's discriminant everywhere.

So it is a **gate finding, and an error**: a bar on a thin-walled figure is a
modelling mistake, not a degree of freedom. Stating that here keeps the next
reader from trying to type it and concluding the check was forgotten.

**And the switch gets one home.** That predicate is written out three times
already — `calculation/geometry-properties.ts:40`, `stress-points/index.ts:84`
and `feGeometry` in `apps/demo`. A fourth copy for the gate is how three become
four and then disagree about a `hollow-rectangle`. It becomes `isSolid(cs)`, with
a geometry-shaped sibling for the call site that has no record, and the existing
sites fold onto it.

## The section values do not change, and tidiness is not the reason

The tempting reading is that reinforcement *could* be folded into `A` and `Iy`
through `n = Es/Ecm` and simply is not, out of package hygiene. That reading is
wrong, and the real reason is stronger:

> **The `As` in the record is the starting value of an iteration, not the
> reinforcement that will be built.** A ULS design searches for the `As` at which
> the inner forces balance the outer ones. Multiplying the given `As` into a
> stiffness means computing with a number the design is in the middle of
> declaring wrong.

Ideal section values of state I therefore have a precondition, and it is not
"someone asked for them": the reinforcement has to stand. That is true **after**
a design run, and it is true up front for a layer whose every element carries
`Asmax === As`. The distinction arrives with `Asmax` below and did not have to be
invented for this paragraph.

Consequences, all checkable:

- `sectionProperties` (`calculation/section-properties.ts:24`) does not read the
  field. `A`, `Iy`, `Iz`, `Iyz`, `ys`, `zs`, `alpha`, `Iu`, `Iv` are concrete
  values and stay concrete values.
- `feValues` and its `fingerprint` (`{ A, Iy }`) are unmoved.
- `fem-section-resolve` reads four fields out of `SectionProperties` and is
  untouched. Where state I eventually lands is ADR 0045's line — the one place
  in the repo where geometry is multiplied by material — and that is a decision
  of its own.

## A layer *is* the Bewehrungsrang

Two words were on the table: "Lage" for the geometric group, "Rang" for the group
the design decides over. They are the same object, and this decision keeps
**one**: `ReinforcementLayer`, whose `id` (`'unten'`, `'oben'`) is the handle the
design grabs when it says "increase this one, leave that one".

There is no `rank` field and no `ReinforcementRank`. Two groupings over the same
elements would be two things that can drift apart, and the second one would exist
only to be identical to the first.

The layer therefore carries nothing but `id` and `elements`. It is a name and a
set.

## `Asmax` sits on the element, not on the layer

An earlier sketch put a summed ceiling on the layer. It is on the element:

```ts
type ReinforcementElement = {
  readonly id: string;
  readonly y: mm;          // im Rahmen der Geometrie daneben
  readonly z: mm;
  readonly As: cm2;        // Anfangswert
  readonly Asmax?: cm2;    // abwesend = unbegrenzt; === As = eingefroren
};

type ReinforcementLayer = {
  readonly id: string;
  readonly elements: readonly ReinforcementElement[];
};
```

**One ceiling per element, and no second one above it.** A layer-level `Asmax`
would be a number that can contradict the sum of the numbers below it, and the
gate would then have to decide which of the two the design obeys.

**"Do not increase this" is `Asmax === As`, not a flag.** A boolean beside the
number is a second way to say the same thing, and the two can disagree. Absence
is the third state and means unbounded — the same shape as `feValues`, where an
absent block is an answer rather than a default.

**How** a layer is increased — proportionally across its elements, or by
reshuffling bars — is not decided here. It is `concrete-design`'s outer loop
(ADR 0055). The record says which elements belong together and how far each may
go.

## Units: mm for the position, cm² for the area

The position follows the geometry beside it: mm, in the frame of the variant that
carries it. For `section-geometry` that is the frame of the `rings`; for `shape`
it is the frame `shapeOutline` writes in — `y = 0` on the symmetry axis, `z = 0`
at the **top** edge, `z` downwards.

`As` and `Asmax` are **cm²**, because that is what a Bewehrungsplan states and
what a report prints. The record is then the input form and the output form at
once, and no factor sits between what was written and what is read back. The
mixture inside one record is not new: `StressPoint` has carried mm and cm³ side
by side since ADR 0052, and the branded types out of `@baustatik/units` make the
mixture unmixable.

**The conversion has exactly one place.** ADR 0063 fixes the fibre list at mm and
mm², so cm² → mm² happens in the fibre production in
`@baustatik/cross-section-response`, out of `@baustatik/units` and never as a
literal (ADR 0024) — beside the kN/kNm ↔ N/mm gate that already lives there.
`cross-section` converts nothing; it carries the record.

## The positions are absolute, and that is a first cut

Both variants store `y`/`z` outright. For the drawn figure there is nothing else
to store — the outline itself is absolute points.

For the parametric shape it is a **deliberate first cut with a known failure**:
change `h` from 500 to 600 and an element at `z = 450` keeps its coordinate while
its axis distance to the bottom edge silently grows from 50 mm to 150 mm. Nothing
fires. The successor is edge-relative placement — `{ edge: 'bottom', d1, n }`,
written out by a `shapeReinforcement` beside `shapeOutline`, on the pattern of
[ADR 0062](0062-the-parametric-shape-writes-itself-out-as-an-outline.md) — and it
is **not built here**. It is affordable to defer because the input is written in
code today, where the shape and the coordinates stand three lines apart, and
because `Polygon.inflate` with a negative delta already yields the cover contour
such a writer would need.

Line reinforcement is the same shape of successor: a layer whose `elements` are
written out from a line. Neither successor changes the layer, the element or
`Asmax` — they add a second way to produce the same `elements`, exactly as
`midline` and `outline` are two ways to produce the same `Polygon[]`.

The gate carries the interim: an element outside the concrete figure is a finding
(below), which catches the gross case of a shape that grew away from its bars.

## `Element` is a reserved word here, and it is spent on purpose

`Wall`'s JSDoc reserves it:

> `Wall` und nicht `Element` oder `Segment`: `Element` ist im Monorepo mit dem
> Stabelement (`@baustatik/fem-element`) belegt.

`ReinforcementElement` spends that reservation. The prefix carries the
disambiguation, and "Bewehrungselement" is the term in use for the thing — a
point that may stand for one bar or several, which `Bar` would misname. Recorded
here so the next reader sees a decision rather than a slip. `Wall` keeps its name
and its reasoning; the reservation now reads "not bare `Element`" rather than
"not the word at all".

## The gate

`validateSectionGeometry` reports; nothing new throws.

**Errors** — nothing downstream can act on these:

- Reinforcement on a figure that is not a Vollquerschnitt — a `shape` or a
  `midline` graph with `idealisation: 'thin-walled'`. The one finding that could
  not be made a type; see above.
- `As <= 0`, or not finite.
- `Asmax < As`: the starting value is already above its own ceiling.
- Duplicate layer `id`.
- Duplicate element `id` across **all** layers of the section. The viewer builds
  `cross-section:rebar:${layer.id}:${element.id}` from them, and the reconciler
  needs that unique.

**Warning:**

- An element that does not lie inside the concrete figure. `Polygon.contains`
  from `@baustatik/section-geometry` against the derived outline; the winding
  rule hands holes over for free (ADR 0034). A warning and not an error, because
  the figure may be mid-edit and the coordinate may be the one that is right.

No minimum reinforcement, no cover check, no bar spacing. All three are EN 1992
and belong to `concrete-design` (ADR 0056).

## Consequences

- **`schemaVersion: 14 → 15`** in `@baustatik/script` (ADR 0049). A v14 file is
  unchanged in shape and unchanged in meaning — it simply has no reinforcement —
  but `exactKeys` is a whitelist, and the repo rejects rather than migrates.
- **`@baustatik/cross-section` gains two types, one optional field and one
  predicate**, and keeps its dependency list, its unit rules and its greppable
  boundary. `isSolid` is the third of those and is a **consolidation**: it
  replaces two hand-written copies of the same switch rather than adding a
  fourth.
- **`@baustatik/cross-section-viewer` gains a band** between `outlines` and
  `fe`, fed by a pull. The element is drawn as a **marker**: a screen-constant
  `circle`, like the centroid symbol, and **not** at a radius derived from `As`.
  It shows a position, not a picture of a bar. Because the coordinates are
  absolute, the band needs no `properties`.
- **Nothing changes in `@baustatik/cross-section-fe`** — not a line. That is the
  touchstone, the same one ADR 0062 measured itself against: if that package had
  to be touched, the field would be sitting in the wrong place.
- **Nothing changes** in `fem-section-resolve`, `cross-section-stress`,
  `fem-solver`, `mesh-2d-wasm` or either solver crate.
- **A changeset, `patch`**, with the break in the body (ADR 0036).

## Not part of this decision

- **Which reinforcement grade, and where it is stated.** `concrete-design` builds
  the laws; whether the grade is a design setting, a second material on the beam
  or a later field is open, and nothing here presumes an answer.
- **How a layer is increased**, and the As search itself — `concrete-design`.
- **Ideal section values of state I.** Only meaningful once the reinforcement
  stands, and ADR 0045 already names their owner.
- **Edge-relative placement and line reinforcement.** Named above as successors,
  with the failure each fixes.
- **Placing an element by clicking in the canvas.** `ElementIntent` in
  `@baustatik/render-core` is a `todo` and is not exported, `RenderDriver` has no
  element hook, and the Konva adapter does pan and zoom. That is a decision at the
  rendering layer, not here.
- **Minimum reinforcement, cover, bar spacing, crack width, anchorage** — and with
  them the bar diameter, which this record deliberately does not carry: it has no
  reader today, and a frozen number without a reader cannot be noticed when it is
  wrong (the argument `@baustatik/material` makes for not copying `fyk`).
- **Concrete shear.** Not a strain-plane problem (ADR 0055, ADR 0063).
