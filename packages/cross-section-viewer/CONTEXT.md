# `@baustatik/cross-section-viewer`

## Purpose

Maps a stored `SectionGeometry` and results **handed in from outside** to
render-agnostic `Spec` objects and drives a `RenderDriver` with viewport state.
Wall centre lines draw as black strokes carrying their physical thickness, the
derived outline as orange polygons, an optional FE mesh as a light ochre
wireframe, and centroid, shear centre and stress points as red, green and blue
symbols on top.

The viewer **derives nothing** — neither an outline, nor a mesh, nor section
values. Everything it draws was computed by someone else and travelled here.

## Boundaries

- Owns: geometry-to-spec mapping for walls, outline, mesh wireframe and result
  symbols, the y/z → u/v coordinate mapping, the m → mm conversion of section
  values, paint-band assignment, screen-constant symbol sizing, the view style,
  and viewport state (pan/zoom/reset).
- Does not own: Konva or canvas rendering execution, outline derivation
  (`@baustatik/cross-section` owns it and the record carries the result),
  meshing or any worker lifecycle (ADR 0039), section-value calculation, grid
  line calculation (`@baustatik/grid-2d`), or **when a result is valid** — the
  caller decides that and discards its result on any geometry or policy change.

## Dependencies

- `@baustatik/cross-section`: `SectionGeometry`, `Wall`, `SectionPolicy`,
  `SectionProperties`, `StressPoint` — types only.
- `@baustatik/section-geometry`: `Bulge` and `Point` for the arc walls.
- `@baustatik/units`: `convert` for the one m → mm conversion.
- `@baustatik/errors`: base `BaustatikError` for `InvalidFEMeshError`.
- `@baustatik/render-core`: `Spec`, `IndexedLineListSpec`, `RenderDriver`,
  `assertNever`.
- `@baustatik/grid-2d`: `gridSpecs`, `GridOptions` for the background grid.
- `@baustatik/viewport-2d`: `Viewport`, `Size`, `worldPoint`, `pan`,
  `zoomAround`.

Deliberately **not** a dependency: `@baustatik/mesh-2d-wasm`. `CrossSectionFEMesh`
is structurally compatible with `Mesh2DResult`, so a mesher result drops straight
in, but this package knows neither worker, PSLG, `boundarySegments` nor markers.

## Navigation

The files stay **flat**. Unlike the FEM viewer's model, loads and results, the
five cross-section bands have no second shared level of abstraction yet; a
directory per single file would buy no locality.

- [`src/scene.ts`](src/scene.ts): `crossSectionSpecs` — the one pure door.
  Composition only: geometry, mesh and results in, spec list out. No driver, no
  Konva, no state, therefore testable in Node.
- [`src/style.ts`](src/style.ts): `CrossSectionStyle` and `DEFAULT_STYLE`,
  resolved once in `crossSectionSpecs` and handed to all four mappings.
- [`src/thin-walls.ts`](src/thin-walls.ts): the wall centre lines — the input.
  Straight walls become `line`, curved ones `arcPath`.
- [`src/outlines.ts`](src/outlines.ts): the carried, derived outline.
- [`src/fe.ts`](src/fe.ts): `CrossSectionFEMesh` and the triangle → edge
  reduction, plus the `WeakMap` edge cache.
- [`src/symbols.ts`](src/symbols.ts): centroid, shear centre, stress points, and
  the one `convert(1).from('m').toExact('mm')` of the package.
- [`src/layers.ts`](src/layers.ts): `CROSS_SECTION_LAYERS` and `CrossSectionLayer`.
- [`src/viewer.ts`](src/viewer.ts): `createCrossSectionViewer` — pulls, viewport
  state and driver wiring, and nothing else.
- [`src/errors.ts`](src/errors.ts): `InvalidFEMeshError`.
- [`docs/usage.md`](docs/usage.md): canonical API usage documentation.

