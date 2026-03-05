# @baustatik/section-geometry

2D geometry primitives and operations tailored for section analysis in structural engineering. Part of the `@baustatik` monorepo library.

This package provides a YZ-coordinate system wrapper around `@baustatik/geometry-2d`. It is designed specifically for cross-section calculations where the coordinate system convention is typically **y** positive to the right and **z** positive downwards.

## Installation

```bash
npm install @baustatik/section-geometry
# or
pnpm add @baustatik/section-geometry
```

## Coordinate System & Conventions

Unlike standard mathematical 2D systems (XY), this package uses the following conventions:

- **Axes**: `y` points to the right, `z` points downwards.
- **Angles**: 
  - `0` radians points along the **+y** axis (right).
  - Positive angles are **counter-clockwise (CCW)** in the YZ plane.
- **Winding**:
  - Polygons are normalized to **Counter-Clockwise (CCW)** orientation in the YZ plane.
  - `signedArea > 0` indicates a Clockwise orientation.

## Primitives

The package provides the following 2D primitives, all with `readonly` properties:

- **`Point`**: `{ y: number, z: number }`
- **`Vector`**: `{ dy: number, dz: number }`
- **`Line`**: `{ p1: Point, p2: Point }`
- **`Arc`**: `{ center: Point, radius: number, startAngle: number, endAngle: number }`
- **`Polyline`**: `{ points: Point[] }` (open path)
- **`Polygon`**: `{ points: Point[] }` (closed path, normalized to YZ-CCW)

All geometry shapes implement a common `Transformable<T>` interface:
- `translate(shape, vector)`
- `rotate(shape, angle, origin?)`
- `mirror(shape, axisP1, axisP2)`

## Usage

### Points and Vectors
```typescript
import { Point, Vector } from '@baustatik/section-geometry';

const p1 = Point.make(0, 0);
const p2 = Point.make(100, 50); // y=100, z=50 (right and down)

// Distance between points
const dist = Point.distance(p1, p2);

// Translate a point
const v = Vector.make(10, 0);
const moved = Point.translate(p1, v); // { y: 10, z: 0 }
```

### Utilities
```typescript
import { normalizeAngleYZ } from '@baustatik/section-geometry';

// Normalizes any angle to [0, 2π) range
const normalized = normalizeAngleYZ(5 * Math.PI); // Math.PI
```

### Lines and Arcs
```typescript
import { Line, Arc, Point } from '@baustatik/section-geometry';

const line = Line.make(Point.make(0, 0), Point.make(100, 0));
const length = Line.length(line); // 100

// Create an arc from center, radius, and angles (in radians)
const arc = Arc.fromCenter(Point.make(0, 0), 50, 0, Math.PI / 2);
```

### Polygons
```typescript
import { Polygon, Point } from '@baustatik/section-geometry';

const poly = Polygon.make([
  Point.make(0, 0),
  Point.make(100, 0),
  Point.make(100, 100),
  Point.make(0, 100)
]);

// Automatically normalized to YZ-Counter-Clockwise orientation
const area = Polygon.area(poly); // 10000
const isCw = Polygon.isClockwise(poly); // false
```

## Error Handling

This package follows a strict error handling policy. Precondition violations (e.g., creating an arc with collinear points or a polygon with fewer than 3 points) will throw custom error classes extending `BaustatikError`:

- `CollinearPointsError`
- `DegenerateVectorError`
- `DegenerateAxisError`
- `InvalidPolygonError`
- `InvalidArcError`
- `OpenPolylineError`
- `InvalidPolylineError`
- `DiscontinuousLinesError`
