# `@baustatik/grid-2d`

## Purpose

Calculates 2D grid line and axis specifications mapped to visible world coordinates for 2D viewports. Returns render-agnostic `LineSpec` objects consumed by visual rendering adapters.

## Boundaries

- Owns: 2D grid spacing validation, visible line interval calculation in world coordinates, and neutral line specification generation.
- Does not own: canvas or Konva rendering execution, viewport transformation state management, or dynamic zoom-dependent auto-spacing algorithms.

## Dependencies

- `@baustatik/errors`: base `BaustatikError` class for package error hierarchy.
- `@baustatik/render-core`: `LineSpec` primitive interface.
- `@baustatik/viewport-2d`: `Viewport`, `Size`, `WorldBounds`, `visibleWorldBounds`, and `worldPoint`.

Important consumers:
- [`@baustatik/cross-section-viewer`](../cross-section-viewer): composes grid specs into cross-section scene rendering.
- [`@baustatik/fem-viewer`](../fem-viewer): composes grid specs into FEM frame scene rendering.

## Navigation

- [`src/index.ts`](src/index.ts): public package exports (`gridSpecs`, `GridOptions`, `GridLineStyle`, `InvalidGridSpacingError`, `InvalidGridOptionsError`).
- [`src/grid.ts`](src/grid.ts): grid and axis line coordinate calculation implementation.
- [`docs/usage.md`](docs/usage.md): canonical API usage documentation.

## Invariants and conventions

- **Screen-pixel stroke widths**: `GridLineStyle.strokeWidth` specifies physical screen pixels; rendering adapters must disable stroke scaling (e.g., `strokeScaleEnabled: false`).
- **Stable Line IDs**: Generated line IDs use world index keys (`grid:v:{k}`, `grid:h:{k}`, `grid:axis:u`, `grid:axis:v`) to remain stable across pan/zoom for efficient renderer diffing.
- **Rendering Order**: Axes (`u=0` / `v=0`) are appended to the end of the returned array so they render on top of grid lines in insertion-order renderers. This still holds under paint bands, which coarsen rather than replace array order: axes and grid lines share one band, so their relative order remains the array order.
- **Paint band**: All specs (lines and axes) are stamped with `GridOptions.layer`, defaulting to `'grid'`. Stamping happens here rather than in the caller so that up to `maxLines` specs per frame are not copied through a spread just to add the field. Consumers that declare bands must include `'grid'` as their bottom band — without it, grid lines rebuilt on zoom-out stack up *above* the domain content, whose IDs stay stable and are therefore never rebuilt.
- **Panic-free safeguarding**: Exceeding `maxLines` (default 2000) falls back to rendering axes only rather than throwing, avoiding interaction crashes during pan/zoom frame execution. Invalid options or spacing still throw `InvalidGridOptionsError` / `InvalidGridSpacingError`.

## Validation

```text
pnpm --filter @baustatik/grid-2d test
pnpm --filter @baustatik/grid-2d typecheck
pnpm --filter @baustatik/grid-2d build
```

## Known constraints

- Fixed world-coordinate `spacing` requirement; automatic adaptive grid scaling based on viewport zoom is currently not implemented.