Tests mirror the layout: one file per mapping under `tests/node/`, plus
`tests/scene.test.ts` for what only exists once the parts meet (band coverage, ID
uniqueness across all bands, stability under pan and zoom, one style object
reaching all four) and `tests/viewer.test.ts` for pull behaviour, driver protocol
and camera. Fixtures live in `tests/helpers.ts` — one file, because all five
bands draw the *same* cross-section.

## Invariants and conventions

- **Scale drawing, not schema**: `Wall.t` is a genuine world quantity in
  millimetres and is multiplied by `vp.scale` so that the adapter's
  `strokeScaleEnabled: false` reproduces it as a world width. This is the
  deliberate opposite of [`@baustatik/fem-viewer`](../fem-viewer), where nodes and
  beams are symbols without extent. Everything with the `Px` suffix in
  `CrossSectionStyle` is schematic and is **divided** by `vp.scale`, so it stays
  screen-constant while zooming. Wall thickness is therefore explicitly **not** a
  style field.
- **The world is millimetres in the cross-section plane, `y → u` and `z → v`**,
  both growing right and down on screen with no sign flip (ADR 0031). Every
  `worldPoint` call in the package follows this rule; there is no site that
  mirrors.
- **One conversion, and it is exact**: `SectionProperties` is SI metres
  (ADR 0024), the scene is millimetres. `convert(1).from('m').toExact('mm')`
  stands once, in `symbols.ts`. `to('mm')` would round to whole millimetres — a
  centroid at `139.5 mm` would land at `140 mm` in the scene — and a literal
  `1000` would be the same number without the name that explains it.
- **Two layers, two sources, and the separation is the statement of ADR 0030**:
  the **outline** arrives finished in the record, already discretised, and agrees
  with the numbers `A`, `Iy` and `Iz` fall out of — that is what it travels for.
  The viewer never recomputes it; there would be two outlines and an argument
  about which one counts. The **wall centre lines** come from `nodes`/`walls` and
  carry their thickness as a stroke width. They are the input, not the result.
- **Orange outline against black walls, and that is a statement of the viewer**
  (ADR 0037): derived against input. Whoever wants to see a notch at a degree-3
  node or a clipped miter spike has to be able to tell the two layers apart, and
  black on black is exactly where one cannot.
- **Paint bands guarantee z-order, array order does not**: `CROSS_SECTION_LAYERS`
  (`['grid','thin-walls','outlines','fe','symbols']`, last = topmost) is passed to
  the driver at construction. Without bands, grid lines climb over the section
  over time: grid IDs are world-indexed, zooming out brings new world positions
  into view, and the renderer appends newly built shapes. The mesh sits above wall
  and outline deliberately — it belongs to a calculation, and one looks at it
  *because* something was computed. Symbols sit above everything: they are points,
  and a hidden point is none.
- **Namespaced spec IDs**: `cross-section:thin-wall:{wallId}`,
  `cross-section:outline:{ringIndex}`, `cross-section:fe:wireframe`,
  `cross-section:symbols` with the children `…:symbol:centroid`,
  `…:symbol:shear-centre` and `…:symbol:stress-point:{nr}`. `validateSpecs`
  requires uniqueness across all bands, and an editor-assigned wall ID must not be
  able to collide with an outline or a symbol. The symbol IDs come from **factual
  identity**, never from a position or an array index.
- **The outline ID carries the ring index, not the position in the filtered
  list**: a ring briefly degenerate during input would otherwise renumber every
  following ring, and the reconciler would tear down and rebuild shapes that did
  not change.
- **The drawing path does not throw for the wall graph**: a dangling node
  reference drops exactly that wall; a non-finite bulge, or one at the full-circle
  pole, falls back to the chord. A throw here would erase grid, outline and every
  other wall with it, and since `draw()` also runs from `onViewIntent` it would
  break mid-pan. The gate reports those findings (ADR 0032) — the picture's job is
  to make a broken model **visible**.
- **A malformed FE mesh is the exception and throws** (`InvalidFEMeshError`): a
  wall graph may legitimately be unfinished during input, but a mesh is a
  *calculation result*. If its element list does not add up to its own `kind`,
  something is wrong with the calculation, not with the drawing.
