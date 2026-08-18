# The diagram ordinate is a world measure, and its reference spans all beams

You look this one up when two moment diagrams in one picture do not compare the
way you expected, when a diagram vanishes entirely instead of drawing a zero
line, or — and this is the one that matters — when you find a size in
`@baustatik/fem-viewer` that is *not* divided by `vp.scale` and wonder whether
that is a bug.

> **`ref[K] = max |K(x)|` over ALL beams and ALL stations, one per internal
> force. The ordinate `offset(x) = (K(x)/ref[K]) · diagramOrdinateM ·
> exaggeration[K]` is laid off along `ez` in METRES and therefore scales with
> zoom — the first world measure in a package whose invariant reads
> "schematic, not scale drawing". `ref[K] === 0` produces not a single spec.**

## Why now

The data side had been finished for a while: `internalForcesAlong` delivers the
stations of a beam including the exactly computed extremum locations and the
doubled entry at a jump. What was missing was the **scaling rule** —
`packages/fem-viewer/CONTEXT.md` filed the N/V/M diagrams under *Known
constraints* with exactly that reason, and `packages/TODO.md` §2 filed the same
open question for the distributed loads.

Both hang on one sentence: *what height does a value get?* This ADR answers it
for the diagrams. The distributed loads should inherit the rule; that is a
separate step with its own pictures.

## One reference per internal force, over all beams

The alternative is the one the distributed loads use today: normalise **per
figure**. It is right there for the taking, and it is wrong here.

A moment diagram is read across the whole frame. Two spans, one carrying
`40 kNm` and the next `20 kNm`, must draw the second half as high as the first —
otherwise the picture invites a comparison and then breaks it. Per-load
normalisation is precisely the half-rule that `CONTEXT.md` already admits to on
the load side.

The reference is **per internal force**, not one for all three. `N`, `V` and `M`
carry different units and different magnitudes; a shared reference would make
the moment diagram of a frame flatten the normal forces into nothing. Each
component therefore has its own reference, and it does not change when another
component is switched on.

Because `internalForcesStations` contains the **exact** extremum locations —
between two base stations `q` is linear, so `V` is quadratic and `M` cubic, and
the roots are computable — this maximum is the real one. It does not hang on
`subdivisions`, and refining the sampling does not move any diagram.

## Zero produces nothing, and the check is exact

`ref[K] === 0` yields **not a single spec** for that component: no zero line, no
label, nothing. This follows [ADR 0028](0028-a-distributed-load-stands-on-its-shadow.md)
("a beam the reference length measures 0 on gets no figure at all"): *none* is
not a scale, and a line drawn on the beam axis asserts a result that is not
there.

The comparison is against **exactly** `0`, not against a threshold. On a
straight horizontal beam the longitudinal degrees of freedom decouple
completely and `N` is exactly zero — that is the case the rule is for. Wherever
`N` couples at all, it is genuinely non-zero. The residual risk is documented
rather than fought: rounding noise in a nearly-decoupled frame would be
normalised up to full height. A threshold would need a scale to be measured
against, and the only scale available is the noise itself.

## The ordinate is a world measure — an amendment, not a rewrite

`@baustatik/fem-viewer`'s invariant reads:

> **Schematic, not scale drawing**: nodes and beams are symbols without physical
> extent, so their sizes are screen pixels and do not scale with zoom.

The diagram area is the first thing in the package that breaks it, deliberately.
It is laid off in **metres** along `ez` and is therefore **not** divided by
`vp.scale`: zooming in makes the area grow with the structure, exactly as a hand
drawing would. Stroke width, label font, label gap and the dashed fibre's offset
stay screen-constant as everywhere else.

The invariant is **amended**, not replaced: it holds for everything that is a
*symbol*. A diagram is not a symbol — it is a plot, and a plot whose height
changed with the zoom level would be unreadable the moment one compared two
regions of the picture at different magnifications.

The naming carries the statement: `diagramOrdinateM` ends in `M` where every
other style key ends in `Px`. That is the same convention
`@baustatik/cross-section-viewer` runs under the heading "`Px` suffix =
screen-constant".

### Rejected: an ordinate derived from the model

The obvious default is a fraction of the model — say 15 % of the longest beam.
It has the property one wants: it is always roughly right, on a 2 m frame and on
a 40 m one.

It was rejected because **adding a long beam would rescale every existing
diagram**, without a single number having changed. The picture would then be a
function of the model's extent rather than of its results, and a user comparing
two screenshots would be comparing two scales. A picture that is too small is
repaired by the exaggeration slider; a picture that changes when nothing about
the result changed is not repaired by anything.

`diagramOrdinateM` defaults to `0.5` m and `exaggeration` to `1`.

## What follows from the rule

- **The direction is one rule for all three.** A value is laid off multiplied by
  `ez`, exactly as `fem-element/src/internal-forces.ts` pins it ("a positive
  value is laid off on the local +z side"). This covers the standard behaviour:
  `V > 0` on `+z`, compression (`N < 0`) on `−z`, `M > 0` on the tension side.
  `ez` follows from `Line.frame` and therefore **from the node order alone** —
  there is no mirror flag. A pure drawing flag would put `M = +20 kNm` above one
  beam and below the next, and the picture would contradict itself. Whoever
  wants to turn the fibre turns the beam.
- **The dashed fibre makes the side visible.** On a column the `+z` side cannot
  be guessed; the fibre is drawn on it, always, with a screen-constant offset.
  A switch for it is a view-policy question and is filed in `TODO.md` §2.
- **Presence is the switch.** `DiagramOptions` carries one optional number per
  component: present means drawn, and the number is the exaggeration. There is
  no `visible` field beside it that could disagree with it, and `0` is not "off"
  but a broken precondition — it throws.
- **One result pull, not two.** `ViewerConfig.getReactions` is replaced by
  `getResult`, and the reactions are read from `result.reactions`. Two pulls
  meaning the same computation are the second state that `results/index.ts`
  already ruled out once. This makes the edge `fem-viewer → fem-solver` a
  runtime import.

## What this does not decide

- **The distributed loads.** They stay normalised per load. They *should*
  inherit this rule — the open scaling question in `CONTEXT.md` is the same
  question — but the rebuild is its own step with its own pictures.
- **Envelopes and combinations.** The viewer still draws **one** load case;
  which one remains the application's decision
  ([ADR 0014](0014-load-case-selection-is-a-parameter-not-a-port.md)). A reference over an
  envelope is a different question and gets its own answer.
- **A view policy.** `DiagramOptions` stays a pull until there is a place for
  display settings to live (`TODO.md` §2).
