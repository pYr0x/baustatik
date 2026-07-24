# @baustatik/geometry-2d Usage
Location: `packages/geometry-2d`

## Overview
Base 2D geometry primitives and operations for structural analysis. Provides immutable types for Points, Vectors, Lines, Arcs, Polylines, and Polygons with a functional API for transformations and geometric calculations.

## API Reference

### Point
**Signature:** `type Point = { readonly x: number; readonly y: number }`
**Description:** Basic 2D coordinate. Includes utilities for distance calculation and transformations.
**Example:**
```typescript
import { Point, Vector } from '@baustatik/geometry-2d';

const p1 = Point.make(0, 0);
const p2 = Point.make(3, 4);

const dist = Point.distance(p1, p2); // 5
const moved = Point.translate(p1, Vector.make(1, 2)); // { x: 1, y: 2 }
const rotated = Point.rotate(p2, Math.PI / 2); // { x: -4, y: 3 }
```

### Vector
**Signature:** `type Vector = { readonly dx: number; readonly dy: number }`
**Description:** 2D displacement or direction. Supports common vector algebra (add, scale, dot, cross, rotate).
**Example:**
```typescript
import { Vector, Point } from '@baustatik/geometry-2d';

const v1 = Vector.make(1, 0);
const v2 = Vector.make(0, 1);

const dot = Vector.dot(v1, v2); // 0
const cross = Vector.cross(v1, v2); // 1
const normalized = Vector.normalize(Vector.make(3, 4)); // { dx: 0.6, dy: 0.8 }
const fromPoints = Vector.fromPoints(Point.make(0,0), Point.make(1,1)); // { dx: 1, dy: 1 }
```

### Line
**Signature:** `type Line = { readonly p1: Point; readonly p2: Point }`
**Description:** A line segment between two points. Provides intersection, projection, and offset logic.
**Example:**
```typescript
import { Line, Point, Vector } from '@baustatik/geometry-2d';

const l1 = Line.make(Point.make(0, 0), Point.make(10, 0));
const l2 = Line.make(Point.make(5, -5), Point.make(5, 5));

const intersection = Line.intersect(l1, l2); // { x: 5, y: 0 }
const length = Line.length(l1); // 10
const parallel = Line.parallel(l1, 2); // Line at y=2

// Local coordinate system: ex along p1 -> p2, ey rotated +90 degrees
const { ex, ey } = Line.frame(l2); // { dx: 0, dy: 1 }, { dx: -1, dy: 0 }
const local = Line.toLocal(l2, Vector.make(1, 0)); // { dx: 0, dy: -1 }
const global = Line.toGlobal(l2, local); // { dx: 1, dy: 0 }
```

### Arc
**Signature:** `type Arc = { readonly center: Point; readonly radius: number; readonly startAngle: number; readonly sweep: number }`
**Description:** Circular arc defined by center, radius, and sweep angle. Positive sweep is CCW, negative is CW.
**Example:**
```typescript
import { Arc, Point } from '@baustatik/geometry-2d';

// Direct creation with center, radius, startAngle, and sweep
const arc = Arc.make(Point.make(0, 0), 5, 0, Math.PI / 2);

// Creation from center and start/end angles (calculates sweep automatically)
const fromAngles = Arc.fromCenter(Point.make(0, 0), 5, 0, Math.PI);

// Creation from three points (start, through-point, end)
const fromPts = Arc.fromPoints(Point.make(1,0), Point.make(0,1), Point.make(-1,0));

const start = Arc.startPoint(arc); // { x: 5, y: 0 }
const end = Arc.endPoint(arc); // { x: 0, y: 5 }
const polyline = Arc.toPolyline(arc, { tolerance: 0.1 }); // Convert to segments
```

### Polyline
**Signature:** `type Polyline = { readonly points: Point[] }`
**Description:** A sequence of connected line segments. Supports length calculation, point-at-t, and splitting.
**Example:**
```typescript
import { Polyline, Point } from '@baustatik/geometry-2d';

const pl = Polyline.make([
  Point.make(0, 0),
  Point.make(5, 0),
  Point.make(5, 5)
]);

const len = Polyline.length(pl); // 10
const midpoint = Polyline.pointAt(pl, 0.5); // { x: 5, y: 2.5 }
const [part1, part2] = Polyline.split(pl, Point.make(5, 2));
```

### Polygon
**Signature:** `type Polygon = { readonly points: Point[] }`
**Description:** A closed shape. Polygons are automatically normalized to Counter-Clockwise (CCW) orientation upon creation. Supports boolean operations (union, subtract, intersect) and property calculations (area, centroid).
**Example:**
```typescript
import { Polygon, Point } from '@baustatik/geometry-2d';

const rect = Polygon.make([
  Point.make(0, 0),
  Point.make(4, 0),
  Point.make(4, 3),
  Point.make(0, 3)
]);

const area = Polygon.area(rect); // 12
const center = Polygon.centroid(rect); // { x: 2, y: 1.5 }
const contains = Polygon.contains(rect, Point.make(2, 1)); // true

// Boolean operation (returns array of Polygons)
const clipped = Polygon.subtract(rect, someOtherPoly);
```

### Types
**`BoundingBox`**: `{ min: Point; max: Point }`
**`Transformable<T>`**: Interface for types that support `translate`, `rotate`, and `mirror`.

### Error Handling
The package throws specific error classes for invalid operations:
- **`CollinearPointsError`**: Three points on a straight line for an arc.
- **`DegenerateAxisError`**: Mirror axis points are identical.
- **`DegenerateVectorError`**: Attempting to normalize a zero vector.
- **`DiscontinuousLinesError`**: Lines for polyline/polygon are not connected.
- **`InvalidArcError`**: Invalid radius or sweep angle.
- **`InvalidPolygonError` / `InvalidPolylineError`**: Insufficient points or degenerate geometry.
- **`OpenPolylineError`**: Converting an open polyline to a polygon.

## Critical Rules
- **Immutability**: All geometry types are readonly. Use the static methods to create modified copies.
- **Orientation**: `Polygon` always enforces CCW order. `Arc` uses signed `sweep` where positive is CCW.
- **Precision**: Most equality checks use a default tolerance of `1e-10`.
