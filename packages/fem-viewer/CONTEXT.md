# `@baustatik/fem-viewer`

## Purpose

Maps a planar FEM frame model — nodes, beams, loads and the **result** — to
render-agnostic `Spec` objects and drives a `RenderDriver` with viewport state.
Beams draw as thin black lines, nodes as small red circles, node supports as
grouped symbols, concentrated forces as blue arrows and moments as blue curved
arrows, both with a labelled magnitude. Distributed forces draw as a filled area
with an arrow at each end. Every force symbol stands off the place it refers to
by the same gap and names that place with a red marker on the beam axis — the
line load at both ends of its segment, the point load on a beam at its point of
application. Support reactions draw as the *same* symbols in green, one band
higher. `N`, `V` and `M` draw as filled diagrams along the beam axis — one hue
per internal force, the sign in the brightness — with their extreme values
labelled, laid off on the side the dashed fibre marks.

## Boundaries

- Owns: model-to-spec mapping for nodes, beams, supports, loads, support
  reactions and the N/V/M diagrams, the x/z → u/v coordinate mapping, paint-band
  assignment, screen-constant symbol sizing, **the one world measure**
  (`diagramOrdinateM`, ADR 0050) and the reference size it is normalised
  against, and viewport state (pan/zoom/reset).
- Does not own: Konva or canvas rendering execution, FEM solving, **the internal
  forces along a beam and where their extrema sit** — that is
  `internalForcesAlong`'s answer, already given for the report — grid line
  calculation (delegated to `@baustatik/grid-2d`), model validation beyond
  resolving beam endpoints, **where a beam load sits and which way it points** —
  that is `@baustatik/fem-load-resolve`'s answer, already given for the solver —
  or **which load case a result belongs to**: the viewer draws one result, and
  which one is the application's decision (ADR 0014).

## Dependencies

- `@baustatik/fem`: `Node` and `Beam` model types.
- `@baustatik/fem-solver`: the `SolveResult` type **and** `internalForcesAlong`
  — since the N/V/M diagrams landed this is a **runtime** import, not only a
  type one. The edge runs viewer → solver and never the other way. The viewer
  calls the reader and derives nothing itself: derived twice, picture and
  calculation drift apart in exactly the pair one looks at the picture for.
- `@baustatik/errors`: base `BaustatikError` class for package error hierarchy.
- `@baustatik/render-core`: `Spec`, `LineSpec`, `CircleSpec`, `ArrowSpec`,
  `ArcPathSpec`, `PolygonSpec`, `RectangleSpec`, `LabelSpec`, `RenderDriver`.
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

`model/`, `loads/` and `results/` are built the same way on purpose — each has an
`index.ts` that only distributes and a `style.ts` holding its slice of the style.
All three are split along **two levels**: which thing produces which symbol, and
what that symbol looks like. A new kind therefore touches the first level only, a
changed symbol the second. For the arrow, the curved arrow and the label the
second level is **shared** and lives in `symbols/`; `model/` keeps its own because
a support symbol has no counterpart anywhere else.

- [`src/scene.ts`](src/scene.ts): `femSpecs` — composition only, model + loads +
  result.
- [`src/style.ts`](src/style.ts): `FEMStyle` and `DEFAULT_STYLE` — the three style
  slices assembled, resolved once and handed to all three.
