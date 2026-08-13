# The outline comes from inflating wall runs

The P3 decision. You look this one up when a cross-section outline has a notch
at a junction node that no join type will close, when a hollow box comes back
without its hole, or when you are about to widen a single wall instead of the
run it belongs to.

> **What gets inflated is the run, not the wall.** The graph is decomposed into
> runs first; `clipper2-ts` then inflates *and* unions them, and the winding is
> **set** from the resulting nesting rather than passed through.

Three decisions in one document, because all three come from the same root and
because **stored outlines depend on them**.

## Why now

Since P0 the editor stores a wall graph plus the outline it implies
([ADR 0030](0030-the-section-editor-stores-a-wall-graph.md)). P2 made
`kind: 'outline'` fully usable — draw, derive, compute, check. For
`kind: 'midline'` exactly one step was missing: **nobody derived the outline.**
Whoever built a wall graph typed the outline next to it by hand; the demo did it
literally, with six hand-computed points.

## 1 · What gets inflated is the run, not the wall

`JoinType` acts **within** a path, never between two of them. Inflate each wall
on its own and union afterwards, and Clipper2 never sees the corner between two
walls: on the outside of a corner a notch is left that **no** join type closes.
Two walls close their corner only if they enter as **one** path.

So the graph is decomposed before the offset:

```text
Branch      = run between junction nodes (degree ≠ 2), ADR 0030
Offset path = branches chained at every node, split at every thickness jump
```

`Branch` is the word ADR 0030 reserved — *"a run between junction nodes in
thin-walled theory"* — and it is **exported**, not hidden inside the derivation:
P5 needs exactly this decomposition for the wall path of open profiles, and a
second decomposer would be the duplicate vocabulary ADR 0030 argues against.

The offset path goes further than the branch: it chains *through* junctions,
because that is the only way the corner gets a miter. Which two walls are chained
changes the outline, so the rule is part of the contract and not an
implementation whim:

> **Straightest continuation.** At every node the pair of walls with the smallest
> change of direction is chained through. A tie is decided by the wall id.

It is deterministic *and* it minimises what it decides. The promise that hangs on
it is the one you want: **two wall graphs of the same shape with different ids
produce the same outline.** The change of direction is measured at the **end
tangents**, not at the chords — on an arc wall the tangent deviates from the
chord by `Δ/2 = 2·atan(bulge)`, and the gate's kink warning has been reading that
same quantity since P1 (`Bulge.sweep`). Both now read one function,
`outgoingTangent`.

A **closed loop is a branch without ends**, recognised **topologically** (first
node === last node), not geometrically: two nodes on the same coordinates are two
nodes, and an epsilon question has no business inside a graph.

The split at a thickness jump is local to the offset and gets no name of its own:
Clipper2 takes **one** `delta` per offset call, so two wall thicknesses never
enter the same offset. Two collinear walls `t = 6` and `t = 10` then butt against
each other, and that is the correct figure — the step is real.

> **Extended by [ADR 0038](0038-a-chained-joint-is-mitered-across-a-thickness-jump.md).**
> The sentence above holds for *collinear* walls only. Where the jump coincides
> with a corner, the split left the wedge between the two butt ends out of the
> figure; the mitre is now filled in explicitly.

## 2 · `clipper2-ts` inflates and unions; martinez is untouched

`Polygon.union` cannot return a hole: `fromMartinez` keeps only ring 0 of each
result polygon. And because one `delta` per call means several offset calls, a
boolean union is needed **anyway**. Both are done by the same library.

The new door is `Polygon.inflate`, **not** `Polygon.offset`:

```ts
inflate(paths: readonly InflatePath[], options?: InflateOptions): Polygon[]
```

Input is open or closed **runs**, each with its own `delta` and end type; output
is a **ring set with holes**. `offset` stays free for inflating a closed *ring*
to one side, should it ever be needed; one name for both would be the conflation
this repo otherwise avoids. It sits on the `Polygon` namespace because that is
what it produces — the same figure as `Polygon.fromLines`.
`section-geometry` passes it through into the `y`/`z` plane under the same name.

Two clipping libraries now stand side by side. That is deliberate and **not an
end state** — swapping one out across a package with foreign consumers does not
belong in P3. It is recorded as an open point in `packages/TODO.md` §5, together
with the prerequisite it hangs on: a multi-ring polygon in `geometry-2d`.

