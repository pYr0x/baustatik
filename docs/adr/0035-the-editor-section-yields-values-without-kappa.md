# The editor cross-section yields values — without κ

The second P2 decision. You look this one up when a beam with a drawn
cross-section computes stiffer than you expected, when `check()` reports a
warning you have not seen before, or when you wonder why `sectionProperties`
gives you numbers but no `kappaY`.

> **Green on the carried outline delivers `A`, `Iy`, `Iz`, `Iyz`, `ys`, `zs`
> (and `alpha`/`Iu`/`Iv` as algebra on top). It does not deliver κ or the shear
> centre — and the solver says so when someone asked for shear deformation.**

## The gap this closes

[ADR 0030](0030-the-section-editor-stores-a-wall-graph.md) gave the editor
cross-section its contract, [ADR 0033](0033-the-cross-section-has-a-creation-policy.md)
its creation policy. `sectionProperties` still returned `undefined` for
`kind: 'section-geometry'`: the editor carried its contract but no numbers, and
a beam using one failed `check()` with `UnknownSectionStiffnessError`.

**It does not depend on the offset (P3).** `outline: Polygon[]` stands in
**both** variants of `SectionGeometry`, and `Polygon` carries no `bulge` — it is
already discretised. Green never reads `nodes`, `walls` or `rings`, only
`geometry.outline`, and needs neither Clipper2 nor the `kind` discriminator for
that. The "silent gap at arcs" that the preliminary sketch attributed to this
step was closed by P0's carried outline.

## Where the work sits

**The algebra of a single ring is `Polygon.moments` in `@baustatik/geometry-2d`,
with a `y`/`z` wrapper in `@baustatik/section-geometry`.** The second area
moments of a polygon are plane geometry, not cross-section knowledge: no
cross-section term appears in the signature, and the function is scale-free.

```ts
type PolygonMoments = {
  A: number;                    // ∫dA        = ½ Σ cross
  Sx: number; Sy: number;       // ∫x dA, ∫y dA
  Ixx: number; Iyy: number;     // ∫y² dA, ∫x² dA
  Ixy: number;                  // ∫xy dA
};
moments(points: Point[]): PolygonMoments;   // RAW about the ORIGIN, SIGNED
```

**Raw about the origin, one ring, signed.** Centroid-relative per ring would be
useless for a sum — the ring centroids differ, so each would have to be shifted
back individually. Raw, all six numbers add up **linearly** over the rings, the
hole contributes through its own sign, and the Steiner shift into the overall
centroid happens **once**, at the end. `Polygon[]` in the signature would drag
"several rings are one cross-section" into `geometry-2d`, where it does not
belong; the sum is a three-liner in `cross-section`.

`Iyz = +∫y·z dA`, **without negation** — see the addendum to
[ADR 0031](0031-the-cross-section-plane.md). That is not a choice but forced:
ADR 0031 writes `tan 2α = −2·Iyz/(Iy − Iz)`, and the mathematical convention
goes with it.

**The composition sits in `cross-section/src/green.ts`**: sum over `outline`,
one Steiner shift, done.

## One entrance per source, one shared exit

`geometryResult()` joins `shapeResult()` in `section.ts` as the second and last
mm → cm entrance. It scales the **points**, not the result — the same figure as
`shapeResult`, which scales dimensions into a scale-free formula. Scaling the
result afterwards would need three different factors (cm², cm⁴, cm) and thus
three chances to get one wrong.

The claim in `cross-section/CONTEXT.md` is therefore no longer "exactly two
places" but **"one entrance per source, one shared exit (`toSI`)"** — which was
the actual statement all along, it just stood there with the wrong number.
Computing in metres would lose diffability against the printed table; an
mm twin of `CatalogueValues` would duplicate the intermediate type.

## `deriveOutlineFromRings` — the ring branch, without a library

For `kind: 'outline'` the derivation needs **no** Clipper2, only
`Bulge.toPolyline` per edge and one `.slice(0, -1)` in exactly one place (P1
moved the chainer here deliberately). It lives in `cross-section`, because a
geometry package cannot take a `SectionGeometry`-shaped type, and because
`cross-section` has had the geometry edge since P1.

With it, **`kind: 'outline'` is fully usable after P2**: draw, derive, compute,
check. Without it every caller would decompose their arcs by hand — exactly the
silent divergence ADR 0030/0033 exist to prevent. The `midline` branch (offset)
remains P3.

## What is missing, and that it stays missing

`sectionProperties` returns the full set for the third source **except**
`kappaY`/`kappaZ` and `yM`/`zM`. So a beam with an editor cross-section
computes `EA` and `EI` correctly and runs with `GAs: 'rigid'`, i.e. **without
shear deformation** — the stiffer and therefore less conspicuous direction.

`stressPoints` stays `undefined`: their values are Grashof, so P4. A template
with coordinates but no values would be half an answer.

## And the solver says so

P2 makes `GAs: 'rigid'` **reachable for the first time**. It used to be
unreachable: all four parametric shapes compute κ in *both* idealisations, all
42 catalogue rows carry `Ay`/`Az`, and the editor source delivered nothing at
all. From P2 on there is a first set with `EA`, `EI` and `GAs: 'rigid'` — and
with it, `shearDeformation: true` silently computes the opposite of what was
asked.

The check goes into the beam loop that already exists in `check.ts`. What makes
it exact: the policy switch takes effect **later** (`solve.ts`), so at check time
`GAs === 'rigid'` can **only** have come from the cross-section.

```ts
analysis.policy.shearDeformation === true  &&  getSectionStiffness(beam).GAs === 'rigid'
   → new ShearDeformationUnavailableWarning(beam.id, beam.crossSectionId)
```

- **Into `model.warnings`**, class in `fem-solver/src/errors.ts` — following the
  precedent of `UnknownSectionStiffnessError`, whose comment already describes
  the situation: the finding belongs to the model but cannot live in
  `@baustatik/fem`, which does not know `SectionStiffness`. A third channel on
  `CheckReport` would be breaking for every surface reading the report, for a
  finding that fits the existing ranking.
- **State stays `ready-with-warnings`** — it computes, it just says so.
- **`fem-solver/src/policy.ts` is corrected.** *"Every cross-section HAS a shear
  stiffness"* stopped being true at P2, and a comment carrying a falsified
  assumption forward is worse than none.
- **No fifth gate warning in `cross-section`.** Sentence 4 (`yM === undefined`)
  already fires in exactly the same situation.

**The warning is not a transitional net.** Two cases survive P4/P5: a future
catalogue series without `Ay`/`Az` (the type keeps the slot open), and above all
the **closed cell** — P4 covers `solid`, P5 open thin-walled profiles,
multi-cell would be P6, and *"P6 must never come"*. A thin-walled cross-section
with a closed cell therefore has no κ, permanently.

## Price, spoken out loud

`Iu === Iy` holds for the third source only to within noise, never bit-exactly —
unlike for shape and catalogue, which still run through the exact `Iyz === 0`
short cut. That is also why the gate's sentence 1 had to become a relative
comparison; see the addendum to
[ADR 0033](0033-the-cross-section-has-a-creation-policy.md).