- [`src/symbols/`](src/symbols): the shared second level — what an arrow, a
  curved arrow and a label look like. Knows neither whose symbol it draws nor
  which band it belongs to; both arrive with the symbol.
  - [`point-force.ts`](src/symbols/point-force.ts) /
    [`moment.ts`](src/symbols/moment.ts): straight arrow, curved arrow.
  - [`distributed-force.ts`](src/symbols/distributed-force.ts): the whole line-load
    figure — baseline, area, both arrows, both labels, both markers, and the
    parallel case. It shares `symbolLabelSpec`, `markerSpec` and the colours with
    its siblings, because the arrow *length* means the opposite thing here.
  - [`marker.ts`](src/symbols/marker.ts): the small square on the beam axis. Its
    own file because two symbols place it, and **neither of them decides who gets
    one**: for the line load it is constitutive and drawn inside the figure, for
    the point force it is the "on a beam" case and therefore the caller's
    (`loads/beam-loads.ts`).
  - [`label.ts`](src/symbols/label.ts): the label rule and the two unit texts.
    The formatters only format — **whether a sign is shown is the caller's
    decision**: `loads/` hands in the magnitude (there the sign is already spent
    turning the arrow), `results/diagram-figure.ts` hands in the signed value.
  - [`style.ts`](src/symbols/style.ts): `SymbolStyle` — the **resolved** look with
    neutral names, plus the three schematic sizes. `MarkerStyle` and
    `DistributedStyle` sit beside it rather than inside it: `SymbolStyle` is
    shared with `results/`, and a reaction is never distributed and never sits on
    a place *within* a beam. `LabelStyle` is split **out** of `SymbolStyle` for
    the mirror-image reason: a diagram label has neither arrow nor arc, and as
    mandatory fields it would have to invent ten numbers nobody reads.
    `SymbolStyle extends LabelStyle`, so every existing caller is unchanged.
- [`src/results/`](src/results): result → specs.
  - [`index.ts`](src/results/index.ts): `resultSpecs` — distribution, and the one
    place that turns "no result" into "no specs".
  - [`reactions.ts`](src/results/reactions.ts): what hangs at a supported node —
    components, reading direction, node lookup.
  - [`internal-forces.ts`](src/results/internal-forces.ts): the first level of
    the diagrams — the reference size across all beams, the sampling resolution
    per beam, the call into `internalForcesAlong`, and `DiagramOptions`.
  - [`diagram-figure.ts`](src/results/diagram-figure.ts): the second level —
    point list to `area` polygons, `outline` and extreme-value labels. It stays
    in `results/` rather than moving to `symbols/` for the same reason
    `model/support-symbols.ts` stays in `model/`: the figure has no counterpart
    anywhere else. An arrow draws both a load and a reaction; a diagram draws a
    diagram.
  - [`style.ts`](src/results/style.ts): the `ResultStyle` slice and its defaults.
- [`src/model/`](src/model): model → specs.
  - [`index.ts`](src/model/index.ts): `modelSpecs` — distribution, and the one
    place that resolves node references.
  - [`beam.ts`](src/model/beam.ts) / [`node.ts`](src/model/node.ts): the elements
    themselves — line and circle.
  - [`fiber.ts`](src/model/fiber.ts): the dashed fibre on the `+ez` side. It
    lives in `model/`, not `results/`: it is a property of the **beam** and is
    drawn without any result.
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
  - [`style.ts`](src/loads/style.ts): the `LoadStyle` slice and its defaults.
- [`src/layers.ts`](src/layers.ts): `FEM_LAYERS` paint bands and `FEMLayer` type.
- [`src/viewer.ts`](src/viewer.ts): `createFEMViewer` — viewport state and driver wiring.
- [`src/errors.ts`](src/errors.ts): `UnknownNodeReferenceError`,
  `InvalidDiagramExaggerationError`, `UnsupportedSupportError`. Stays at the top
  level: it is the **package's** error hierarchy, and `index.ts` exports them
  directly.
- [`docs/usage.md`](docs/usage.md): canonical API usage documentation.

