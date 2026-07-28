# `@baustatik/fem-viewer`

## Purpose

Maps a planar FEM frame model — nodes, beams and loads — to render-agnostic `Spec`
objects and drives a `RenderDriver` with viewport state. Beams draw as thin black
lines, nodes as small red circles, node supports as grouped symbols, concentrated
forces as blue arrows and moments as blue curved arrows, both with a labelled
magnitude.

## Boundaries

- Owns: model-to-spec mapping for nodes, beams, supports and loads, the x/z → u/v
  coordinate mapping, paint-band assignment, screen-constant symbol sizing, and
  viewport state (pan/zoom/reset).
- Does not own: Konva or canvas rendering execution, FEM solving, grid line
  calculation (delegated to `@baustatik/grid-2d`), model validation beyond
  resolving beam endpoints, or **where a beam load sits and which way it points** —
  that is `@baustatik/fem-load-resolve`'s answer, already given for the solver.

## Dependencies

- `@baustatik/fem`: `Node` and `Beam` model types.
- `@baustatik/errors`: base `BaustatikError` class for package error hierarchy.
- `@baustatik/render-core`: `Spec`, `LineSpec`, `CircleSpec`, `ArrowSpec`,
  `ArcPathSpec`, `PolygonSpec`, `LabelSpec`, `RenderDriver`.
- `@baustatik/grid-2d`: `gridSpecs`, `GridOptions` for the background grid.
- `@baustatik/viewport-2d`: `Viewport`, `Size`, `worldPoint`, `pan`, `zoomAround`.
- `@baustatik/fem-loads`: the load types, `modelGeometry` (beam axis with the
  binding start-node-first order) and `UnknownLoadTargetError`.
- `@baustatik/fem-load-resolve`: `loadStation` and `loadDirection` — the same
  position and direction the solver uses.
- `@baustatik/fem-geometry`: `Line`, `Point`, `Vector` for the plain arithmetic
  `p1 + ex * a`. No angle convention of its own.
- `@baustatik/round`: `roundSmart` for the label text.

## Navigation

`model/` and `loads/` are built the same way on purpose — each has an `index.ts`
that only distributes, a `style.ts` holding its slice of the style, and one file
per symbol. Both are split along **two levels**: which thing produces which
symbol, and what that symbol looks like. A new kind therefore touches the first
level only, a changed symbol the second.

- [`src/scene.ts`](src/scene.ts): `femSpecs` — composition only, model + loads.
- [`src/style.ts`](src/style.ts): `FEMStyle` and `DEFAULT_STYLE` — the two style
  slices assembled, resolved once and handed to both halves.
- [`src/model/`](src/model): model → specs.
  - [`index.ts`](src/model/index.ts): `modelSpecs` — distribution, and the one
    place that resolves node references.
  - [`beam.ts`](src/model/beam.ts) / [`node.ts`](src/model/node.ts): the elements
    themselves — line and circle.
  - [`hinge.ts`](src/model/hinge.ts): the hinge symbol and where it sits, plus
    `hasRelease` — the question "is there a hinge here?" belongs to the hinge.
  - [`support.ts`](src/model/support.ts): **which** symbol a support case gets and
    how it hangs off the node.
  - [`support-symbols.ts`](src/model/support-symbols.ts): **what** those symbols
    look like, in local coordinates.
  - [`style.ts`](src/model/style.ts): the `ModelStyle` slice and its defaults.
- [`src/loads/`](src/loads): loads → specs.
  - [`index.ts`](src/loads/index.ts): `loadSpecs` — distribution over the load kinds.
  - [`node-loads.ts`](src/loads/node-loads.ts) /
    [`beam-loads.ts`](src/loads/beam-loads.ts): what hangs where — targets,
    components, position on the beam axis.
  - [`point-force.ts`](src/loads/point-force.ts) /
    [`moment.ts`](src/loads/moment.ts): the symbols — straight arrow, curved arrow.
  - [`label.ts`](src/loads/label.ts) / [`style.ts`](src/loads/style.ts): what both
    share — the label rule, the `LoadStyle` slice and its defaults.
- [`src/layers.ts`](src/layers.ts): `FEM_LAYERS` paint bands and `FEMLayer` type.
- [`src/viewer.ts`](src/viewer.ts): `createFEMViewer` — viewport state and driver wiring.
- [`src/errors.ts`](src/errors.ts): `UnknownNodeReferenceError`,
  `UnsupportedSupportError`. Stays at the top level: it is the **package's**
  error hierarchy, and `index.ts` exports both directly.
- [`docs/usage.md`](docs/usage.md): canonical API usage documentation.

