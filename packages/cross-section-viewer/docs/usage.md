# @baustatik/cross-section-viewer Usage
Location: `packages/cross-section-viewer`

## Overview
A framework-agnostic cross-section viewer that decouples UI rendering drivers (such as Konva/HTML Canvas) from physical segment geometry and store state.

## API Reference

### createCrossSectionViewer()
**Signature:**
```typescript
function createCrossSectionViewer(config: {
  driver: RenderDriver;
  getSegments: () => readonly Segment[];
  initialViewport?: Viewport;
  arcSegments?: number;
}): {
  requestRender: () => void;
  destroy: () => void;
}
```
**Description:** Initializes and returns a cross-section viewer instance. The viewer interacts with a rendering driver, retrieves geometric segments on-demand (e.g. from a state store), manages viewport transformations (pan, zoom, reset), and maps the physical 2D coordinates ($y, z$) to world points ($u, v$).

**Example:**
```typescript
import { createCrossSectionViewer } from '@baustatik/cross-section-viewer';
import { createKonvaAdapter } from '@baustatik/konva-adapter';
import { Point } from '@baustatik/section-geometry';
import type { Segment } from '@baustatik/cross-section';

// 1. Set up a state container (e.g. Pinia, simple array, or reactive store)
const segments: Segment[] = [
  {
    id: 'wall-1',
    geometry: 'line',
    start: Point.make(0, 0),
    end: Point.make(0, 100),
    thickness: 8,
  },
];

// 2. Instantiate the render driver (e.g. Konva driver)
const driver = createKonvaAdapter({
  container: document.getElementById('canvas-container') as HTMLDivElement,
  width: 800,
  height: 600,
});

// 3. Create the viewer by injecting the driver and getSegments callback
const viewer = createCrossSectionViewer({
  driver,
  getSegments: () => segments,
  arcSegments: 24, // Optional: resolution for arc rendering (defaults to 24)
});

// 4. Perform initial render
viewer.requestRender();

// 5. Clean up when done (e.g. when component unmounts)
// viewer.destroy();
```
