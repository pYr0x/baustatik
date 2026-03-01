# @baustatik/geometry-2d

Coordinate-system agnostic 2D geometry primitives and operations. Part of the `@baustatik` monorepo library.

This package provides a robust foundation for 2D geometry calculations using standard mathematical conventions (x positive to the right, y positive upwards). It implements the Namespace Pattern with plain objects for maximum performance and immutability.

## Installation

```bash
npm install @baustatik/geometry-2d
# or
pnpm add @baustatik/geometry-2d
```

## Primitives

The package provides the following 2D primitives:

- **`Point`**: `{ x: number, y: number }`
- **`Vector`**: `{ dx: number, dy: number }`
- **`Line`**: `{ p1: Point, p2: Point }`
- **`Arc`**: `{ center: Point, radius: number, startAngle: number, endAngle: number }`
- **`Polyline`**: `{ points: Point[] }` (open path)
- **`Polygon`**: `{ points: Point[] }` (closed path, always counter-clockwise)

All geometry shapes (except `Vector`) implement a common `Transformable<T>` interface, providing standard methods for spatial manipulation:
- `translate(shape, vector)`
- `rotate(shape, angle, origin?)`
- `mirror(shape, axisP1, axisP2)`

## Usage

Geometries are created and manipulated using their respective namespace functions:

### Points and Vectors
```typescript
import { Point, Vector } from '@baustatik/geometry-2d';

const p1 = Point.make(0, 0);
const p2 = Point.make(3, 4);

// Distance between points
const dist = Point.distance(p1, p2); // 5

// Translate a point
const v = Vector.make(1, 0);
const moved = Point.translate(p1, v); // { x: 1, y: 0 }
```

### Lines
```typescript
import { Line } from '@baustatik/geometry-2d';

const line = Line.make(Point.make(0, 0), Point.make(10, 0));

const midpoint = Line.midpoint(line); // { x: 5, y: 0 }
const length = Line.length(line);     // 10

// Intersection
const otherLine = Line.make(Point.make(5, -5), Point.make(5, 5));
const intersection = Line.intersect(line, otherLine); // { x: 5, y: 0 }
```

### Polygons
```typescript
import { Polygon } from '@baustatik/geometry-2d';

const p = Polygon.make([
  Point.make(0, 0),
  Point.make(10, 0),
  Point.make(10, 10),
  Point.make(0, 10)
]);

// Automatically normalized to counter-clockwise orientation
const area = Polygon.area(p);       // 100
const center = Polygon.centroid(p); // { x: 5, y: 5 }
```

### Polygon Clipping
The library supports boolean operations (union, intersection, subtraction) on polygons via `martinez-polygon-clipping`:

```typescript
// Returns an array of resulting Polygons
const intersection = Polygon.intersect(polyA, polyB);
const merged = Polygon.union(polyA, polyB);
const difference = Polygon.subtract(polyA, polyB);
```

## Error Handling

This package uses a strict error handling policy. Developer mistakes or invalid geometry configurations (e.g., collinear points for an arc, open polylines converted to polygons, or degenerate mirroring axes) will throw custom errors extending `BaustatikError` from `@baustatik/errors`. 
