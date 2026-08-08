# @baustatik/section-geometry Usage

Location: `packages/section-geometry`

## Overview

A 2D geometry library for cross-section calculations in the YZ plane (ISO 80000-2). It follows standard European structural engineering conventions:

- **Y-axis**: Horizontal (width)
- **Z-axis**: Vertical (depth, positive downwards)
- **Rotation sense**: A positive rotation takes **+y onto +z** — clockwise as drawn, since `z` points down. Same sense as `@baustatik/fem-geometry` (`+x → +z`). Angles are measured from the positive Y-axis, `Vector.angle` is `atan2(dz, dy)` normalized to `[0, 2π)`.
- **Winding**: `signedArea > 0` means the ring runs in that positive sense (clockwise as drawn). `Polygon.make` normalizes to `signedArea >= 0`, so a constructed polygon's `signedArea` is directly its area. `isClockwise` reports the on-screen reading and is therefore `true` for a normalized polygon.
- **Mapping**: `src/convert.ts` maps `x := y`, `y := z` with **no sign change**. Mirroring would conjugate every rotation into its inverse and silently invert `angle`/`rotate`/`perpendicular`/`normalVector`/`Arc.sweep`. See the header of `src/convert.ts`; pinned by `tests/direction.test.ts`.

## Types Reference

The package defines and exports the following core geometric types:

### PointType

**Definition:**

```typescript
export type PointType = {
  readonly y: number;
  readonly z: number;
};
```

### VectorType

**Definition:**

```typescript
export type VectorType = {
  readonly dy: number;
  readonly dz: number;
};
```

### LineType

**Definition:**

```typescript
export type LineType = {
  readonly p1: PointType;
  readonly p2: PointType;
};
```

### ArcType

**Definition:**

```typescript
export type ArcType = {
  readonly center: PointType;
  readonly radius: number;
  readonly startAngle: number;
  /** Signed sweep angle in radians. Positive sweeps +y towards +z. */
  readonly sweep: number;
};
```

### PolylineType

**Definition:**

```typescript
export type PolylineType = {
  readonly points: PointType[];
};
```

### PolygonType

**Definition:**

```typescript
export type PolygonType = {
  readonly points: PointType[];
};
```

### BoundingBox

**Definition:**

```typescript
export type BoundingBox = {
  readonly min: PointType;
  readonly max: PointType;
};
```

### Transformable

**Definition:**

```typescript
export interface Transformable<T> {
  translate(shape: T, vector: VectorType): T;
  rotate(shape: T, angle: number, origin?: PointType): T;
  mirror(shape: T, axisP1: PointType, axisP2: PointType): T;
}
```

---

## API Reference

### Point

**Signature:**

```typescript
const Point: Transformable<PointType> & {
  make(y: number, z: number): PointType;
  distance(a: PointType, b: PointType): number;
  equals(a: PointType, b: PointType, tolerance?: number): boolean;
};
```

**Description:** Essential 2D point operations in the YZ plane.
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
const p4 = Point.rotate(Point.make(1, 0), Math.PI / 2); // { y: 0, z: 1 } (+90 deg takes +y to +z)
const p5 = Point.mirror(Point.make(1, 2), Point.make(0, 0), Point.make(1, 0)); // { y: 1, z: -2 }
```

### Vector

**Signature:**

```typescript
const Vector: {
  make(dy: number, dz: number): VectorType;
  fromPoints(a: PointType, b: PointType): VectorType;
  length(vector: VectorType): number;
  normalize(vector: VectorType): VectorType;
  add(a: VectorType, b: VectorType): VectorType;
  subtract(a: VectorType, b: VectorType): VectorType;
  scale(vector: VectorType, factor: number): VectorType;
  negate(vector: VectorType): VectorType;
  dot(a: VectorType, b: VectorType): number;
  cross(a: VectorType, b: VectorType): number;
  angle(vector: VectorType): number;
  rotate(vector: VectorType, angle: number): VectorType;
  perpendicular(vector: VectorType): VectorType;
};
```

**Description:** Vector arithmetic and orientation in the YZ plane.
**Example:**

```typescript
import { Vector } from '@baustatik/section-geometry';