Tests mirror this layout — `tests/model/`, `tests/loads/`, `tests/results/`, plus
`tests/scene.test.ts` for what only exists once the parts meet (band coverage, ID
uniqueness across a load *and* a reaction at the same node, one style object
reaching all three, and that an absent result adds exactly nothing). Fixtures
live in `tests/helpers.ts` and `tests/loads/helpers.ts`; the load side keeps its
own because it needs a **skewed** beam, otherwise no test proves that the rotation
into the beam frame happens at all. `tests/results/` builds its own inline — it
needs a support and a result, not a skewed beam. The two `ElementEvaluationState`
builders (`beamState`, `simplySupported`) do live in `tests/helpers.ts`, because
`scene.test.ts` needs a result too; they name the state type **derived from**
`SolveResult` rather than importing `@baustatik/fem-element`, which is
deliberately not a dependency here.

The one assertion worth finding again is the **arithmetic counter-check** in
`tests/results/internal-forces.test.ts`: the simply supported beam under a
uniform load has `M_max = qL²/8` at `x = L/2`, and the test pins that the
**label text** carries exactly that number *and* that the matching polygon point
sits exactly `diagramOrdinateM` off the axis (because this beam sets the
reference). That binds scaling, extremum search and labelling into one
assertion. Its sibling is the **world-versus-screen** contrast: the diagram
points are *identical* in world coordinates at `vp1` and `vp2` while a load
arrow beside them halves.

**Types live with the thing they belong to, and there is no `types.ts`.** The
types here are option objects and style slices, not a vocabulary of their own —
that comes from `@baustatik/fem` and `@baustatik/fem-solver`. A type earns its own
file when someone needs it without the implementation; the style slices qualify
because they also break the import cycle between the mappings and `scene.ts`.

## Invariants and conventions

- **Schematic, not scale drawing**: nodes and beams are symbols without physical
  extent, so their sizes are screen pixels and do **not** scale with zoom. This is
  the deliberate opposite of
  [`@baustatik/cross-section-viewer`](../cross-section-viewer), where plate
  `thickness` is a genuine world quantity and correctly scales. Revisit if beams
  ever gain a 3D rendering.
  **Amended by ADR 0050, not replaced**: it holds for everything that is a
  *symbol*. The **diagram ordinate is the one world measure** in this package —
  `diagramOrdinateM` is in metres, is not divided by `vp.scale`, and the area
  therefore zooms with the structure. A plot whose height changed with the zoom
  level would be unreadable the moment one compared two regions of the picture
  at different magnifications. The `…M` suffix carries the statement, the same
  way `…Px` carries "screen-constant" everywhere else; stroke, label and the
  fibre's offset stay screen-constant.
- **Two different unit conversions**: `strokeWidth` is passed through unchanged
  because adapters set `strokeScaleEnabled: false`, making the value already
  screen-pixels. Local symbol dimensions are divided by `vp.scale` because they
  scale with the stage. Node radii as well as support geometry and translations
  are therefore zoom-dependent local values that remain screen-constant.