- **The wireframe draws corner edges only, each exactly once**: a Triangle Tri6
  has the published order `[v0, v1, v2, m01, m12, m20]`, its edges stay
  geometrically straight and the mid-nodes sit exactly at their midpoints, so
  Tri3 and Tri6 produce the *same* picture. Edges are canonicalised with
  `min`/`max` because an edge shared by two elements runs opposite ways in them;
  without it the buffer would hold it twice and a semi-transparent stroke would
  look darker along every interior edge. A `WeakMap` keyed on the mesh object
  caches the derived edges — pan and zoom change only the viewport, never the
  topology.
- **`IndexedLineListSpec` instead of one `LineSpec` per edge**: a few thousand elements
  would otherwise become as many adapter nodes. The points buffer passes through
  **uncopied**, because a mesh already holds `y`/`z` millimetres.
- **Results are pulls, and an omitted pull equals `undefined`**: there is no extra
  visibility switch beside the existence of a result — it would be a second state
  that can go stale. The caller decides when a calculation is valid and discards
  it on geometry or policy changes; the picture follows without a second state
  here (the pattern of the support reactions in the FEM viewer, and ADR 0039 for
  the mesh).
- **What is missing is not invented**: the centroid draws as soon as `properties`
  exists (`ys`/`zs` are mandatory). The shear centre draws only when **both** `yM`
  and `zM` are determined — `undefined` means "not determined", never `0` and
  never "coincides with the centroid". Stress points without `properties` stay
  invisible too, because their relative coordinates have no absolute place then.
- **The symbols are one group with ordered children**, in the fixed order
  centroid, shear centre, stress points by `nr`. That makes the overlap
  reproducible — the last stress point may sit exactly on the centroid — and uses
  the existing ordered child reconciler instead of letting insertion history
  decide. The shear centre circle is deliberately **smaller** than the centroid
  circle: on a doubly symmetric figure the two coincide, and at equal size the
  shear centre would be invisible.
- **`sectionPolicy` is a pull next to the geometry, not a module constant**
  (ADR 0033): `discretisationTolerance` decides which edge counts as curved at all, and since
  `schemaVersion: 7` it lives in the *same* record as the outline drawn beside it.
  It enters the scene **once** and is handed down; the wall mapping does not pull
  it again.
- **Signs carry through without conversion**: `bulge` → `Arc.sweep` (positive
  `+y → +z`, ADR 0031) → `ArcPathSpec.sweepAngle` (positive `+u → +v`). The
  mapping between them is `worldPoint(y, z)`, the identity. Pinned by a test — the
  one place where three rotation senses meet.
- **Every pull is read exactly once per frame**: a second call could return a
  different value, and then one picture would show two calculation states.

## Validation

```text
pnpm --filter @baustatik/cross-section-viewer test
pnpm --filter @baustatik/cross-section-viewer typecheck
pnpm --filter @baustatik/cross-section-viewer build
```

## Known constraints

- The `fit` view intent is not implemented; `createCrossSectionViewer` accepts it
  and does nothing. A bounding box over the outline would be the natural basis.
- **Stress points for a free `SectionGeometry` do not exist yet.**
  `stressPoints()` returns `undefined` for `kind: 'section-geometry'`, so the blue
  rectangles only appear for a parametric shape or a catalogue profile. The viewer
  side is complete and waits for the template.
- **No worker is wired to the viewer.** `apps/demo/cross-section/mesh-2d.ts`
  stays an isolated SVG test bench. Once a real cross-section FE calculation holds
  its mesh as a result, its application composition hands it over via `getFEMesh`.
- **No selection, snapping or editing interaction.** The viewer is read-only; pan,
  zoom and reset are the whole interaction.
- `thinWallSpecs` rebuilds its `Map<string, SectionNode>` on every draw. Fine at
  current model sizes, worth revisiting if draw frequency becomes a problem.
