# @baustatik/section-geometry Usage
Location: `packages/section-geometry`

## Overview
A 2D geometry library for cross-section calculations in the YZ plane (ISO 80000-2).
It follows standard European structural engineering conventions:
- **Y-axis**: Horizontal (width)
- **Z-axis**: Vertical (depth, positive downwards)
- **Angles**: Counter-clockwise (CCW) from the positive Y-axis.
- **Winding**: Polygons are normalized to CCW. In the YZ plane, `signedArea < 0` is CCW.

## API Reference

### Point
**Signature:** `const Point: Transformable<PointType> & { make, distance, equals, ... }`
**Description:** Essential point operations in the YZ plane.
**Example:**
```typescript
import { Point, Vector } from '@baustatik/section-geometry';

const p1 = Point.make(0, 0);
const p2 = Point.make(3, 4);

// Geometry
const dist = Point.distance(p1, p2); // 5
const isEqual = Point.equals(p1, Point.make(0, 0)); // true

// Transforms
const p3 = Point.translate(p1, Vector.make(1, 0)); // { y: 1, z: 0 }
const p4 = Point.rotate(Point.make(1, 0), Math.PI / 2); // { y: 0, z: -1 } (CCW 90 deg)
```

### Vector
**Signature:** `const Vector: { make, fromPoints, length, normalize, add, subtract, scale, negate, dot, cross, angle, rotate, perpendicular }`
**Description:** Vector arithmetic and orientation in the YZ plane.
**Example:**
```typescript
import { Vector, Point } from '@baustatik/section-geometry';

const v1 = Vector.make(1, 0);
const v2 = Vector.make(0, -1); // Upward

const cross = Vector.cross(v1, v2); // -1
const angle = Vector.angle(v1); // 0
const angle2 = Vector.angle(v2); // PI / 2 (CCW)

const v3 = Vector.add(v1, v2); // { dy: 1, dz: -1 }
const v4 = Vector.normalize(Vector.make(3, 4)); // { dy: 0.6, dz: 0.8 }
```

### Line
**Signature:** `const Line: Transformable<LineType> & { make, length, midpoint, direction, normalVector, extend, parallel, split, closestPoint, distanceToPoint, intersect, intersectSegment, isParallel, isPerpendicular, angle, ... }`
**Description:** Represents a finite line segment between two points.
**Example:**
```typescript
import { Line, Point } from '@baustatik/section-geometry';

const l1 = Line.make(Point.make(0, 0), Point.make(3, 0));

const len = Line.length(l1); // 3
const mid = Line.midpoint(l1); // { y: 1.5, z: 0 }
const normal = Line.normalVector(l1); // { dy: 0, dz: -1 }

const l2 = Line.parallel(l1, 2); // Line at z = -2
const intersection = Line.intersect(
  Line.make(Point.make(0, 0), Point.make(2, 2)),
  Line.make(Point.make(0, 2), Point.make(2, 0))
); // { y: 1, z: 1 }
```

### Arc
**Signature:** `const Arc: Transformable<ArcType> & { fromCenter, fromPoints, length, midpoint, startPoint, endPoint, normalAt, normalAtPoint, offset, toPolyline, intersectLine, intersectLineFull, intersectArc, intersectArcFull, ... }`
**Description:** Represents a circular arc segment.
**Example:**
```typescript
import { Arc, Point } from '@baustatik/section-geometry';

// Arc from center, radius, startAngle, endAngle (CCW)
const arc = Arc.fromCenter(Point.make(0, 0), 5, 0, Math.PI);

const len = Arc.length(arc); // 5 * PI
const start = Arc.startPoint(arc); // { y: 5, z: 0 }
const end = Arc.endPoint(arc); // { y: -5, z: 0 }

const poly = Arc.toPolyline(arc, { segments: 8 });
```

### Polyline
**Signature:** `const Polyline: Transformable<PolylineType> & { make, fromLines, length, isClosed, toPolygon, pointAt, closestPoint, split, ... }`
**Description:** A sequence of connected line segments.
**Example:**
```typescript
import { Polyline, Point } from '@baustatik/section-geometry';

const pl = Polyline.make([
  Point.make(0, 0),
  Point.make(3, 0),
  Point.make(3, 4)
]);

const totalLen = Polyline.length(pl); // 7
const isClosed = Polyline.isClosed(pl); // false

// Conversion
const closedPl = Polyline.make([
  Point.make(0, 0),
  Point.make(1, 0),
  Point.make(1, 1),
  Point.make(0, 0)
]);
const polygon = Polyline.toPolygon(closedPl);
```

### Polygon
**Signature:** `const Polygon: Transformable<PolygonType> & { make, fromLines, area, signedArea, centroid, perimeter, contains, isClockwise, toClockwise, toCounterClockwise, intersect, union, subtract, boundingBox, ... }`
**Description:** A closed shape normalized to counter-clockwise winding.
**Example:**
```typescript
import { Polygon, Point } from '@baustatik/section-geometry';

const poly = Polygon.make([
  Point.make(0, 0),
  Point.make(4, 0),
  Point.make(4, 3),
  Point.make(0, 3)
]);

const a = Polygon.area(poly); // 12
const c = Polygon.centroid(poly); // { y: 2, z: 1.5 }
const isInside = Polygon.contains(poly, Point.make(2, 1.5)); // true

// Boolean operations
const poly2 = Polygon.translate(poly, Vector.make(2, 0));
const intersection = Polygon.intersect(poly, poly2);
```

### normalizeAngleYZ
**Signature:** `export const normalizeAngleYZ = (angle: number): number`
**Description:** Normalizes an angle into the range `[0, 2π)`.
**Example:**
```typescript
import { normalizeAngleYZ } from '@baustatik/section-geometry';
const angle = normalizeAngleYZ(-Math.PI / 2); // 3 * PI / 2
```

## Error Classes
The package exports several specific error classes for geometric failure cases:
- `CollinearPointsError`: Thrown when three points for an Arc are collinear.
- `DegenerateAxisError`: Thrown when a mirror axis has zero length.
- `DegenerateVectorError`: Thrown when attempting to normalize a zero-length vector.
- `DiscontinuousLinesError`: Thrown when creating a Polyline or Polygon from non-connected lines.
- `InvalidArcError`: Thrown for arcs with zero radius or other invalid parameters.
- `InvalidPolygonError`: Thrown for polygons with fewer than 3 vertices or other topology issues.
- `InvalidPolylineError`: Thrown for invalid polylines (e.g. empty).
- `OpenPolylineError`: Thrown when attempting to convert an open Polyline to a Polygon.
