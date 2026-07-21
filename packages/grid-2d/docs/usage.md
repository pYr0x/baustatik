# @baustatik/grid-2d Usage
Location: `packages/grid-2d`

## Overview
Generates visible grid lines and main axes for 2D viewport visualizations. The calculations map grid lines to the viewport's visible world coordinates, returning generic line specifications for rendering.

## API Reference

### gridSpecs()
**Signature:**
```typescript
export function gridSpecs(
  vp: Viewport,
  screenSize: Size,
  options: GridOptions,
): readonly LineSpec[]
```
**Description:**
Calculates the visible grid lines and axes for a given viewport and screen size. Line coordinates are calculated in world space and returned as generic `LineSpec` objects.
To ensure high performance and smooth rendering during interaction (pan/zoom):
- IDs of generated lines are stable across viewports, based on their coordinate index (`grid:v:{k}`, `grid:h:{k}`, `grid:axis:u`, `grid:axis:v`).
- Includes a safeguard (`maxLines`) that limits the maximum lines generated. If the limit is exceeded, it only draws the primary axes (or nothing if axes are disabled) rather than throwing, avoiding viewport interaction crashes when zoomed far out.

**Example:**
```typescript
import { viewport, screenPoint, size } from '@baustatik/viewport-2d';
import { gridSpecs } from '@baustatik/grid-2d';

const vp = viewport(screenPoint(0, 0), 1.0);
const screenSize = size(800, 600);

try {
  const specs = gridSpecs(vp, screenSize, {
    spacing: 50.0,
    showAxes: true,
    gridStyle: { strokeColor: '#e0e0e0', strokeWidth: 1 },
    axisStyle: { strokeColor: '#8c8c8c', strokeWidth: 1.5 },
  });
  
  // Pass specs to a rendering adapter (e.g., @baustatik/konva-adapter)
} catch (error) {
  // Handle InvalidGridSpacingError / InvalidGridOptionsError
}
```

---

### GridOptions
**Signature:**
```typescript
export type GridOptions = {
  readonly spacing: number;
  readonly showAxes?: boolean;
  readonly gridStyle?: GridLineStyle;
  readonly axisStyle?: GridLineStyle;
  readonly maxLines?: number;
};
```
**Description:**
Configuration options for grid calculations:
- `spacing`: Grid interval in world coordinates. Must be a finite positive number.
- `showAxes`: If `true`, the primary axes ($u = 0$ / $v = 0$) are drawn using `axisStyle` (instead of overlapping grid lines). Defaults to `true`.
- `gridStyle`: The styling configuration (stroke color, stroke width) applied to grid lines.
- `axisStyle`: The styling configuration applied to the main axes.
- `maxLines`: Threshold limit for generated grid lines. Defaults to `2000`.

---

### GridLineStyle
**Signature:**
```typescript
export type GridLineStyle = {
  readonly strokeColor?: string;
  readonly strokeWidth?: number;
};
```
**Description:**
Determines the stroke styling. Note that the stroke width specifies physical screen pixels; the rendering adapter should render them without zooming (i.e. setting `strokeScaleEnabled: false`).

---

### InvalidGridSpacingError
**Signature:**
```typescript
export class InvalidGridSpacingError extends BaustatikError
```
**Description:**
Thrown when the provided `spacing` in `GridOptions` is invalid (e.g. not a finite number or $\le 0$).

---

### InvalidGridOptionsError
**Signature:**
```typescript
export class InvalidGridOptionsError extends BaustatikError
```
**Description:**
Thrown when options other than spacing are invalid (e.g. `maxLines` is not a positive integer, or `strokeWidth` is negative).
