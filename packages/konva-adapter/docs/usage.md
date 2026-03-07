# @baustatik/konva-adapter Usage
Location: `packages/konva-adapter`

## Overview
Connects `@baustatik/section-geometry` and `@baustatik/render-core` to the Konva 2D canvas ecosystem. It provides mapping functions to convert domain geometry to renderable world points, shape builders to generate Konva-ready prop objects, and camera logic for panning, zooming, and grid generation.

## Thin-wall Rendering Wrappers (temporary)
Use `LineWithThickness` and `ArcWithThickness` when you want to render wall-like axis geometry now, while keeping `@baustatik/section-geometry` free of thickness semantics.

```ts
import Konva from 'konva';
import { screenPoint, viewport } from '@baustatik/render-core';
import { Line, Point } from '@baustatik/section-geometry';
import {
  type LineWithThickness,
  lineWithThicknessToKonvaLineProps,
} from '@baustatik/konva-adapter';

const axis = Line.make(Point.make(0, 0), Point.make(0, 10));

const wall: LineWithThickness = {
  axis,
  thickness: 10,
};

const vp = viewport(screenPoint(0, 0), 1);
const props = lineWithThicknessToKonvaLineProps(wall, vp);

new Konva.Line({
  ...props,
  stroke: 'black',
});
```

The wrappers are rendering-only and can later be mapped directly from a `cross-section` domain model without changing renderer functions.

```ts
function mapThinWallLine(w: ThinWallLine): LineWithThickness {
  return {
    axis: w.axis,
    thickness: w.t,
  };
}
```

## API Reference

### buildAxisLines()
**Signature:** `function buildAxisLines(bounds: VisibleWorldBounds): GridLine[]`
**Description:** Generates axis lines (u=0, v=0) that are visible within the given world bounding box.
**Example:**
```typescript
import { buildAxisLines } from '@baustatik/konva-adapter';

const bounds = { minU: -1, maxU: 2, minV: -3, maxV: 4 };
const axisLines = buildAxisLines(bounds);
// Returns lines for both u=0 and v=0 axes
```

### buildGridLines()
**Signature:** `function buildGridLines(bounds: VisibleWorldBounds, spacing: number): GridLine[]`
**Description:** Generates an array of orthogonal grid lines at regular spacing intervals covering the visible world extents.
**Example:**
```typescript
import { buildGridLines } from '@baustatik/konva-adapter';

const bounds = { minU: -2.2, maxU: 2.2, minV: -1.2, maxV: 1.2 };
const gridLines = buildGridLines(bounds, 1);
```

### getStagePointerWorld()
**Signature:** `function getStagePointerWorld(stage: Konva.Stage, vp: Viewport): WorldPoint | null`
**Description:** Reads the pointer position natively from the Konva Stage and maps it into a `WorldPoint`. Returns `null` if the pointer is not active over the stage.
**Example:**
```typescript
import { getStagePointerWorld } from '@baustatik/konva-adapter';
import Konva from 'konva';

const stage = new Konva.Stage({ container: 'app', width: 400, height: 400 });
const worldPointer = getStagePointerWorld(stage, viewport);
```

### panViewport()
**Signature:** `function panViewport(vp: Viewport, deltaX: number, deltaY: number): Viewport`
**Description:** Returns a new `Viewport` translationally shifted by the specified amount in screen pixels.
**Example:**
```typescript
import { panViewport } from '@baustatik/konva-adapter';
import { viewport, screenPoint } from '@baustatik/render-core';

let vp = viewport(screenPoint(10, 20), 2);
vp = panViewport(vp, 5, -3); // origin becomes {x: 15, y: 17}
```

### pointerScreenToWorld()
**Signature:** `function pointerScreenToWorld(pointer: ScreenPoint, vp: Viewport): WorldPoint`
**Description:** Reconstructs the world coordinates representing a raw logical `ScreenPoint` mapped by the viewport context.
**Example:**
```typescript
import { pointerScreenToWorld } from '@baustatik/konva-adapter';
import { screenPoint, viewport } from '@baustatik/render-core';

const vp = viewport(screenPoint(100, 200), 2);
const worldPos = pointerScreenToWorld(screenPoint(120, 260), vp); 
// returns { u: 10, v: 30 }
```