- **Paint bands guarantee z-order, array order does not**: renderers append newly
  built shapes, so a beam added after the nodes exist would otherwise draw over
  them. `FEM_LAYERS`
  (`['grid','supports','beams','nodes','hinges','diagrams','loads','reactions']`,
  last = topmost) is passed to the driver at construction. Loads sit near the top
  because they are the statement of the input, and an arrow hidden by a beam is
  not one. Reactions sit above them: they are only in the picture at all once
  something has been solved, and then they are what one is looking at — a support
  arrow underneath the load arrow of the same node would be the one that is
  missing. Hinges sit above `nodes`: the hinge is a white disc that has to read
  as a **hole** in the beam, and underneath the node circle it would stop being
  one. The diagrams get **one** band, not three: the z-order among `N`, `V` and
  `M` is settled by array order inside the band (`N`, `V`, `M`, so `M` ends up on
  top). It sits **below** `loads` and `reactions` because a diagram runs over
  *every* beam and is therefore the one thing that crosses everything — above
  them its area would tint every arrow and its opaque label boxes would hide
  every load label. It sits above `beams` and `nodes` so it is not hidden itself.
  The tuple is simultaneously the name list, the type source and the
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
  of the symbol — `:arrow`/`:label`(`:marker`) for a force, `:arc`/`:head`/`:label`
  for a moment, and `:area`/`:q1:*`/`:q2:*`/`:start`/`:end` for a line load. One
  load on several targets therefore stays distinguishable, which the
  fan-out needs. A support reaction gets its own namespace,
  `reaction:{nodeId}:{fx|fz|my}` plus the same symbol part: a node can carry a
  load *and* a reaction with the same component, and without the two prefixes
  that would be the same ID twice. A diagram gets a third namespace,
  `diagram:{beamId}:{N|V|M}` plus its part — `:area:{i}` per sign run,
  `:outline` once per beam, `:max:{0|1}:label` and `:min:{0|1}:label` for the
  extreme values. The dashed fibre belongs to the beam and is named accordingly:
  `beam:{beamId}:fiber`.
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
  catching one group class for "some load is broken". A **reaction** at a node the
  model does not have is a model error again and takes the same
  `UnknownNodeReferenceError`: a result naming a foreign node does not belong to
  this model. Its element id and node id coincide, because a reaction has no
  identity of its own — it *is* the node. A result naming a foreign **beam** is
  the same statement and keeps the solver's own `UnknownBeamError`, untranslated:
  two names for one finding would be one too many. This package deliberately adds
  no third error type **for dangling references**. Unlike the transient
  `maxLines` condition in `grid-2d`, all of them are data errors that do not
  resolve by panning, and a silently skipped element disappears without trace.
  `InvalidDiagramExaggerationError` is not one of them — it is a broken
  precondition on a caller's *option*, not a statement about the data.
- **The load arrow is a schema, its length says nothing**: every concentrated force
  gets the same 48 px arrow, laid off against its direction; the magnitude lives
  in the label. A negative value flips the direction, the label keeps the unsigned
  input. The distributed load is the deliberate opposite and that is why it is a
  symbol of its own: there the arrow length is the ordinate and says everything.
- **Every force symbol stands off the place it refers to, by one and the same
  gap**: the arrow tip sits `forceGapPx` *before* the point of application, the
  line load's baseline the same distance from the beam. It is one number
  (`DEFAULT_FORCE_GAP_PX`, 10 px) because it is one question — how much air the
  figure leaves over the thing it is about — and a second one would exist only so
  that it could disagree with the first. The consequence is that the picture no
  longer says where a force acts by *touching* that place; on a beam the marker
  says it, at a node the node itself does.
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
- **A distributed load stands on its shadow** (ADR 0028): the baseline of the
  figure is the loaded segment's shadow, cast by parallel light travelling in the
  load direction; for `trueLength` it is the beam axis itself. All nine
  combinations of `frame`, `axis` and `referenceLength` follow from that one rule
  without a case distinction, because a shadow is by definition perpendicular to
  the light — so the area, laid off *against* the load direction, can never
  collapse into a line. Two consequences are deliberate and both are visible:
  `horizontalProjection` and `verticalProjection` draw **identically** for a given
  direction (they differ in `referenceFactor`, which the picture does not show),
  and the gap sits at the **least** clearance, measured along the load direction —
  the end nearest the figure keeps exactly `forceGapPx`, the other gets more.
- **A beam the reference length measures 0 on gets no figure at all** (ADR 0028):
  `verticalProjection` on a horizontal beam, `horizontalProjection` on a vertical
  one. The picture does not scale with `referenceFactor`, but *none* is not a
  scale — the load puts nothing on that beam, and with the ordinate normalised per
  load the figure would otherwise stand there at full height. Decided **per beam**,
  at the exact 0: a nearly horizontal beam keeps its figure.
- **The line-load figure has no height of its own**: the arrow tips sit on the
  baseline and the outer edge of the polygon *is* the line joining the arrow tails.
  Its length is therefore `forceArrowLengthPx`, and the only new number is the gap.
  A second constant would exist only so that it could disagree with the first.
