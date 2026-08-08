# The cross-section has a creation policy

The P1 decision. You look this one up when you are about to add a knob to the
cross-section and cannot tell whether it belongs in `AnalysisPolicy` or here —
or when you wonder why a project file stores `arcTolerance` at all.

> **A setting that changes the stored figure is not an analysis setting.**

## The line ADR 0011 already drew

[ADR 0011](0011-analysis-settings-split-into-versioned-policy-and-ports.md)
defines an analysis setting as one that *"steers the calculation **without
changing the model**"*. `arcTolerance` changes it. The derived outline travels
**inside the record** ([ADR 0030](0030-the-section-editor-stores-a-wall-graph.md)),
and its point count hangs on the tolerance — `A`, `Iy` and `Iz` fall out of
exactly those points. Put it in `AnalysisPolicy` and the solver would carry a
number it never reads: the calculation path reads the **carried** outline, never
the recipe.

So `SectionPolicy` is its own root in `@baustatik/cross-section`, not a slice of
`AnalysisPolicy`.

```ts
// packages/cross-section/src/policy.ts
export type SectionPolicy = { readonly arcTolerance: mm };
export type SectionPolicyOverrides = Partial<SectionPolicy>;
export const DEFAULT_SECTION_POLICY: SectionPolicy;
export function createSectionPolicy(o?: SectionPolicyOverrides): SectionPolicy;
export function parseSectionPolicy(value: unknown): SectionPolicy;
```

**The full slice shape now, after the pattern of `fem-loads/src/policy.ts`**
(type · `…Overrides` · `DEFAULT_…` · `create…` · `parse…`), so the dated fields
below later just click in rather than reinventing the factory and its merge
semantics. Two entrances, two jobs: `createSectionPolicy` takes a **typed**
argument and therefore checks only *values*; `parseSectionPolicy` is the border
crossing from JSON and is the only one that checks *shape*.

**No `schemaVersion` of its own.** One version per record, and the record is the
snapshot; `LoadValidationPolicy` as a slice carries none either. Two version
numbers over the same bytes would be *"a second truth about the shape of the
data"*.

**`arcTolerance` is branded `mm`.** ADR 0032 wrote the unit that way, the code
had a bare `number`; the divergence is cleaned up here rather than cemented. The
field now sits in the model record next to `Wall.t` and `SectionNode.y`, which
all carry `mm`. It is unbranded inside `cross-section` before the number travels
to `geometry-2d`, which does not know `@baustatik/units`.

**`DEFAULT_ARC_TOLERANCE` does not move.** The policy *reads* it from
`@baustatik/section-geometry`; setting it here would bring back the state ADR
0032 removed — two numbers for one model assumption.

## One field, three dated candidates

| Candidate | due | evidence |
| --- | --- | --- |
| Miter limit + `JoinType` (the outline corner at oblique joints) | P3 | the offset needs it |
| Threshold "`Iyz` is zero" | P2 | `validate.ts` — P0 deferred it explicitly |
| Threshold "thick wall" (`t/h`) | P5 | the thin-wall idealisation's own limit |

### Explicitly not a candidate: the Gauss points for Grashof

They are read by `sectionProperties`, and that sits **on the calculation path** —
`getSectionStiffness` in `@baustatik/fem-section-resolve`, once per beam inside
`solve()`/`check()`. A setting there would be an *analysis* setting by ADR 0011's
line and would belong in `AnalysisPolicy`, not here.

But they do not become a setting at all — they become a **constant**. With
vertical edges `t(z)` is constant per strip, the integrand a degree-6 polynomial
and 4-point Gauss therefore **exact**; with oblique edges roughly 8 points reach
`1e-12`. That is convergence, not a choice, and a knob would invite someone to
make an exact result worse.

**The kink threshold is not a field either**: it is *derived* from
`arcTolerance` (`notch > arcTolerance`, ADR 0032), not set.

## `sectionPolicy` in the snapshot: `schemaVersion` 6 → 7

It stands at **project level**, beside `crossSections` and `materials`, as a
**mandatory** field.

**Project level, not per `CrossSection`:** two of the three future fields (the
`Iyz` threshold, the thick wall) *judge*, they do not create. Storing them per
cross-section would mean the same report may stay silent about two sections
under two different yardsticks.

**Mandatory, not optional:** *"COMPLETE means: the **effective** values stand
here, not the deviations. Otherwise the same project would silently compute
differently after a change to the software defaults."*
(`fem-solver/src/policy.ts`.) Backward compatibility is no counter-argument —
`schemaVersion: 7` rejects every older file anyway.

**The gain that justifies the denormalisation: the drift check becomes
well-defined for the first time.** Until now `checkOutlineDrift` could only mean
"derive again and compare" — expensive and Clipper2-dependent. With the tolerance
in the **same record** as the outline, the gate can say *"this outline was
produced under a different tolerance than the one written here"* without a single
geometry operation. This finishes the figure of
[ADR 0027](0027-catalogues-are-import-sources.md): not only the result is
copied, the **recipe** is too.

