# Results are drawn in the model viewer

Support reactions — and later the `N`/`V`/`M` diagrams and the deformed shape —
are mapped to specs by `@baustatik/fem-viewer`, in a new `src/results/`
directory. There is no separate result-viewer package.

The calculation has been complete for a while: `solve()` returns `reactions` per
supported node and `beamStates`, from which the free functions
`internalForcesAt`/`internalForcesAlong` answer the diagrams (ADR 0019). None of
it was visible; the demo printed numbers to the console.

## Why not a package of its own

Because the result is an **overlay in the same picture**, not a second picture.
It lives in the same viewport, uses the same x/z → u/v mapping, and takes part in
the same z-order. A second package would have to share `worldPoint`, the band
list `FEM_LAYERS`, the style object and the viewport instance with the first.
That is not a boundary — it is a seam through the middle of one responsibility.

`FEM_LAYERS` is deliberately built as *one declaration, one truth*: it is
simultaneously the name list, the type source and the z-order. Two packages that
both contribute bands turn it into two truths that have to agree, and the
disagreement only shows as a shape drawn in the wrong order.

The symbols settle it. A support reaction is an arrow, a curved arrow and a label
at a node — exactly what the load side already draws. A separate package would
have meant copying them, and two copies of the arrow drift.

The one case that *would* be a package of its own is a separate view: a single
beam unrolled along its axis with its diagram beside it. That has its own
viewport, its own band list and no relation to the model picture.

## Why the viewer may depend on the solver

The edge runs viewer → solver and never the other way; the solver knows nothing
about drawing. Transitively only `fem-element` is new — `fem`, `fem-geometry`,
`fem-load-resolve`, `fem-loads` and `errors` were already there.

It is also the precedent the package already lives by: it takes `loadStation` and
`loadDirection` from `fem-load-resolve` rather than deriving position and
direction a second time, because derived twice, picture and calculation drift
apart in exactly the pair one looks at the picture for. The same argument covers
`internalForcesAlong` when the diagrams land. For the reactions it is a pure type
import today.

## Why a reaction points at the structure

`SupportReaction` is defined as the force the support exerts **on the structure**,
so a prop under a downward load reports a negative `fz`. The viewer draws it by
the same rule as a load — tip on the node — and does not flip it.

Reversing it to "what the structure pushes onto the support" would put two sign
conventions into one drawing. Kept as it is, every arrow at a node means the same
thing, and `Σ loads + Σ reactions = 0` can be read off the picture. That is what
one looks at the picture for.

Colour is then the only thing separating the two, and it has to carry that alone:
green for the reaction against blue for the load. Length, head and label stay
identical, because a different arrow length would suggest a magnitude comparison
that does not exist — the arrow is a schema in both cases.

## Consequences

- `fem-viewer` gains `@baustatik/fem-solver` as a dependency and a `'reactions'`
  band at the top of `FEM_LAYERS`.
- The second level of the symbol split — arrow, curved arrow, label — moves from
  `loads/` to `symbols/` and takes its band as a parameter. `loads/` and
  `results/` keep their own public style slices with disjoint keys, because
  `FEMStyle` is flat.
- `reactions === undefined` is the off state; there is no separate switch. The
  caller discards its result on model change, which serves the display, not
  correctness — a `SolveResult` carries everything it needs (ADR 0019).
- `N`/`V`/`M` are still open, and not for want of data: they need one reference
  size across all beams, the same question the distributed loads hang on.
