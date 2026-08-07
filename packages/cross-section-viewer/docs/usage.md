# @baustatik/cross-section-viewer Usage
Location: `packages/cross-section-viewer`

## Overview
A framework-agnostic cross-section viewer that decouples UI rendering drivers (such as Konva/HTML Canvas) from the stored cross-section geometry and store state.

## API Reference

### createCrossSectionViewer()
**Signature:**
```typescript
function createCrossSectionViewer(config: {
  driver: RenderDriver;
  getGeometry: () => SectionGeometry;
  getScreenSize: () => Size;
  grid?: GridOptions;
  initialViewport?: Viewport;
}): {
  requestRender: () => void;
  destroy: () => void;
}
```
**Description:** Initializes and returns a cross-section viewer instance. The viewer interacts with a rendering driver, pulls the stored `SectionGeometry` on demand (e.g. from a state store), manages viewport transformations (pan, zoom, reset), and maps the physical 2D coordinates ($y, z$) to world points ($u, v$).

**What it draws, and from which source.** `SectionGeometry` carries its derived outline with it ([ADR 0030](../../../docs/adr/0030-the-section-editor-stores-a-wall-graph.md)), and the viewer reads that outline rather than deriving its own — a second outline would be a second opinion on the shape whose section values are printed in the report. On top of it, the `midline` variant draws each wall's centre line with its physical thickness `t` as the stroke width. A wall with a non-zero `bulge` gets **no** centre line: turning a bulge into an arc belongs to P1 and must not be written twice, and the curvature is already visible in the outline.

The port replaces the former `getSegments(): readonly Segment[]`. `Segment` was dead code — nothing in `src/` ever constructed one, and this viewer was its only consumer.

**Example:**
```typescript
import { createCrossSectionViewer } from '@baustatik/cross-section-viewer';
import { createKonvaAdapter } from '@baustatik/konva-adapter';
import type { SectionGeometry } from '@baustatik/cross-section';

// 1. Set up a state container (e.g. Pinia, a plain object, or a reactive store).
//    Coordinates and thicknesses are millimetres.
const geometry: SectionGeometry = {
  kind: 'midline',
  idealisation: 'thin-walled',
  nodes: [
    { id: 'n1', y: 0, z: 0 },
    { id: 'n2', y: 0, z: 100 },
  ],
  walls: [{ id: 'wall-1', startNodeId: 'n1', endNodeId: 'n2', t: 8 }],
  // Derived from nodes/walls by the editor and stored with them.
  outline: [
    {
      points: [
        { y: -4, z: 0 },
        { y: 4, z: 0 },
        { y: 4, z: 100 },
        { y: -4, z: 100 },
      ],
    },
  ],
};

// 2. Instantiate the render driver (e.g. the Konva driver)
const driver = createKonvaAdapter({
  container: document.getElementById('canvas-container') as HTMLDivElement,
  width: 800,
  height: 600,
});

// 3. Create the viewer by injecting the driver and the geometry callback
const viewer = createCrossSectionViewer({
  driver,
  getGeometry: () => geometry,
  getScreenSize: () => ({ width: 800, height: 600 }),
});

// 4. Perform initial render
viewer.requestRender();

// 5. Clean up when done (e.g. when a component unmounts)
// viewer.destroy();
```

## Checking a geometry before drawing it

`@baustatik/cross-section` owns the gate. It **warns, it does not refuse** ([ADR 0032](../../../docs/adr/0032-the-cross-section-gate-warns.md)) — the viewer draws a flawed section anyway, so that the flaw is visible next to its report.

The tolerance is a **parameter**, not a constant inside the gate — so the caller
supplies it, and neither this package nor `@baustatik/cross-section` needs a
geometry dependency to read one number. `DEFAULT_ARC_TOLERANCE` is owned by
`@baustatik/geometry-2d` and re-exported from `@baustatik/section-geometry`;
take it from whichever of the two your application already depends on.

```typescript
import { validateSectionGeometry } from '@baustatik/cross-section';
import { DEFAULT_ARC_TOLERANCE } from '@baustatik/geometry-2d';

const { errors, warnings } = validateSectionGeometry(geometry, {
  arcTolerance: DEFAULT_ARC_TOLERANCE,
});
```
