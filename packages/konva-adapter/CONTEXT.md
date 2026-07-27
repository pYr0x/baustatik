# `@baustatik/konva-adapter`

## Purpose

Renders neutral `render-core` specs with Konva and reports user input back as
`ViewIntent`s. This is the only package in the repository that knows Konva field
names; everything upstream stays render-agnostic.

## Boundaries

- Owns: translation of `Spec` to Konva shapes, diff-based reconciliation of the
  live Konva tree, paint-band (z-order) placement, and pointer/wheel interaction.
- Does not own: viewport truth (the viewer decides — the adapter only _reports_
  intents), spec construction, spec validation, or geometry calculation.

## Dependencies

- `@baustatik/render-core`: `RenderDriver` contract, `Spec` types, `assertNever`,
  `UnknownLayerError`.
- `@baustatik/viewport-2d`: `Viewport`, `WorldPoint`, `worldPointsToFlatArray`.
- `konva`: rendering backend.

Important consumers:

- `apps/demo`: wires the adapter into the cross-section and FEM viewers.

## Navigation

- [`src/index.ts`](src/index.ts): public exports (`createKonvaAdapter`,
  `KonvaDriverConfig`) — deliberately narrow.
- [`src/driver.ts`](src/driver.ts): composes stage, bands, reconciler, interaction.
- [`src/primitives/`](src/primitives): one pure `*Config(spec)` function per
  primitive plus the single `new Konva.X` / `setAttrs` dispatch in
  `primitives/index.ts` (the package's top-level `src/index.ts` is re-exports only).
  [`primitives/label.ts`](src/primitives/label.ts) is the exception that also owns
  its build/patch pair and the placement rule.
- [`src/stroke.ts`](src/stroke.ts): `DASH_PATTERNS` and the shared `strokeConfig()`.
- [`src/reconcile.ts`](src/reconcile.ts): id-based diffing of the live tree.
- [`src/bands.ts`](src/bands.ts): paint bands and `containerFor()`.
- [`src/interaction.ts`](src/interaction.ts): pointer/wheel to `ViewIntent`.

## Invariants and conventions

- **One config source for build and patch**: `buildPrimitive` passes a config to
  `new Konva.X`, `patchPrimitive` passes the _same_ config to `shape.setAttrs`.
  Build and patch therefore cannot diverge, and an `undefined` field **resets** the
  value rather than being skipped (e.g. `dashed` → `solid` clears `dash`). Adding a
  field to a `*Config` function automatically covers both paths.
- **`label` is the one composed primitive, with its own patch path**: `Konva.Label`
  is a group holding exactly one `Konva.Tag` and one `Konva.Text`, so it is not a
  `Konva.Shape` and one `setAttrs` cannot serve it. Build and patch still read the
  same two pure configs (`labelTagConfig`, `labelTextConfig`); the patch then
  updates tag and text, **re-measures** the text and moves the box. Leaf nodes are
  therefore typed `Konva.Shape | Konva.Label` (`LeafNode`) in both places that
  touch them — the top-level reconciler and `reconcileGroupChildren`.
- **The label placement rule**: anchor `A`, normalised direction `d`, gap `g`, box
  half sizes `hw`/`hh`. The box centre sits at `A + d * (g + t)` with
  `t = min(hw / |d.u|, hh / |d.v|)` over the non-zero components only, so the ray
  from `A` meets the box edge at exactly `g`. For axis-parallel directions `t` is
  exactly the half width or height. Without this rule "nearest edge" is ambiguous
  for skewed directions (projecting the half size and intersecting the ray give
  different answers) and the gap is not testable. The label itself is never
  rotated.
- **`fontFamily` is a spec field, not a Konva default**: otherwise appearance and
  screenshot baselines would depend on the font list of the machine.
- **Screen-pixel strokes**: every primitive sets `strokeScaleEnabled: false`. Konva
  resets the canvas transform to identity _before_ applying `lineWidth` and
  `setLineDash`, so both `strokeWidth` and `dash` are screen pixels and are
  zoom-invariant. `DASH_PATTERNS` values are therefore plain pixel constants.
- **`arcPath` is a `Konva.Path`, not a `Konva.Arc`**: the name difference is the
  point. Konva's `Arc` is a **ring segment** — an area that always draws both radii
  and the closing edge with it — while `ArcPathSpec` is a curved _stroke_. A plain
  stroked arc therefore goes through the SVG command `A`, built by `arcPathData()`.
  Its `data` holds absolute world coordinates and the shape stays at `x=0/y=0`, so
  the stage transform does the rest, exactly as for every other primitive. Both
  flags follow from `sweepAngle` alone: SVG counts positive towards +y and `v`
  points down, so a growing angle _is_ `sweep-flag: 1` — no sign flip. Should a
  ring segment ever be needed, it arrives as its own spec and _that_ one maps to
  `Konva.Arc`.
- **`radius` is the only local-coordinate field**: it applies to `circle`, `arcPath`
  and `triangle` and scales with the stage. Screen-constant symbols emit a new
  radius each zoom frame; the unified `setAttrs` patch picks that up automatically.
- **Triangle geometry**: `TriangleSpec.sideLength` is the edge length `a` of an
  equilateral triangle; Konva's `RegularPolygon` wants the circumradius
  `R = a / √3`. With `v` pointing down, the default orientation puts the apex up.
- **Paint bands over insertion order**: one `Konva.Group` per declared band, added
  to the layer once in band order. A shape created later lands at the end of _its_
  band instead of on top of everything. With bands declared, every spec must carry
  a declared `layer` or `UnknownLayerError` is thrown.
- **Group offset is inverted**: Konva subtracts `offset` from the local coordinate
  system, while `GroupSpec.translation` describes the desired visible shift
  positively — the adapter negates it.
- **`flush()` draws asynchronously**: it calls `layer.batchDraw()`, which schedules
  through `requestAnimationFrame`. Tests that inspect pixels must await a frame
  (see `nextFrame()` in `tests/browser/harness.ts`) before taking a screenshot.
- **Screenshots pin `Konva.pixelRatio = 1`**: otherwise Konva bakes
  `window.devicePixelRatio` into the canvas resolution and baselines become
  device-dependent (Windows display scaling in particular).

## Validation

```text
pnpm --filter @baustatik/konva-adapter test             # Unit + Browser (as in CI)
pnpm --filter @baustatik/konva-adapter test:screenshot  # local only, see below
pnpm --filter @baustatik/konva-adapter typecheck
pnpm --filter @baustatik/konva-adapter build
```

Test projects:

- **Unit** (node): pure `*Config` functions, `DASH_PATTERNS`, triangle geometry, the
  arc's path data (endpoints and both flags) and `labelTopLeft` against given box
  sizes. No Konva needed.
- **Browser** (chromium): reconciler, bands and interaction against real Konva,
  plus the label box _measured_ by Konva and its position for an axis-parallel and
  a skewed direction. Asserts behaviour, never pixels, so it is
  platform-independent and runs in CI.
- **Screenshot** (chromium): `toMatchScreenshot` baselines per primitive. Canvas
  anti-aliasing is platform-dependent, so baselines live under
  `tests/screenshot/__screenshots__/chromium-<platform>/` and only the local
  platform's set is maintained today. CI does not run this project.

## Known constraints

- Only `chromium-win32` screenshot baselines exist. The path resolver is already
  platform-scoped, so a Linux set can be added later without restructuring.
- **No pixel baseline for `label`**, deliberately: text depends on the machine far
  more strongly than the already platform-dependent anti-aliasing (font
  availability, hinting). The promise worth pinning is the box geometry, and that
  is asserted in the browser test instead.
- Nested `GroupSpec`s are not supported, and neither is a `LabelSpec` inside a
  group — a label _is_ a group in Konva, so it would produce exactly the nested
  tree. Both are enforced upstream by `render-core`'s `validateSpec`.