- **The ordinate is normalised per load, not across the picture**: `max(|q1|,
  |q2|)` maps to the full arrow length. The height shows the course *within* one
  load — a triangular load has to look like a triangle — but two loads are not
  comparable by it. See *Known constraints*.
- **The load direction parallel to the beam axis is the one case left over**: the
  shadow is a point, and `local x` hits it always. There the height is laid off
  perpendicular to the beam on the local −z side, and the two arrows lie
  *lengthwise inside* the block; without them a load and its opposite would be the
  same picture. The switch is a visibility threshold, not an angle: it trips when
  the built height would be thinner than the stroke drawing it.
- **Unsupported load kinds are skipped, not rejected**: line *moments* produce no
  specs, and so does a force component that is absent or zero — including one end
  of a triangular load, which therefore gets neither arrow nor label there.
  Objecting to them would stop an otherwise drawable model from drawing at all,
  and a zero-length arrow is a point, not a picture.
- **The marker says where on the beam a load acts**: a small red axis-aligned
  square on the beam axis — at both ends of a line load's segment, and at the
  point of application of a **point load on a beam**. It is not decoration but the
  counterweight to the fact that the figure does not touch the beam: under a
  projection the line load no longer stands above it at all, and since the gap the
  arrow tip does not land on it either. Not rotated into the beam: it marks a
  *place*, not a direction. **Only on a beam** — a node load and a reaction hang
  on a node, which is drawn already, and there the marker would sit under the
  bigger red node circle saying nothing new. Which is why the point force does not
  place its own marker: whether there is one is a question of *what carries the
  load*, and that is `loads/beam-loads.ts`' knowledge, not the symbol's.
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
- **A reaction is the force the support exerts on the STRUCTURE**, exactly as
  `SupportReaction` defines it: a prop under a downward load reports a negative
  `fz`, and the arrow points up. It is drawn by the same rule as a load — **tip
  one gap short of the node**, the same gap — and precisely that makes `Σ loads +
  Σ reactions = 0` legible in the picture, because every arrow at a node means the
  same thing. A load and its reaction therefore stand mirror-imaged about the
  node, equally far off; a different gap on the result side would look as though
  the two attacked at different places. The other reading
  ("what the structure pushes onto the support") would be a second sign convention
  inside one drawing. `my` follows the load moment: positive turns
  counter-clockwise.
- **Colour is what separates a reaction from a load**, and it has to be: the two
  sit at the same node, use the same symbol, and point opposite ways. Green
  (`#15803d`) against the load's blue (`#1d4ed8`), plus a slightly heavier stroke
  (3 px against 2). **Length and head stay identical** — a different arrow length
  would suggest a magnitude comparison that does not exist, while stroke width
  says nothing about a magnitude and only lifts the result off the input where
  the two arrows overlap. A test pins the two default colours apart.
- **What is held is stated by the result, not by the support**: a released
  direction carries exactly `0`, and `pointForce`/`moment` already drop zero. A
  two-value bearing therefore produces two symbols and no third one, without
  `results/` ever branching on `NodeSupport`. One less place where the picture and
  the calculation could disagree about what is fixed.
- **No result is the off state, and there is no switch beside it**:
  `result === undefined` yields an empty list. A separate "show results" flag
  would be a second state that can desynchronise from the first — there is either
  a computed result or none. The caller discards its result on every model change;
  that serves the display, not correctness, since a `SolveResult` carries
  everything it needs to be evaluated (ADR 0019) and cannot go stale. But a
  support arrow at a node one has just moved asserts something.
- **One result pull, not two**: `getResult` returns the whole `SolveResult`, and
  the reactions are read out of `result.reactions`. Two pulls meaning the same
  computation are exactly the second state the previous invariant rules out; the
  diagrams and the reaction arrows have to be able to disagree about *nothing*.
  This is what makes the edge to `fem-solver` a runtime import.
