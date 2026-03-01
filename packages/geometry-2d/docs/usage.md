# @baustatik/geometry-2d Usage
Location: `packages/geometry-2d`

## Overview
A robust 2D geometry library providing functional, immutable operations for fundamental shapes (`Point`, `Vector`, `Line`, `Arc`, `Polyline`, `Polygon`) suited for engineering and CAD applications.

## API Reference

### Point
**Signature:** `const Point: Transformable<Point> & { make, distance, equals, ... }`
**Description:** Represents a standard 2D point `{ x, y }` and provides fundamental operations like distance, equivalence, and affine transformations. Use `Point.make(x, y)` to instantiate.
**Example:**
```typescript
import { Point } from '@baustatik/geometry-2d';

const p1 = Point.make(0, 0);
const p2 = Point.make(3, 4);
const dist = Point.distance(p1, p2); // 5
const moved = Point.translate(p1, { dx: 1, dy: 2 }); // { x: 1, y: 2 }
```

### Vector
**Signature:** `const Vector: { make, fromPoints, length, normalize, add, cross, ... }`
**Description:** Defines a 2D vector `{ dx, dy }` for directional and magnitude operations, including cross and dot products.
**Example:**
```typescript
import { Vector, Point } from '@baustatik/geometry-2d';

const v1 = Vector.make(1, 0);
const v2 = Vector.make(0, 1);
const dot = Vector.dot(v1, v2); // 0 (orthogonal)
const v3 = Vector.add(v1, v2); // { dx: 1, dy: 1 }
```

### Line
**Signature:** `const Line: Transformable<Line> & { make, length, midpoint, intersect, split, ... }`
**Description:** A line segment between two distinct points (`p1` and `p2`), providing intersection logic, geometric evaluations, midpoint and offset computation.
**Example:**
```typescript
import { Line, Point } from '@baustatik/geometry-2d';

const lineA = Line.make(Point.make(0, 0), Point.make(2, 2));
const lineB = Line.make(Point.make(0, 2), Point.make(2, 0));
const intersection = Line.intersect(lineA, lineB); // { x: 1, y: 1 }
const isPerpendicular = Line.isPerpendicular(lineA, lineB); // true
```

### Arc
**Signature:** `const Arc: Transformable<Arc> & { fromCenter, fromPoints, length, toPolyline, intersectLine, ... }`
**Description:** Represents a circular arc defined by a center, radius, start angle, and end angle. You can easily discretize it into a Polyline using `toPolyline`.
**Example:**
```typescript
import { Arc, Point } from '@baustatik/geometry-2d';

// A quarter-circle arc centered at origin, radius 5
const arc = Arc.fromCenter(Point.make(0, 0), 5, 0, Math.PI / 2);
const length = Arc.length(arc); // 5 * PI / 2
const polyline = Arc.toPolyline(arc, { segments: 10 });
```

### Polyline
**Signature:** `const Polyline: Transformable<Polyline> & { make, fromLines, length, isClosed, toPolygon, split, ... }`
**Description:** A sequence of connected line segments defined by a list of points. Can be closed and converted into a `Polygon`.
**Example:**
```typescript
import { Polyline, Point } from '@baustatik/geometry-2d';

const points = [Point.make(0, 0), Point.make(10, 0), Point.make(10, 5)];
const pl = Polyline.make(points);
const len = Polyline.length(pl); // 15
```

### Polygon
**Signature:** `const Polygon: Transformable<Polygon> & { make, fromLines, area, centroid, contains, union, subtract, ... }`
**Description:** A closed shape defined by an array of points. It computes physical properties like area and centroid, and seamlessly integrates with `martinez-polygon-clipping` to support boolean operations (union, intersect, subtract).
**Example:**
```typescript
import { Polygon, Point } from '@baustatik/geometry-2d';

const rect = Polygon.make([
  Point.make(0, 0), Point.make(10, 0), 
  Point.make(10, 5), Point.make(0, 5)
]);
const area = Polygon.area(rect); // 50
const isInside = Polygon.contains(rect, Point.make(5, 2)); // true
```

### Error Types
**Signature:** `class InvalidPolygonError extends BaustatikError`, etc.
**Description:** Specific named errors thrown when preconditions are violated, such as `DegenerateVectorError`, `CollinearPointsError`, `DiscontinuousLinesError`, etc.
**Example:**
```typescript
import { Arc, Point, CollinearPointsError } from '@baustatik/geometry-2d';

try {
  // Try to create arc from 3 collinear points
  Arc.fromPoints(Point.make(0,0), Point.make(1,1), Point.make(2,2));
} catch (e) {
  if (e instanceof CollinearPointsError) {
    console.error('Cannot create an arc from collinear points.');
  }
}
```
