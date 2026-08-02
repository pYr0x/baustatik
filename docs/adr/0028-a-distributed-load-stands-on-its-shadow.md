# A distributed load stands on its shadow

The figure of a beam line load — the filled area with an arrow at each end — sits
on a **baseline**, and that baseline is the *shadow of the loaded segment, cast by
parallel light travelling in the load direction*. For `referenceLength:
'trueLength'` there is no shadow and the baseline is the beam axis itself.

A beam force load has three degrees of freedom in how it is stated: `frame`
(`local`/`global`), `axis` (`x`/`z`) and `referenceLength` (`trueLength`,
`horizontalProjection`, `verticalProjection`). That is nine drawings, and RFEM
shows all nine (`apps/demo/Linienlast1.png` … `Linienlast9.png`). The question was
which rule produces them.

## Why not "the reference length names the baseline"

The obvious rule — `horizontalProjection` draws on a horizontal segment of length
`|Δx|`, `verticalProjection` on a vertical one of length `|Δz|`, `trueLength` on
the beam — is wrong twice, and each counter-example kills it on its own:

- **`Linienlast4`** (local z, projected): the block stands *rectangular on the
  beam*, exactly as in the unprojected `Linienlast1`. Under that rule it would
  have to stand on a vertical segment.
- **`Linienlast8`** (global X, `horizontalProjection`): the block stands *upright*
  with horizontal arrows, identical to `Linienlast5` — even though the measured
  extent is `Δx`, which is horizontal. Under that rule the load direction would be
  parallel to its own baseline and the figure would have no height at all.

The shadow rule reproduces all nine. Light perpendicular to the beam (local z)
casts the beam onto itself, which is `Linienlast1` and `4`. Vertical light (global
Z) casts a horizontal segment, which is `6` and `9`. Horizontal light (global X)
casts a vertical one, which is `5` and `8`.

## What follows, and is deliberate

**The baseline is always perpendicular to the load direction.** That is not an
extra rule but the definition of a shadow, and it is what makes the figure
constructible: the area is laid off *against* the load direction from the
baseline, so it can never collapse into a line. The nine cases need no case
distinction at all.

**The two projections draw identically.** For a given load direction,
`horizontalProjection` and `verticalProjection` produce the *same* picture; they
differ only in `referenceFactor`, and the viewer does not scale the ordinate by
the acting value. RFEM behaves the same way. The drawing therefore states *how the
load acts*, not *how it was entered* — which of the two projections was chosen is
readable in the dialog, not in the picture.

**Except where the factor is exactly 0, and there nothing is drawn.**
`verticalProjection` on a horizontal beam, `horizontalProjection` on a vertical
one: the beam has no extent along the measured axis, so the load puts nothing on
it at all. This is not a scaling question the picture may skip — it is the
difference between *a little* and *none*, and RSTAB draws nothing here too. The
per-load normalisation makes it worse than a silent omission would be: a load
spanning several beams is scaled to its own peak, so on the member that carries
nothing the figure would stand at *full* height. The threshold is the exact 0 and
not a policy bound — below it there is nothing, it is the edge of the range. A
nearly horizontal beam carries nearly nothing and keeps its figure; where a bound
on *that* belongs is a question for load validation
(`NearlyDegenerateReferenceLengthWarning`), not for drawing.

**One case is left over, and only one: the load direction parallel to the beam
axis.** Then the shadow is a point and the beam axis is parallel to the load. It
covers `local x` always, and `global x`/`global z` when the beam happens to be
horizontal or vertical. There the height is laid off perpendicular to the beam on
the local −z side and the two arrows lie *lengthwise inside* the block — without
them a load and its opposite would be the same picture. The switch is not an angle
threshold but a visibility one: it trips when the built height would be thinner
than the stroke drawing it.

## Why the derivation lives in the viewer

`@baustatik/fem-load-resolve` owns *where a load sits and which way it points*,
and the viewer takes `loadStation` and `loadDirection` from it rather than
deriving them a second time — derived twice, picture and calculation drift apart
in exactly the pair one looks at the picture for.

The shadow is **composed** from those two answers, not derived beside them. It
stays in the viewer because `load-geometry.ts` exists for questions *both* sides
ask, and the solver never asks this one: it needs `referenceFactor`, a scalar, and
has no use for a line in space. Moving it there would hang a drawing question on
the calculation package.

## Consequences

- `@baustatik/fem-viewer` draws `distribution: 'constant'` and `'trapezoidal'`
  force loads. Line **moments** still produce no specs — they need a symbol, not a
  baseline.
- The viewer now asks `referenceFactor` — the one scalar from the calculation side
  it consults, and only to decide *whether* a beam is drawn at all, never how tall.
  The decision is made **per beam**, not per load: one load object over a whole
  frame keeps its figure on the members that carry and loses it on those that do
  not, which is what a projected load means.
- The figure has no height constant of its own. The arrow tips sit on the
  baseline, the outer edge of the polygon *is* the line joining the arrow tails,
  and its length is `forceArrowLengthPx`. The only new number is the gap between
  beam and baseline.
- The ordinate is normalised **per load** (`max(|q1|, |q2|)` → full arrow length),
  not across the picture. Two loads are therefore not comparable by height; the
  height shows the course *within* one load. The reference size across all visible
  loads — the open *scaling question* — stays open, now deliberately.
- Both ends carry a marker on the beam axis. Under the shadow rule the figure no
  longer stands above the beam, so without it the picture would not say which
  piece of beam is loaded.
- `@baustatik/render-core` learned to validate `RectangleSpec`. The spec was in the
  union and the Konva adapter could draw it, but `validateSpec` fell through to
  "unknown spec kind" — the marker was the first caller.