**Every v6 file is lost from here on**, as with v5 at P0. There are no stored v6
models that would have to survive, and no migration tool exists anywhere in the
repo. The substitution is more tempting here than at any earlier version —
`DEFAULT_SECTION_POLICY` is sitting right there — and that makes it the worst:
it would *assert* that the carried outline was discretised at `0.05 mm`, and the
drift check the field exists for would then judge against an invented number.

**Its owner validates it.** `parseFEMModelSnapshot` calls `parseSectionPolicy`
and lets `InvalidSectionPolicyError` travel outward, the same division of labour
with which `fem-solver` calls `parseLoadValidationPolicy`. A second shape check
in the parser would be two truths about one shape.

## Consequences

- **`@baustatik/cross-section` gains `@baustatik/section-geometry` as a real
  dependency**, and ADR 0032's sentence "no new dependency except `errors`"
  falls with it (see the banner there). `outgoingTangent` reads `Bulge.sweep`
  instead of recomputing `2·atan(bulge)` — the duplication is *resolved* rather
  than merely tested. **The price, stated:** from P3 on, `@baustatik/script`
  carries `clipper2-ts` transitively in its snapshot builder, because
  `geometry-2d` pulls it in then. The lever against that is not this edge but
  where `Polygon.offset` lands.
- **`SectionGeometryOptions` is gone** (breaking). Both gate doors take the
  policy.
- **`validateSectionProperties` takes the policy today without reading a field
  from it** — deliberately. The `Iyz` threshold lands there with P2; one break
  now instead of two over two subprojects. Its JSDoc says so, otherwise the next
  reader files it as an oversight.
- **`ViewerConfig` gains a second pull**, `getSectionPolicy` (breaking). A module
  constant would take the tolerance from a different source than the record the
  viewer draws; an *optional* pull would only make the silent divergence less
  noticeable. What `Bulge.isStraight` reads as straight, the viewer draws
  straight — one threshold, not two.
- **`createFEMModelBuilder({ sectionPolicy })` takes a complete policy, never
  overrides**, the same rule as `SolverConfig.analysisPolicy`: one application
  composes it once and hands the same frozen object to builder, gate and viewer.
  Omitting it means `DEFAULT_SECTION_POLICY` — and the *effective* value is what
  lands in the record regardless.

## A domain consequence of the bulge encoding: a tube is two walls

`bulge = tan(Δ/4)` has its pole at the full circle, where `tan(π/2)` yields not
`Infinity` but `1.633e16` — a silently wrong finite number. The value range is
therefore the open interval `(−2π, +2π)`, and DXF draws the same line (an
`LWPOLYLINE` cannot carry a full circle; that is what `CIRCLE` is for).

**A tube is therefore two nodes and two semicircular walls** (`Δ = ±180°`,
`bulge = ±1`) — which the gate enforces through `ZeroLengthWallError` anyway,
independently of the encoding: a single wall closing on itself has both nodes in
the same place. At a semicircle end-tangency is automatic, so the kink warning
stays silent by itself.

`Bulge` itself gets **no ADR**: it is additive, needs no migration, and both its
storage form and its sign convention were already decided in
[0030](0030-the-section-editor-stores-a-wall-graph.md) and
[0031](0031-the-cross-section-plane.md).

## Addendum (P2): the second field clicked in

`principalAxisTolerance` is in — exactly as the table above dated it, and
without touching the factory or its merge semantics. That was the point of
writing the full slice shape at one field.

```ts
export type SectionPolicy = {
  readonly arcTolerance: mm;
  /** Dimensionless. `|Iyz| <= tol · max(|Iy|, |Iz|)` means principal-axis position. */
  readonly principalAxisTolerance: number;   // default 1e-9
};
```

**No new ADR**, because the *form* was decided here. What P2 adds is the field's
own two decisions, and both are narrow:

- **Relative and dimensionless**, because an absolute bound in m⁴ would be two
  different statements for a cm-sized and an m-sized cross-section. Referred to
  `max(|Iy|, |Iz|)` rather than `Iy`, so the question does not fall silent
  precisely where `Iy` is small and `Iz` is large.
- **Read by the gate alone.** `principalAxes` stays total, pure and policy-free
  and returns `alpha ≈ 1e-17` — the right answer to the question asked. Snapping
  there would be an *analysis* setting on the calculation path (ADR 0011).
  Whoever wants to know "is this principal-axis position" asks the gate.

The name states the **question** ("does principal-axis position hold"), not the
quantity — the same figure as `arcTolerance`, which is not called
`sagittaTolerance` either. `0` is a permitted value and restores the exact
comparison, which is the right sharpness for anyone carrying only shapes and
catalogue rows.

`schemaVersion` goes **7 → 8**. `parseSectionPolicy` is strict, so every v7 file
is rejected; no migration tool, for the same reason as at v5, v6 and v7.

**Three schema breaks in three sub-projects is a pattern, not an accident** —
P3 (miter limit) and P5 (thick wall) are dated as further policy fields. Whether
a monorepo without consumers should be counting schema versions and changesets
at all is recorded in `packages/TODO.md` as its own question. P2 leaves the
procedure unchanged.