const v1 = Vector.make(1, 0);
const v2 = Vector.make(0, -1); // Upward (against +z)

const cross = Vector.cross(v1, Vector.make(0, 1)); // 1 (+y then +z is the positive sense)
const angle = Vector.angle(v1); // 0
const angle2 = Vector.angle(v2); // 3 * PI / 2 (upward is -z)

const v3 = Vector.add(v1, v2); // { dy: 1, dz: -1 }
const v4 = Vector.normalize(Vector.make(3, 4)); // { dy: 0.6, dz: 0.8 }
```

### Line

**Signature:**

```typescript
const Line: Transformable<LineType> & {
  make(p1: PointType, p2: PointType): LineType;
  length(line: LineType): number;
  midpoint(line: LineType): PointType;
  direction(line: LineType): VectorType;
  normalVector(line: LineType): VectorType;
  extend(line: Line, startDelta: number, endDelta: number): LineType;
  parallel(line: LineType, distance: number): LineType;
  split(line: LineType, point: PointType): [LineType, LineType];
  closestPoint(line: LineType, point: PointType): PointType;
  distanceToPoint(line: LineType, point: PointType): number;
  intersect(a: LineType, b: LineType): PointType | null;
  intersectSegment(a: LineType, b: LineType): PointType | null;
  isParallel(a: LineType, b: LineType, tolerance?: number): boolean;
  isPerpendicular(a: LineType, b: LineType, tolerance?: number): boolean;
  angle(a: LineType, b: LineType): number;
};
```

**Description:** Represents a finite line segment between two points.
**Example:**

```typescript
import { Line, Point } from '@baustatik/section-geometry';

const l1 = Line.make(Point.make(0, 0), Point.make(3, 0));

const len = Line.length(l1); // 3
const mid = Line.midpoint(l1); // { y: 1.5, z: 0 }
const normal = Line.normalVector(l1); // { dy: 0, dz: 1 } (+90 deg from direction, points down)

const l2 = Line.parallel(l1, 2); // Line offset by 2 along normal (z = 2)
const intersection = Line.intersect(
  Line.make(Point.make(0, 0), Point.make(2, 2)),
  Line.make(Point.make(0, 2), Point.make(2, 0)),
); // { y: 1, z: 1 }
```

### Arc

**Signature:**

```typescript
const Arc: Transformable<ArcType> & {
  make(
    center: PointType,
    radius: number,
    startAngle: number,
    sweep: number,
  ): ArcType;
  fromCenter(
    center: PointType,
    radius: number,
    startAngle: number,
    endAngle: number,
  ): ArcType;
  fromPoints(p1: PointType, p2: PointType, p3: PointType): ArcType;
  swap(arc: ArcType): ArcType;
  length(arc: ArcType): number;
  midpoint(arc: ArcType): PointType;
  startPoint(arc: ArcType): PointType;
  endPoint(arc: ArcType): PointType;
  normalAt(arc: ArcType, angle: number): VectorType;
  normalAtPoint(arc: ArcType, point: PointType): VectorType;
  offset(arc: ArcType, distance: number): ArcType;
  toPolyline(
    arc: ArcType,
    options?: { segments: number } | { tolerance: number },
  ): PolylineType;
  intersectLine(arc: ArcType, line: LineType): PointType[];
  intersectLineFull(arc: ArcType, line: LineType): PointType[];
  intersectArc(a: ArcType, b: ArcType): PointType[];
  intersectArcFull(a: ArcType, b: ArcType): PointType[];
};
```

**Description:** Represents a circular arc segment.
**Example:**

```typescript
import { Arc, Point } from '@baustatik/section-geometry';

// Create an arc using a sweep angle (e.g., PI for a semi-circle)
const arc = Arc.make(Point.make(0, 0), 5, 0, Math.PI);

// Create an arc from center with start and end angles
const arc2 = Arc.fromCenter(Point.make(0, 0), 5, 0, Math.PI);