Tests mirror this layout — `tests/model/`, `tests/loads/`, plus
`tests/scene.test.ts` for what only exists once both halves meet (band coverage,
ID uniqueness, one style object reaching both). Fixtures live in
`tests/helpers.ts` and `tests/loads/helpers.ts`; the load side keeps its own
because it needs a **skewed** beam, otherwise no test proves that the rotation
into the beam frame happens at all.

**Types live with the thing they belong to, and there is no `types.ts`.** The
types here are option objects and style slices, not a vocabulary of their own —
that comes from `@baustatik/fem`. A type earns its own file when someone needs it
without the implementation; the style slices qualify because they also break the
import cycle between the mappings and `scene.ts`.

## Invariants and conventions

- **Schematic, not scale drawing**: nodes and beams are symbols without physical
  extent, so their sizes are screen pixels and do **not** scale with zoom. This is
  the deliberate opposite of
  [`@baustatik/cross-section-viewer`](../cross-section-viewer), where plate
  `thickness` is a genuine world quantity and correctly scales. Revisit if beams
  ever gain a 3D rendering.
- **Two different unit conversions**: `strokeWidth` is passed through unchanged
  because adapters set `strokeScaleEnabled: false`, making the value already
  screen-pixels. Local symbol dimensions are divided by `vp.scale` because they
  scale with the stage. Node radii as well as support geometry and translations
  are therefore zoom-dependent local values that remain screen-constant.
- **Paint bands guarantee z-order, array order does not**: renderers append newly
  built shapes, so a beam added after the nodes exist would otherwise draw over
  them. `FEM_LAYERS` (`['grid','supports','beams','nodes','hinges','loads']`,
  last = topmost) is passed to the driver at construction. Loads sit topmost
  because they are the statement of the picture, and an arrow hidden by a beam is
  not one. Hinges sit above `nodes`: the hinge is a white disc that has to read
  as a **hole** in the beam, and underneath the node circle it would stop being
  one. The tuple is simultaneously the name list, the type source and the
  z-order — one declaration, one truth. Bands coarsen array order rather than
  competing with it: band order wins between bands, array order still applies
  within a band.
- **z points downwards, mapped directly onto v**: `@baustatik/fem` positions follow
  the structural convention (z downwards, loads act in +z) and screen `v` also
  grows downwards, so `worldPoint(x, z)` needs no sign flip. Every `worldPoint`
  call in the package follows this rule — there is no site that mirrors.
- **Namespaced spec IDs**: `node:{id}` and `beam:{id}`, matching the `grid:`
  prefix. `validateSpecs` requires global uniqueness across all bands, and a node
  and a beam may otherwise carry the same raw ID. A hinge names **both** the beam
  and the node it sits at — `beam:{beamId}:hinge:{nodeId}` — because several beams
  can meet hinged at one node, and the picture has to say *which* of them is
  hinged. Loads add the target and, for
  node loads, the component: `load:{loadId}:{targetId}[:fx|:fz|:my]` plus the part
  of the symbol — `:arrow`/`:label` for a force, `:arc`/`:head`/`:label` for a
  moment. One load on several targets therefore stays distinguishable, which the
  fan-out needs.
- **The hinge sits next to the node, not on it, and every release is the same
  symbol**: it is offset two node radii along the beam axis, into its own beam.
  Drawn *at* the node it would hide under the node circle, and at a node where
  several beams meet hinged, all of them would coincide — the drawing would stop
  saying which beam is hinged. `u`, `w` and `theta` all produce the same disc:
  the viewer states **that** the beam connects hinged, not which component is
  released. Telling them apart needs three symbols and an answer for combinations.
- **Supports are grouped, screen-constant symbols**: every `NodeSupport` maps to
  one `GroupSpec` anchored at its node. Its symbol-specific translation and all
  child geometry are divided by the viewport scale together, so their visual
  distance and proportions remain constant while zooming. The Konva adapter maps
  the positive translation to Konva's inverse `offsetX`/`offsetY` convention.
- **Dangling references throw, and which error says whose fault it is**: a beam
  pointing at a missing node is a **model** error and raises
  `UnknownNodeReferenceError`. A load pointing at a missing node **or beam** is a
  **load** error and raises `fem-loads`' existing `UnknownLoadTargetError` — the
  same split `fem-loads/src/model-geometry.ts` already documents, so a caller keeps
  catching one group class for "some load is broken". This package deliberately
  adds no third error type. Unlike the transient `maxLines` condition in `grid-2d`,
  both are data errors that do not resolve by panning, and a silently skipped
  element disappears without trace.
