# @baustatik/section-geometry

Geometric primitives and operations for 2D structural section analysis.

## Coordinate System

Internally, the package uses a consistent coordinate system:
- **Y**: Positive to the right
- **Z**: Positive downwards

Transformations to other systems (e.g., screen coordinates or math systems) are handled exclusively in adapters.

## Core Primitives

- **Point**: `{ y: number, z: number }`
- **Line**: `{ p1: Point, p2: Point }`
- **Arc**: `{ center: Point, radius: number, startAngle: number, endAngle: number }`
- **Segment**: Union type `Line | Arc`
- **Contour**: `{ segments: Segment[] }`

## Usage

```typescript
import { Point, Line, Contour } from '@baustatik/section-geometry';

const p1 = Point.make(0, 0);
const p2 = Point.make(100, 0);
const line = Line.make(p1, p2);

const contour = Contour.make([line]);
console.log(Contour.length(contour)); // 100
```

## Adapters

### Konva
Transforms contours into SVG path strings for Konva visualization.
Maps `Z` to `-Z` for "Z-up" screen display.

### Martinez
Transforms segments into polygons for clipping operations.
Approximates arcs with polylines.
