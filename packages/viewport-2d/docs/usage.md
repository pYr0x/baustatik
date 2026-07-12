# @baustatik/viewport-2d Usage
Location: `packages/viewport-2d`

## Overview
A lightweight 2D viewport transform utility for mapping between world and screen coordinates, including panning and zooming operations.

## API Reference

### WorldPoint
**Signature:**
```typescript
type WorldPoint = {
  readonly u: number;
  readonly v: number;
};
```
**Description:** Represents a 2D point in the neutral world coordinate system, where `u` extends to the right and `v` extends downward.

### ScreenPoint
**Signature:**
```typescript
type ScreenPoint = {
  readonly x: number;
  readonly y: number;
};
```
**Description:** Represents a 2D point in screen coordinates, where `x` extends to the right and `y` extends downward.

### Viewport
**Signature:**
```typescript
type Viewport = {
  readonly origin: ScreenPoint;
  readonly scale: number;
};
```
**Description:** Defines a 2D viewport mapping with a scale factor and screen origin.

### worldPoint()
**Signature:** `function worldPoint(u: number, v: number): WorldPoint`
**Description:** Creates a validated `WorldPoint` object. Throws `InvalidWorldPointError` if `u` or `v` is `NaN` or `±Infinity`.
**Example:**
```typescript
import { worldPoint } from '@baustatik/viewport-2d';

const wp = worldPoint(10.5, -5.0);
```

### screenPoint()
**Signature:** `function screenPoint(x: number, y: number): ScreenPoint`
**Description:** Creates a validated `ScreenPoint` object. Throws `InvalidScreenPointError` if `x` or `y` is `NaN` or `±Infinity`.
**Example:**
```typescript
import { screenPoint } from '@baustatik/viewport-2d';

const sp = screenPoint(100, 200);
```

### viewport()
**Signature:** `function viewport(origin: ScreenPoint, scale: number): Viewport`
**Description:** Creates a validated `Viewport` object. Throws `InvalidViewportError` if `scale` is `NaN`, `±Infinity`, or less than or equal to `0`. Throws `InvalidScreenPointError` if `origin` is invalid.
**Example:**
```typescript
import { screenPoint, viewport } from '@baustatik/viewport-2d';

const vp = viewport(screenPoint(0, 0), 2.5);
```

### worldToScreen()
**Signature:** `function worldToScreen(p: WorldPoint, vp: Viewport): ScreenPoint`
**Description:** Converts a `WorldPoint` to a `ScreenPoint` using the provided `Viewport`.
**Example:**
```typescript
import { worldPoint, screenPoint, viewport, worldToScreen } from '@baustatik/viewport-2d';

const vp = viewport(screenPoint(100, 100), 2.0);
const wp = worldPoint(10, 20);
const sp = worldToScreen(wp, vp); // { x: 120, y: 140 }
```

### screenToWorld()
**Signature:** `function screenToWorld(p: ScreenPoint, vp: Viewport): WorldPoint`
**Description:** Converts a `ScreenPoint` to a `WorldPoint` using the provided `Viewport`.
**Example:**
```typescript
import { screenPoint, viewport, screenToWorld } from '@baustatik/viewport-2d';

const vp = viewport(screenPoint(100, 100), 2.0);
const sp = screenPoint(120, 140);
const wp = screenToWorld(sp, vp); // { u: 10, v: 20 }
```

### worldPointsToFlatArray()
**Signature:** `function worldPointsToFlatArray(points: readonly WorldPoint[]): number[]`
**Description:** Flattens an array of `WorldPoint` objects into a flat array of numbers `[u1, v1, u2, v2, ...]`. Useful for rendering libraries like Konva/Canvas.
**Example:**
```typescript
import { worldPoint, worldPointsToFlatArray } from '@baustatik/viewport-2d';

const points = [worldPoint(1, 2), worldPoint(3, 4)];
const flat = worldPointsToFlatArray(points); // [1, 2, 3, 4]
```

### pan()
**Signature:** `function pan(vp: Viewport, dx: number, dy: number): Viewport`
**Description:** Shifts the viewport's origin by the given pixel offsets `dx` and `dy`.
**Example:**
```typescript
import { screenPoint, viewport, pan } from '@baustatik/viewport-2d';

const vp = viewport(screenPoint(100, 100), 2.0);
const panned = pan(vp, 10, -20); // origin becomes { x: 110, y: 80 }
```

### zoomAround()
**Signature:** `function zoomAround(vp: Viewport, pivot: ScreenPoint, factor: number): Viewport`
**Description:** Zooms the viewport around a fixed `pivot` screen point. The world coordinates under `pivot` remain invariant after zooming.
**Example:**
```typescript
import { screenPoint, viewport, zoomAround } from '@baustatik/viewport-2d';

const vp = viewport(screenPoint(0, 0), 1.0);
const zoomed = zoomAround(vp, screenPoint(100, 100), 2.0);
```

### InvalidWorldPointError
**Signature:** `class InvalidWorldPointError extends BaustatikError`
**Description:** Thrown when a `WorldPoint` contains `NaN` or `±Infinity`.

### InvalidScreenPointError
**Signature:** `class InvalidScreenPointError extends BaustatikError`
**Description:** Thrown when a `ScreenPoint` contains `NaN` or `±Infinity`.

### InvalidViewportError
**Signature:** `class InvalidViewportError extends BaustatikError`
**Description:** Thrown when a `Viewport` has a `scale` that is `NaN`, `±Infinity`, or `≤ 0`.