- **`DiagramOptions` is a switch about the VIEW, not about the state**
  (ADR 0050): `diagrams` does not say whether something was computed — it says
  which of the three internal forces one wants to see. **Presence is the
  switch**, and the value is the exaggeration; there is no `visible` field beside
  it that could disagree with it. `exaggeration <= 0` (and `NaN`) **throws**
  `InvalidDiagramExaggerationError`: "do not draw" is said by omitting the field,
  not by a height of zero, and a negative factor would mirror the side the whole
  picture hangs on. A pull rather than a constructor option, because the only
  state in the viewer is the viewport — the same shape as
  `cross-section-viewer`'s `getProperties`/`getStressPoints`/`getFEMesh`.
- **The reference size is global per internal force, and zero draws nothing**
  (ADR 0050): `ref[K] = max |K(x)|` over **all** beams and **all** stations, one
  per component. Only that makes two field moments in one picture comparable.
  Because `internalForcesStations` contains the exactly computed extremum
  locations, this maximum is the real one and does not hang on `subdivisions`.
  `ref[K] === 0` produces **not a single spec** — no zero line, no label —
  following the same rule as ADR 0028. The check is against **exactly** `0`: on a
  straight horizontal beam the longitudinal degrees of freedom decouple
  completely and `N` is exactly zero, and where `N` couples it is genuine.
- **One direction rule for all three, and it comes from the node order**: a value
  is laid off multiplied by `ez`, exactly as `fem-element/src/internal-forces.ts`
  pins it. `ez = (−ex.dz, ex.dx)` follows from `Line.frame` and therefore from
  `startNodeId → endNodeId` alone. There is **no** mirror flag: a pure drawing
  flag would put `M = +20 kNm` above one beam and below the next, and the picture
  would contradict itself. Whoever wants to turn the fibre turns the beam. The
  **dashed fibre** makes the side visible where it cannot be guessed (a column),
  is drawn **always** — with or without a result — and its offset is
  screen-constant. A switch for it is a view-policy question (`TODO.md` §2).
- **`PolygonSpec`, no new primitive**: a diagram of its own shape would need a
  new spec kind in `render-core`, and that package is deliberately domain-free
  ("DER SPEC KENNT KEINE DREIECKE"). The figure splits into `area` **per sign
  run** — because `PolygonSpec` carries exactly one `fillColor` — and `outline`
  **once per beam**. The splitting point is the linear interpolation between two
  neighbouring samples; for the polyline that is actually drawn that is not an
  approximation but **exact**, because its zero crossing *is* that point. The
  outline stays one continuous run even across a sign change: the curve is
  continuous there, and a colour change in the middle of it would assert a break
  that is not there. At a jump two samples share an `x`, and the vertical flank
  falls out of the polyline for free. It **starts and ends on the beam axis**,
  not on the curve: otherwise the closing edge is missing wherever the diagram
  has a value at a beam end — a constant normal force would stand there as an
  open horizontal line instead of a rectangle, and a fixed end would lose the
  stroke from the beam up to its support moment. Where the end value is `0` the
  axis point coincides with the curve point and is deduplicated away. It stays
  **open**: closing it back over the axis would draw the zero line a second time,
  and the beam is already there. Transparency lives **in the colour** (8-digit
  hex) — `PolygonSpec` has no `opacity`, and one would have washed out the
  outline that is meant to stay opaque. The **deep** fill carries more opacity
  than the light one (55 % against 25 %): at equal opacity the hue alone stops
  separating the two signs, and a moment diagram with a support moment reads as
  one area.
- **Hue is the internal force, brightness is the sign**: `M` violet, `V` orange,
  `N` cyan, against the load's blue and the reaction's green. All three may be
  visible at once, so belonging to a component has to be the *primary*
  distinction and the sign the secondary one. Labels use the **deep** colour for
  text and border on a very pale ground, **for both signs alike** — light text on
  a light ground would be low-contrast, and the sign is already in the number and
  in the side the label sits on.
