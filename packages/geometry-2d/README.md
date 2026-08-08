# @baustatik/geometry-2d

Coordinate-system agnostic 2D geometry primitives and operations. Part of the `@baustatik` monorepo library.

This package provides a robust foundation for 2D geometry calculations using standard mathematical conventions (x positive to the right, y positive upwards). 

## Design Philosophy

- **Namespace Pattern**: Each geometric primitive (e.g., `Point`, `Line`, `Arc`) is defined as a plain object `type` and an accompanying `const` object (Namespace) containing static utility functions. This maximizes performance, ensures easy serialization, and avoids the complexities of class-based inheritance.
- **Immutability**: All geometry objects are `readonly`. Static methods return new instances rather than modifying inputs.
- **Functional API**: Methods are designed to be composable and predictable.

## Installation

```bash
npm install @baustatik/geometry-2d
# or
pnpm add @baustatik/geometry-2d
```

## Primitives

The package provides the following 2D primitives as immutable plain objects:

- **`Point`**: `{ x, y }`
- **`Vector`**: `{ dx, dy }`
- **`Line`**: `{ p1, p2 }`
- **`Arc`**: `{ center, radius, startAngle, sweep }`
- **`Polyline`**: `{ points: Point[] }` (open path)
- **`Polygon`**: `{ points: Point[] }` (closed path, always CCW)

Alongside them, **`Bulge`** is not a primitive but a codec: it converts between
the DXF bulge `tan(Δ/4)` — the redundancy-free way to *store* an arc between two
points you already have — and an `Arc`, which is what drawing and integration
need. The sagitta is exact, `h = (chord / 2) · |bulge|`, so "is this edge
straight" reduces to `DEFAULT_ARC_TOLERANCE` rather than a second constant.

### Transformations
All geometry shapes (except `Vector`) implement a common `Transformable<T>` interface:
- `translate(shape, vector)`
- `rotate(shape, angle, origin?)`
- `mirror(shape, axisP1, axisP2)`

## Usage Examples

For a complete API reference, see [docs/usage.md](docs/usage.md).

### Arcs in Depth
Arcs are defined by a `center`, `radius`, `startAngle`, and a signed `sweep`. Positive sweep is Counter-Clockwise (CCW), negative is Clockwise (CW).

```typescript
import { Arc, Point } from '@baustatik/geometry-2d';

// Primary creation: Center, Radius, Start angle, Sweep angle
const arc = Arc.make(Point.make(0, 0), 5, 0, Math.PI / 2);

// Create CCW arc between two angles (utility)
const fromAngles = Arc.fromCenter(Point.make(0, 0), 5, 0, Math.PI / 2);

// Reverse direction (swaps start/end and negates sweep)
const reversed = Arc.swap(arc); 

// Create arc from 3 points
const arc3p = Arc.fromPoints(Point.make(5,0), Point.make(0,5), Point.make(-5,0));

const start = Arc.startPoint(arc); // { x: 5, y: 0 }
const end = Arc.endPoint(arc);     // { x: 0, y: 5 }
```

### Lines and Intersections
```typescript
import { Line, Point, Arc } from '@baustatik/geometry-2d';

const l1 = Line.make(Point.make(0, 0), Point.make(10, 0));
const l2 = Line.make(Point.make(5, -5), Point.make(5, 5));

const p = Line.intersect(l1, l2); // { x: 5, y: 0 }

// Arc-Line intersection
const arc = Arc.make(Point.make(0, 0), 5, 0, Math.PI); // Semicircle
const points = Arc.intersectLine(arc, l2); // [(0, 5)]
```

### Polygons and Clipping
Polygons are automatically normalized to **CCW orientation** to ensure consistent area and boolean calculations.

```typescript
import { Polygon, Point } from '@baustatik/geometry-2d';

const poly = Polygon.make([...]);

// Boolean operations via martinez-polygon-clipping
const intersection = Polygon.intersect(polyA, polyB); // Returns Polygon[]
const merged = Polygon.union(polyA, polyB);
const difference = Polygon.subtract(polyA, polyB);
```

## Error Handling

Precondition violations throw specific errors extending `BaustatikError`:

- **`CollinearPointsError`**: 3 points on a line provided for an arc.
- **`DegenerateAxisError`**: Mirror axis points are identical.
- **`DegenerateVectorError`**: Normalizing a zero vector.
- **`DiscontinuousLinesError`**: Unconnected lines for path creation.
- **`InvalidArcError` / `InvalidPolygonError` / `InvalidPolylineError`**: Scale or point count issues.
- **`OpenPolylineError`**: Closing an open path incorrectly.

## License

This package is part of the `@baustatik` project. All rights reserved.