### sampleSectionArcToWorldPoints()
**Signature:** `function sampleSectionArcToWorldPoints(arc: SectionArc, options?: ArcSamplingOptions): WorldPoint[]`
**Description:** Discretizes an exact section-geometry `Arc` into a contiguous boundary of `WorldPoint`s for polygonal rendering.
**Example:**
```typescript
import { sampleSectionArcToWorldPoints } from '@baustatik/konva-adapter';
import { Arc, Point } from '@baustatik/section-geometry';

const arc = Arc.fromCenter(Point.make(0, 0), 2, 0, Math.PI / 2);
const points = sampleSectionArcToWorldPoints(arc, { segments: 4 });
```

### sectionArcEndPointToWorld()
**Signature:** `function sectionArcEndPointToWorld(arc: SectionArc): WorldPoint`
**Description:** Computes the terminal point of an arc and converts it natively from the YZ plane to UV world space.
**Example:**
```typescript
import { sectionArcEndPointToWorld } from '@baustatik/konva-adapter';
import { Arc, Point } from '@baustatik/section-geometry';

const arc = Arc.fromCenter(Point.make(0, 0), 5, 0, Math.PI / 2);
const endPoint = sectionArcEndPointToWorld(arc);
```

### sectionArcMidPointToWorld()
**Signature:** `function sectionArcMidPointToWorld(arc: SectionArc): WorldPoint`
**Description:** Subdivides the parameter space of an arc to find its geometric center point, mapping it directly into a UV world point.
**Example:**
```typescript
import { sectionArcMidPointToWorld } from '@baustatik/konva-adapter';
// ... arc setup ...
const midPoint = sectionArcMidPointToWorld(arc);
```

### sectionArcStartPointToWorld()
**Signature:** `function sectionArcStartPointToWorld(arc: SectionArc): WorldPoint`
**Description:** Evaluates the start radius point of an arc geometry and translates it into UV world space natively.
**Example:**
```typescript
import { sectionArcStartPointToWorld } from '@baustatik/konva-adapter';
// ... arc setup ...
const startPoint = sectionArcStartPointToWorld(arc);
```

### sectionPointToWorld()
**Signature:** `function sectionPointToWorld(p: SectionPoint): WorldPoint`
**Description:** Maps an arbitrary generic section coordinate natively from the YZ plane into a uniform `WorldPoint` struct in the UV plane. 
**Example:**
```typescript
import { sectionPointToWorld } from '@baustatik/konva-adapter';
import { Point } from '@baustatik/section-geometry';

const wPoint = sectionPointToWorld(Point.make(10, 20)); // { u: 10, v: 20 }
```

### sectionPolygonToWorldPoints()
**Signature:** `function sectionPolygonToWorldPoints(pg: SectionPolygon): WorldPoint[]`
**Description:** Retrieves the boundary vertex array of a polygon geometry and mass converts each section coordinate to a `WorldPoint`.
**Example:**
```typescript
import { sectionPolygonToWorldPoints } from '@baustatik/konva-adapter';
import { Polygon, Point } from '@baustatik/section-geometry';

const poly = Polygon.make([Point.make(0, 0), Point.make(2, 0), Point.make(1, 3)]);
const wPoints = sectionPolygonToWorldPoints(poly); 
```

### sectionPolylineToWorldPoints()
**Signature:** `function sectionPolylineToWorldPoints(pl: SectionPolyline): WorldPoint[]`
**Description:** Mass unrolls all vertex values of a generic polyline trace into natively projected `WorldPoint`s.
**Example:**
```typescript
import { sectionPolylineToWorldPoints } from '@baustatik/konva-adapter';
import { Polyline, Point } from '@baustatik/section-geometry';

const pLine = Polyline.make([Point.make(1, 2), Point.make(3, 4)]);
const linePoints = sectionPolylineToWorldPoints(pLine);
```