**The hole comes from the closed run.** A closed path under `EndType.Joined`
gives the ring strip *including* its inner ring in one call — measured, not
assumed (`geometry-2d/tests/clipper2.test.ts` pins it, and the hollow box hangs
on it). The fallback, had it failed, was two `EndType.Polygon` offsets and a
subtraction.

## 3 · The winding is set, not passed through

Clipper2 encodes hole against material in the sign too, and that sign depends on
its own axis assumption. The sentence `fromMartinez` has carried since P2 holds
here unchanged: *the winding of a foreign library is not a statement of this
package* ([ADR 0034](0034-winding-is-mathematical-and-the-factory-does-not-normalise.md)).

- The **nesting** is read from `PolyTreeD`, not guessed from the sign.
- Then it is set: outer ring `signedArea > 0`, hole `< 0` (ADR 0034).
- The **order** is sorted: outer rings by `|A|` descending, every hole directly
  behind its outer ring, holes among themselves likewise.

The sorting is not cosmetics: `outline` is stored, serialised and — from now on —
compared against a re-derivation. A library's order would turn every version
change into a reordering in the model diff that means nothing.

## 4 · Miter also on the arc, and what it costs

`JoinType` is nailed to `Miter`. `Round` would round off every corner of an
I-profile and the identity `A = 2·b·tf + tw·(h − 2·tf)` would fall; there is no
second admissible choice, so there is no setting either.

**Miter applies on the discretised arc as well, and that is the right answer, not
a concession.** `JoinType` is a property of the path, not of the vertex — a run
"straight – 90° arc – straight" cannot have two of them. Splitting the run at the
arc boundary would be wrong: it would bring back the notches from decision 1 at
places where there is no joint at all, and tangentiality is precisely what is
wanted there. `Round` would moreover be a **second** approximation of the same
curvature — the library would re-discretise a circle that `Bulge.toPolyline` has
already discretised.

The price, said out loud: on the outside of an arc the outline circumscribes the
true curve instead of cutting it, in the order of `arcTolerance`.

> **Amendment, 2026-08-13 — the policy field is renamed.** `arcTolerance` is
> now called `discretisationTolerance` (ADR 0033). The drift bound is
> `discretisationTolerance · U`; the constant keeps its name
> (`DEFAULT_ARC_TOLERANCE` stays). This ADR keeps the old name in the text; the
> decision it records is unchanged.

## What follows from it elsewhere

- **`miterLimit` becomes the third `SectionPolicy` field**, at default `2`. It
  changes the **stored** outline — literally the criterion by which
  [ADR 0033](0033-the-cross-section-has-a-creation-policy.md) separated
  `arcTolerance` from the `AnalysisPolicy`. This is ADR 0033 applied, not decided
  anew. `schemaVersion` goes to `9`.
- **`OFFSET_PRECISION = 6` is not a policy field.** The `…D` API rasters all
  coordinates; the library default of `2` would be `0.01 mm` and thus only a
  factor of 5 below `arcTolerance`. This is quantisation of the computation path,
  not a model assumption.
- **The drift check is redeemed** (ADR 0030 promised it and P0 through P2 did not
  deliver it): the gate re-derives the outline and compares `A`, with a limit
  *derived* from `arcTolerance · U` rather than set. Warning, not error — the set
  is computable, it is simply no longer the one that was stored. It runs for
  **both** variants, so the `outline` branch gets a check it has lacked since P2.
- **`bulge` is checked.** P1 left it open; P3 is the first place that trips over
  it, because a non-finite value would otherwise run into a foreign library whose
  result then *looks plausible*.
- **The viewer draws the outline in orange.** That the outline is *derived* and
  the walls are the *input* is a statement of the viewer, and in black on black
  you cannot see the notch at a degree-3 node.

## What this decision does not do

No κ (P4/P5), no shear centre (P5), no stress points. No cell detection, no
multi-cell sections (P6). No input, no constructors, no fillet (P7). No DXF (P8).
**No self-intersection check** — in the `midline` branch Clipper2 delivers
non-overlapping rings by construction; in the `outline` branch it stays open, and
the drift check does not catch it (a self-intersecting ring derives to itself, so
the drift is zero). No replacement of martinez. No change to `fem-element`,
`fem-section-resolve` or `fem-solver`.