- **The load arrow is a schema, its length says nothing**: every concentrated force
  gets the same 48 px arrow with the **tip on the point of application**; the
  magnitude lives in the label. A negative value flips the direction, the label
  keeps the unsigned input. Distributed loads will not be able to afford this —
  their height has to scale, or 5 kN/m and 50 kN/m look alike.
- **The moment symbol turns the way the sign says**: a positive moment turns
  **counter-clockwise** in the picture, because global y points out of the plane
  (`fem-loads/src/types.ts`, section DREHSINN). On screen the angle grows
  clockwise, so a positive moment carries a **negative** `sweepAngle` — the one
  sign flip in `moment.ts`.
- **What is held fixed is the gap, not the head**: the 90° gap sits at the
  **bottom** for both signs, so the two symbols read as mirror images of each
  other and neither is the odd one out. Hold the _head_ fixed instead and the gap
  travels with the direction of rotation — bottom for one sign, sideways for the
  other. The head therefore sits at the _end_ of the arc, on the edge of the gap
  it points into: bottom left for a positive moment, bottom right for a negative
  one. The start angles follow (+45° / +135°) rather than being given.
- **Arc and head are cut once, not twice**: the arc is shortened by exactly the
  angle the head occupies and the head's base is placed where the shortened arc
  _ends_. Otherwise the arc's blunt line cap sticks out where the triangle should
  be pointed, or a gap opens — and arc plus head together would cover more than
  the nominal 270°. The angle is `atan(pointerLength / radius)`, exact because the
  head stands tangentially: base, centre and tip form a right triangle. The
  obvious arc-length approximation `pointerLength / radius` overshoots it.
- **The moment head is filled _and_ stroked**: Konva draws the force arrow's head
  that way, and the stroke sits centred on the outline, adding half a stroke width
  outwards — at the sharp corner, through the miter, `strokeWidth / 2 / sin(half
tip angle)`, nearly 3 px at these sizes. A fill-only triangle with the same
  `pointerLength`/`pointerWidth` therefore comes out visibly smaller than the
  arrow's head. With the same stroke, both numbers in `LoadStyle` mean the same
  thing in both symbols instead of factors reproducing the difference.
  `pointerWidth` is the **full** base width, as in Konva.
- **Unsupported load kinds are skipped, not rejected**: distributed loads produce
  no specs, and so does a force component or moment that is absent or zero.
  Objecting to them would stop an otherwise drawable model from drawing at all,
  and a zero-length arrow is a point, not a picture.
- **The label hangs on the symbol, not on the point of application**: a force
  labels its outer arrow end, a moment the topmost point of its arc circle — both
  at the same `loadLabelGapPx` beyond it. The moment's radius is therefore
  simultaneously its distance to the node and the label's anchor distance. Above,
  because below is where the gap is and where the head points; a box there would
  sit in the one place the figure keeps clear.
- **Label text format is pinned**: `` `${roundSmart(magnitude)} kN` `` (`kNm` for
  a moment) over the
  already unsigned magnitude, with the `@baustatik/round` defaults and a plain `String` conversion, no locale. The
  integer falls through unchanged (`10 kN`) and the digit count stays small
  (`0.85 kN`). Without the rule the text would hang on the floating-point
  representation of the input.
- **Position and direction of a beam load come from `fem-load-resolve`**, not from
  a second derivation here. Derived twice, picture and calculation drift apart in
  exactly the pair one looks at the picture for.

## Validation

```text
pnpm --filter @baustatik/fem-viewer test
pnpm --filter @baustatik/fem-viewer typecheck
pnpm --filter @baustatik/fem-viewer build
```

## Known constraints

- The `fit` view intent is not implemented; `createFEMViewer` accepts it and does
  nothing. A bounding box over all nodes would be the natural basis.
- `femSpecs` rebuilds its `Map<string, Node>` on every draw. Fine at current model
  sizes, worth revisiting if draw frequency becomes a problem.
- **Coincident loads are neither summed nor fanned out.** A node carrying both `fx`
  and `fz` produces two arrows at right angles whose labels can overlap. Known and
  accepted for now; a resolution needs a placement rule over _all_ labels, not a
  local fix.
- **Only concentrated loads are drawn**: all distributed loads (line forces and
  line moments) produce no specs yet. They need an answer to the scaling question
  first — one reference size over all visible loads, otherwise 5 kN/m and 50 kN/m
  are indistinguishable.
- **A node carrying `fz` and `my` at once draws them through each other**: with the
  gap at the bottom, the arc is closed at the top, exactly where the shaft of a
  downward force arrow runs — and both labels stack above the node. Legible, but
  not composed. Same open placement question as above, and the reason the gap
  could be worth making direction-dependent later.
- Result diagrams are not rendered yet; they would become an additional band in
  `FEM_LAYERS`.