- **The label carries the sign, and that is the deliberate exception**: the
  extreme values are written as `` `${roundSmart(v)} ${unit}` `` with their sign.
  At a load arrow the sign is already spent — it turns the arrow — but in an
  internal force it is part of the number, and at a column the side is not
  self-explanatory. A **plateau** (a value reached at several stations) is
  labelled at its **first and last** station and needs no tolerance: a constant
  normal force is `N = −e[0]` bit-identical at every station, so the rule bites
  exactly where it should (`x = 0` and `x = L`) and never on a parabola. **No
  marker**: the load symbols set one because their figure does not touch the beam
  (`forceGapPx`); the diagram area touches it — its closing edge *is* the axis.
- **The resolution is two numbers answering two questions**:
  `n = max(diagramSubdivisions, ceil(L / diagramMaxStepM))`. The chord error of
  the global arc is `A/n²` and therefore independent of the beam length (the
  height is normalised against `ref`) — that is what `diagramSubdivisions` is
  for. The absolute grid of `diagramMaxStepM` secures the **short load segment on
  a long beam**, into which a grid of `L/20` would place no point at all. More
  points cost no specs: the polygon carries them in one array.

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
  local fix. A supported node carrying a load **and** its reaction is the same
  problem one step worse: the two arrows run through each other and the labels
  stack. The colours keep it readable, but not composed.
- **Two line loads are not comparable by height.** The ordinate is normalised per
  load, so a trapezoid `q1=10 → q2=40` beside a constant `q=10` shows the same
  value once 12 px and once 48 px high. Deliberate for now, but it is genuinely
  half a rule: as long as the height means *something* locally — and it must, or a
  triangular load could not look like one — the picture invites a comparison it
  then breaks. The resolution is the open **scaling question**: one reference size
  over all visible loads, computed in a pass over them before any is drawn.
- **Line moments are still not drawn.** `BeamMomentConstantLoad` and
  `BeamMomentTrapezoidalLoad` produce no specs. They need a symbol of their own —
  a row of small curved arrows, presumably — for which there is neither precedent
  in this package nor a reference drawing.
- **A marker at the very start of a beam hides under the node.** Both are red and
  the node circle is bigger. Accepted: that is precisely the case where the marker
  says nothing the picture did not already say.
- **A node carrying `fz` and `my` at once draws them through each other**: with the
  gap at the bottom, the arc is closed at the top, exactly where the shaft of a
  downward force arrow runs — and both labels stack above the node. Legible, but
  not composed. Same open placement question as above, and the reason the gap
  could be worth making direction-dependent later.
- **The zero check on the reference size can be fooled by noise.** `ref[K] === 0`
  is an exact comparison (ADR 0050), and it is right for the case it is built
  for: on a straight horizontal beam `N` is exactly zero. In a nearly decoupled
  frame, rounding noise of order `1e-14` would instead become the reference and
  be normalised up to full ordinate height — a diagram made entirely of noise.
  Documented rather than fought: a threshold needs a scale to be measured
  against, and the only scale available here is the noise itself.
- **Distributed loads do not yet share the diagram's reference size.** They stay
  normalised per load; ADR 0050 records that they should inherit the rule, but
  the rebuild is its own step. Until then the picture holds two scaling rules at
  once.
- The deformed shape is not drawn. It needs the shape functions from
  `@baustatik/fem-element`, not just the result type.
- **One result at a time.** `getResult` returns one `SolveResult`; which load
  case it belongs to is the application's decision (ADR 0014), and the viewer has
  no notion of a load case — deliberately the same limitation as on the load
  side. Envelopes over several cases would need a reference size over the
  envelope and are a separate question.
- **Diagram labels join the unplaced-label problem.** An extreme value close to a
  support can stack with the reaction label there; the same open placement rule
  over *all* labels applies.
