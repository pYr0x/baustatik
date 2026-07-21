# `@baustatik/fem-viewer`

## Purpose

Maps a planar FEM frame model — nodes and beams — to render-agnostic `Spec`
objects and drives a `RenderDriver` with viewport state. Beams draw as thin black
lines, nodes as small red circles, and node supports as grouped symbols.

## Boundaries

- Owns: model-to-spec mapping for nodes, beams and supports, the x/z → u/v coordinate
  mapping, paint-band assignment, screen-constant symbol sizing, and viewport
  state (pan/zoom/reset).
- Does not own: Konva or canvas rendering execution, FEM solving, grid line
  calculation (delegated to `@baustatik/grid-2d`), or model validation beyond
  resolving beam endpoints.

## Dependencies

- `@baustatik/fem`: `Node` and `Beam` model types.
- `@baustatik/errors`: base `BaustatikError` class for package error hierarchy.
- `@baustatik/render-core`: `Spec`, `LineSpec`, `CircleSpec`, `RenderDriver`.
- `@baustatik/grid-2d`: `gridSpecs`, `GridOptions` for the background grid.
- `@baustatik/viewport-2d`: `Viewport`, `Size`, `worldPoint`, `pan`, `zoomAround`.

## Navigation

- [`src/scene.ts`](src/scene.ts): `femSpecs` — the pure model → spec mapping.
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
  them. `FEM_LAYERS` (`['grid','beams','nodes','supports']`, last = topmost) is passed to the
  driver at construction. The tuple is simultaneously the name list, the type
  source and the z-order — one declaration, one truth. Bands coarsen array order
  rather than competing with it: band order wins between bands, array order still
  applies within a band.
- **z points downwards, mapped directly onto v**: `@baustatik/fem` positions follow
  the structural convention (z downwards, loads act in +z) and screen `v` also
  grows downwards, so `worldPoint(x, z)` needs no sign flip. `src/scene.ts` is the
  single site of this mapping.
- **Namespaced spec IDs**: `node:{id}` and `beam:{id}`, matching the `grid:`
  prefix. `validateSpecs` requires global uniqueness across all bands, and a node
  and a beam may otherwise carry the same raw ID.
- **Supports are grouped, screen-constant symbols**: every `NodeSupport` maps to
  one `GroupSpec` anchored at its node. Its symbol-specific translation and all
  child geometry are divided by the viewport scale together, so their visual
  distance and proportions remain constant while zooming. The Konva adapter maps
  the positive translation to Konva's inverse `offsetX`/`offsetY` convention.
- **Dangling references throw**: a beam pointing at a missing node raises
  `UnknownNodeReferenceError`. Unlike the transient `maxLines` condition in
  `grid-2d`, this is a data error that does not resolve by panning, and a silently
  skipped beam disappears without trace.

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
- Loads and result diagrams are not rendered yet; they would each become an
  additional band in `FEM_LAYERS`.