// Create an arc passing through three points
const arc3 = Arc.fromPoints(
  Point.make(1, 0),
  Point.make(0, -1),
  Point.make(-1, 0),
);

const len = Arc.length(arc); // 5 * PI
const start = Arc.startPoint(arc); // { y: 5, z: 0 }
const end = Arc.endPoint(arc); // { y: -5, z: 0 }

// Swap arc direction (negates sweep, swaps start/end)
const reversed = Arc.swap(arc);

// Discretize to a Polyline
const poly = Arc.toPolyline(arc, { segments: 8 });
```

### Polyline

**Signature:**

```typescript
const Polyline: Transformable<PolylineType> & {
  make(points: PointType[]): PolylineType;
  fromLines(lines: LineType[]): PolylineType;
  length(polyline: PolylineType): number;
  isClosed(polyline: PolylineType, tolerance?: number): boolean;
  toPolygon(polyline: PolylineType): PolygonType;
  pointAt(polyline: PolylineType, t: number): PointType;
  closestPoint(polyline: PolylineType, point: PointType): PointType;
  split(polyline: PolylineType, point: PointType): [PolylineType, PolylineType];
};
```

**Description:** A sequence of connected line segments.
**Example:**

```typescript
import { Polyline, Point } from '@baustatik/section-geometry';

const pl = Polyline.make([
  Point.make(0, 0),
  Point.make(3, 0),
  Point.make(3, 4),
]);

const totalLen = Polyline.length(pl); // 7
const isClosed = Polyline.isClosed(pl); // false

// Conversion to Polygon (requires polyline to be closed)
const closedPl = Polyline.make([
  Point.make(0, 0),
  Point.make(1, 0),
  Point.make(1, 1),
  Point.make(0, 0),
]);
const polygon = Polyline.toPolygon(closedPl);
```

### Polygon

**Signature:**

```typescript
const Polygon: Transformable<PolygonType> & {
  make(points: PointType[]): PolygonType;
  fromLines(lines: LineType[]): PolygonType;
  area(polygon: PolygonType): number;
  signedArea(points: PointType[]): number;
  centroid(polygon: PolygonType): PointType;
  perimeter(polygon: PolygonType): number;
  contains(polygon: PolygonType, point: PointType): boolean;
  isClockwise(polygon: PolygonType): boolean;
  toClockwise(polygon: PolygonType): PolygonType;
  toCounterClockwise(polygon: PolygonType): PolygonType;
  intersect(a: PolygonType, b: PolygonType): PolygonType[];
  union(a: PolygonType, b: PolygonType): PolygonType[];
  subtract(a: PolygonType, b: PolygonType): PolygonType[];
  boundingBox(polygon: PolygonType): BoundingBox;
};
```

**Description:** A closed shape normalized to `signedArea >= 0`, i.e. running in the positive `+y → +z` sense (clockwise as drawn, since `z` points down).
**Example:**

```typescript
import { Polygon, Point } from '@baustatik/section-geometry';

const poly = Polygon.make([
  Point.make(0, 0),
  Point.make(4, 0),
  Point.make(4, 3),
  Point.make(0, 3),
]);

const a = Polygon.area(poly); // 12
const c = Polygon.centroid(poly); // { y: 2, z: 1.5 }
const isInside = Polygon.contains(poly, Point.make(2, 1.5)); // true