### visibleWorldBounds()
**Signature:** `function visibleWorldBounds(screenWidth: number, screenHeight: number, vp: Viewport): VisibleWorldBounds`
**Description:** Solves the inverse projection to determine the exact min/max bounds in world coordinates actively fitting inside viewport and screen resolution.
**Example:**
```typescript
import { visibleWorldBounds } from '@baustatik/konva-adapter';
import { viewport, screenPoint } from '@baustatik/render-core';

const vp = viewport(screenPoint(100, 50), 2);
const bounds = visibleWorldBounds(400, 200, vp);
// { minU: -50, maxU: 150, minV: -25, maxV: 75 }
```

### worldPolygonToKonvaLineProps()
**Signature:** `function worldPolygonToKonvaLineProps(points: readonly WorldPoint[], vp: Viewport): { readonly points: number[]; readonly closed: true }`
**Description:** Mass generates standard properties `points` and `closed: true` for configuring a native Konva `<Line>` component representing a Polygon shape directly rendering world geometry over the viewport frame.
**Example:**
```typescript
import { worldPolygonToKonvaLineProps } from '@baustatik/konva-adapter';
import { worldPoint, viewport, screenPoint } from '@baustatik/render-core';

const vp = viewport(screenPoint(0, 0), 1);
const points = [worldPoint(0, 0), worldPoint(1, 0), worldPoint(1, 1)];

const props = worldPolygonToKonvaLineProps(points, vp);
// props = { points: [0, 0, 1, 0, 1, 1], closed: true }
```

### worldPolygonToKonvaPoints()
**Signature:** `function worldPolygonToKonvaPoints(points: readonly WorldPoint[], vp: Viewport): number[]`
**Description:** A mapping wrapper evaluating a polygon coordinate path dynamically into sequential flat interleaved numbers expected by Konva.
**Example:**
```typescript
import { worldPolygonToKonvaPoints } from '@baustatik/konva-adapter';
import { worldPoint, viewport, screenPoint } from '@baustatik/render-core';

const array = worldPolygonToKonvaPoints([worldPoint(1, 2)], viewport(screenPoint(0,0), 1));
```

### worldPolylineToKonvaLineProps()
**Signature:** `function worldPolylineToKonvaLineProps(points: readonly WorldPoint[], vp: Viewport): { readonly points: number[] }`
**Description:** Condenses viewport point projection resolving flat coordinate components bound inside a config shape that injects safely into unclosed Konva lines.
**Example:**
```typescript
import { worldPolylineToKonvaLineProps } from '@baustatik/konva-adapter';
// returns { points: [1, 2, 3, 4] }
```

### worldPolylineToKonvaPoints()
**Signature:** `function worldPolylineToKonvaPoints(points: readonly WorldPoint[], vp: Viewport): number[]`
**Description:** Translates and structures `WorldPoint` chains flatly out towards raw `[x1, y1, x2, y2]` numerical buffers that define path segments inside Konva scenes.
**Example:**
```typescript
import { worldPolylineToKonvaPoints } from '@baustatik/konva-adapter';
// returns numbers array
```

### worldToKonvaPoint()
**Signature:** `function worldToKonvaPoint(p: WorldPoint, vp: Viewport): ScreenPoint`
**Description:** Overloads core render engine transformations strictly returning standardized `ScreenPoint` forms matching standard Konva positional conventions over fixed viewports scaling natively.
**Example:**
```typescript
import { worldToKonvaPoint } from '@baustatik/konva-adapter';
import { worldPoint, viewport, screenPoint } from '@baustatik/render-core';

const p = worldToKonvaPoint(worldPoint(3, -4), viewport(screenPoint(100, 50), 2));
```

### zoomViewportAt()
**Signature:** `function zoomViewportAt(vp: Viewport, factor: number, anchor: ScreenPoint): Viewport`
**Description:** Transforms scaling factors dynamically clamping over a target coordinate that locks static positions relative against zoom magnitude (like mouse wheel scroll-to-zoom).
**Example:**
```typescript
import { zoomViewportAt } from '@baustatik/konva-adapter';
import { viewport, screenPoint } from '@baustatik/render-core';

const vp = viewport(screenPoint(10, 20), 2);
const zoomed = zoomViewportAt(vp, 1.5, screenPoint(100, 50));
// zoomed.scale -> 3
```
