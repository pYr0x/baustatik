---
'@baustatik/cross-section-viewer': patch
'@baustatik/konva-adapter': patch
'@baustatik/render-core': patch
---

Cross-section viewer restructured, plus a wireframe primitive for it.

`@baustatik/render-core` gains `IndexedLineListSpec`, a mesh-agnostic primitive
for a list of independent lines: flat `points` (`[u0, v0, …]`) and `indices`
(flat index pairs) as `ArrayLike<number>`, so a `Float64Array`/`Uint32Array`
passes through without a copy. One spec per wireframe instead of one `LineSpec`
per edge. Validation checks that both buffers can be read; duplicate, reversed
and degenerate segments stay allowed.

`@baustatik/konva-adapter` maps it to exactly one `Konva.Shape` whose scene
function begins a separate subpath per segment, so two independent edges are
never joined.

**Breaking for `@baustatik/cross-section-viewer`:**

- `CROSS_SECTION_LAYERS` is now
  `['grid', 'thin-walls', 'outlines', 'fe', 'symbols']`. The former `'section'`
  band is gone. Callers that pass the tuple to the driver need no change; callers
  that hard-coded `'section'` do.
- Spec IDs are namespaced: `cross-section:thin-wall:{wallId}` and
  `cross-section:outline:{ringIndex}` replace the bare `{wallId}` and
  `outline-{index}`.

New in the same package:

- `crossSectionSpecs` (`scene.ts`) is the pure scene door; `createCrossSectionViewer`
  now only pulls data, holds the viewport and drives the renderer.
- Three optional result pulls — `getProperties`, `getStressPoints`, `getFEMesh` —
  draw the centroid (red), the shear centre (green, only when both `yM` and `zM`
  are determined) and the stress points (blue), plus an FE wireframe. An omitted
  pull and a pull returning `undefined` are the same off state.
- `CrossSectionStyle` with `DEFAULT_STYLE`, resolved once per scene. Wall
  thickness stays out of it: `Wall.t` is physics, everything with the `Px` suffix
  is screen-constant.
- `CrossSectionFEMesh`, structurally compatible with `Mesh2DResult` but without a
  dependency on the mesher.
- `@baustatik/units` and `@baustatik/errors` are new direct dependencies: section
  values arrive in SI metres and are converted exactly once, with `toExact`.