// Boolean operations
const poly2 = Polygon.translate(poly, Vector.make(2, 0));
const intersection = Polygon.intersect(poly, poly2);
```

### Bulge

**Signature:**

```typescript
const Bulge: {
  sweep(bulge: number): number;
  sagitta(chordLength: number, bulge: number): number;
  isStraight(chordLength: number, bulge: number, tolerance: number): boolean;
  toArc(p1: Point, p2: Point, bulge: number, tolerance: number): Arc;
  fromArc(arc: Arc): number;
  toPolyline(p1: Point, p2: Point, bulge: number, tolerance: number): Polyline;
};
```

**Description:** The DXF bulge `tan(Δ/4)` and its conversions to and from `Arc`,
in `y`/`z`. `bulge` is what `Wall.bulge` and `Vertex.bulge` store; `Arc` is what
drawing, snapping and integration need.

**Signs carry through 1:1** — the mapping to `geometry-2d` is
orientation-preserving, so a positive `bulge` turns `+y` onto `+z`, the same
sense as `Arc.sweep`. In the picture (`y` right, `z` down) that is clockwise.

**The sagitta is exact**, not approximated: `h = (chord / 2) · |bulge|`. So
"when is an arc a straight line" collapses onto `DEFAULT_ARC_TOLERANCE` rather
than needing a second number, and a fixed epsilon on `bulge` — which would be
length-blind — is not required.

**Asking for an arc where there is none throws.** `toArc` raises
`StraightBulgeError`, `fromArc` raises `FullCircleBulgeError`. The straight line
is a *known* answer, not "I don't know", so it is not the `undefined` channel.
Callers that want it handled take `toPolyline` (total) or ask `isStraight`.

**Example:**

```typescript
import { Bulge, DEFAULT_ARC_TOLERANCE, Point } from '@baustatik/section-geometry';

const p1 = Point.make(0, 0);
const p2 = Point.make(100, 0);

Bulge.sweep(1);                            // Math.PI
Bulge.sagitta(100, 1);                     // 50
Bulge.isStraight(100, 0.0001, 0.05);       // true

const arc = Bulge.toArc(p1, p2, 1, DEFAULT_ARC_TOLERANCE); // semicircle
Bulge.fromArc(arc);                        // 1

// TOTAL: a straight edge yields exactly [p1, p2]; both endpoints included.
Bulge.toPolyline(p1, p2, 0, DEFAULT_ARC_TOLERANCE);
```

Three of the six convert nothing — `sweep`, `sagitta` and `isStraight` are
coordinate-free. They are wrapped anyway, for the same reason
`normalizeAngleYZ` is: **this package is the pass-through into the
cross-section plane, and nothing above it imports `@baustatik/geometry-2d`
directly.**

A domain consequence worth knowing: the value range is the open interval
`(−2π, +2π)`, so **a tube is two nodes and two semicircular walls**
(`Δ = ±180°`, `bulge = ±1`), never one wall closing on itself. At a semicircle
end-tangency is automatic, so the cross-section gate's kink warning stays silent
by itself.

### normalizeAngleYZ

**Signature:**

```typescript
function normalizeAngleYZ(angle: number): number;
```

**Description:** Normalizes an angle in radians into the range `[0, 2π)`.
Converts nothing — the mapping is orientation-preserving, so this is the same
normalisation as in `x`/`y`. The wrapper exists for the pass-through rule above.
**Example:**

```typescript
import { normalizeAngleYZ } from '@baustatik/section-geometry';

const angle = normalizeAngleYZ(-Math.PI / 2); // 3 * Math.PI / 2
```

---

## Error Classes

The package exports several specific error classes for geometric failure cases:

- `CollinearPointsError`: Thrown when three points for an Arc are collinear.
- `DegenerateAxisError`: Thrown when a mirror axis has zero length.
- `DegenerateVectorError`: Thrown when attempting to normalize a zero-length vector.
- `DiscontinuousLinesError`: Thrown when creating a Polyline or Polygon from non-connected lines.
- `FullCircleBulgeError`: Thrown by `Bulge.fromArc` at `|sweep| >= 2π`, where `tan(Δ/4)` has its pole. Carries `sweep`.
- `InvalidArcError`: Thrown for arcs with zero radius or other invalid parameters.
- `StraightBulgeError`: Thrown by `Bulge.toArc` when the sagitta stays within the tolerance. Carries `bulge`, `chordLength` and `tolerance`.
- `InvalidPolygonError`: Thrown for polygons with fewer than 3 vertices or other topology issues.
- `InvalidPolylineError`: Thrown for invalid polylines (e.g. empty).
- `OpenPolylineError`: Thrown when attempting to convert an open Polyline to a Polygon.
