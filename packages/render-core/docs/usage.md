# @baustatik/render-core Usage
Location: `packages/render-core`

## Overview
Generic 2D render/transform core with a neutral world coordinate system.

World coordinates use `u` to the right and `v` downward (matching Canvas/SVG screen orientation).
Screen coordinates use `x` to the right and `y` downward.

## API

```ts
export type WorldPoint = { readonly u: number; readonly v: number };
export type ScreenPoint = { readonly x: number; readonly y: number };

export type Viewport = {
  readonly origin: ScreenPoint;
  readonly scale: number;
};

export function worldPoint(u: number, v: number): WorldPoint;
export function screenPoint(x: number, y: number): ScreenPoint;
export function viewport(origin: ScreenPoint, scale: number): Viewport;

export function worldToScreen(p: WorldPoint, vp: Viewport): ScreenPoint;
export function screenToWorld(p: ScreenPoint, vp: Viewport): WorldPoint;

export function worldPointsToFlatArray(points: readonly WorldPoint[]): number[];
```

## Errors

| Error class | Thrown when |
| --- | --- |
| `InvalidWorldPointError` | `u` or `v` is `NaN` or `±Infinity` |
| `InvalidScreenPointError` | `x` or `y` is `NaN` or `±Infinity` |
| `InvalidViewportError` | `scale` is `NaN`, `±Infinity`, or `≤ 0` |

All error classes extend `BaustatikError` from `@baustatik/errors`.

## Notes
- This package has no Konva dependency.
- This package has no section-specific domain logic.

