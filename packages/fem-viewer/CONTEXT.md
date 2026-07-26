# `@baustatik/fem-viewer`

## Purpose

Maps a planar FEM frame model — nodes, beams and loads — to render-agnostic `Spec`
objects and drives a `RenderDriver` with viewport state. Beams draw as thin black
lines, nodes as small red circles, node supports as grouped symbols, and
concentrated forces as blue arrows with a labelled magnitude.

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
  `LabelSpec`, `RenderDriver`.
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

- [`src/scene.ts`](src/scene.ts): `femSpecs` — the pure model → spec mapping.
- [`src/loads.ts`](src/loads.ts): `loadSpecs` — concentrated forces to arrow and
  label specs, plus the `LoadStyle` slice and its defaults.
- [`src/layers.ts`](src/layers.ts): `FEM_LAYERS` paint bands and `FEMLayer` type.
- [`src/viewer.ts`](src/viewer.ts): `createFEMViewer` — viewport state and driver wiring.
- [`src/errors.ts`](src/errors.ts): `UnknownNodeReferenceError`.
- [`docs/usage.md`](docs/usage.md): canonical API usage documentation.

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
  them. `FEM_LAYERS` (`['grid','supports','beams','nodes','loads']`, last =
  topmost) is passed to the driver at construction. Loads sit topmost because they
  are the statement of the picture, and an arrow hidden by a beam is not one. The
  tuple is simultaneously the name list, the type source and the z-order — one
  declaration, one truth. Bands coarsen array order
  rather than competing with it: band order wins between bands, array order still
  applies within a band.
- **z points downwards, mapped directly onto v**: `@baustatik/fem` positions follow
  the structural convention (z downwards, loads act in +z) and screen `v` also
  grows downwards, so `worldPoint(x, z)` needs no sign flip. `src/scene.ts` is the
  single site of this mapping.
- **Namespaced spec IDs**: `node:{id}` and `beam:{id}`, matching the `grid:`
  prefix. `validateSpecs` requires global uniqueness across all bands, and a node
  and a beam may otherwise carry the same raw ID. Loads add the target and, for
  node loads, the component: `load:{loadId}:{targetId}[:fx|:fz]:arrow` and
  `…:label`. One load on several targets therefore stays distinguishable, which the
  fan-out needs.
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
- **Unsupported load kinds are skipped, not rejected**: moments and distributed
  loads produce no specs, and so does a force component that is absent or zero.
  Objecting to them would stop an otherwise drawable model from drawing at all,
  and a zero-length arrow is a point, not a picture.
- **Label text format is pinned**: `` `${roundSmart(magnitude)} kN` `` over the
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
- **Only concentrated forces are drawn**: node and beam moments and all distributed
  loads produce no specs yet. Distributed loads in particular need an answer to the
  scaling question first — one reference size over all visible loads, otherwise
  5 kN/m and 50 kN/m are indistinguishable.
- Result diagrams are not rendered yet; they would become an additional band in
  `FEM_LAYERS`.
