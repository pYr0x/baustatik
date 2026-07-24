# @baustatik/fem-geometry Usage

Location: `packages/fem-geometry`

## Overview

Provides 2D geometry primitives (`Point`, `Vector`, `Line`) in the structural coordinate system (`x` to the right, `z` downwards). Includes local beam coordinate transformation utilities (`Line.frame`, `Line.toLocal`, `Line.toGlobal`) for converting global forces/displacements to beam-local axes.

## API Reference

### Point

**Signature:** `type Point = { readonly x: number; readonly z: number }`
**Description:** Structural 2D coordinate in the x/z plane (where positive z points downwards). Provided alongside a namespace object with factory, distance, equality, and transformation functions (`translate`, `rotate`, `mirror`).

**Functions:**
- `make(x: number, z: number): Point` - Creates a new `Point`.
- `distance(a: Point, b: Point): number` - Calculates Euclidean distance between two points.
- `equals(a: Point, b: Point, tolerance?: number): boolean` - Checks point equality within tolerance (default `1e-10`).
- `translate(point: Point, vector: Vector): Point` - Translates a point by a vector.
- `rotate(point: Point, angle: number, origin?: Point): Point` - Rotates point around origin (default `(0,0)`). Positive angle turns +x towards +z.
- `mirror(point: Point, axisP1: Point, axisP2: Point): Point` - Mirrors point across line defined by `axisP1` and `axisP2`.

**Example:**
```typescript
import { Point, Vector } from '@baustatik/fem-geometry';

const p1 = Point.make(0, 0);
const p2 = Point.make(3, 4);

const dist = Point.distance(p1, p2); // 5
const moved = Point.translate(p1, Vector.make(1, 2)); // { x: 1, z: 2 }
const rotated = Point.rotate(Point.make(1, 0), Math.PI / 2); // { x: 0, z: 1 }
const equals = Point.equals(p1, Point.make(0, 0)); // true
```

### Vector

**Signature:** `type Vector = { readonly dx: number; readonly dz: number }`
**Description:** 2D displacement or direction vector in structural x/z coordinates. Supports vector arithmetic, dot/cross products, normalization, rotation, and perpendicular vectors.

**Functions:**
- `make(dx: number, dz: number): Vector` - Creates a new `Vector`.
- `fromPoints(a: Point, b: Point): Vector` - Vector pointing from point `a` to point `b`.
- `length(vector: Vector): number` - Magnitude of vector.
- `normalize(vector: Vector): Vector` - Returns unit vector in same direction.
- `add(a: Vector, b: Vector): Vector` - Vector addition.
- `subtract(a: Vector, b: Vector): Vector` - Vector subtraction.
- `scale(vector: Vector, factor: number): Vector` - Scalar multiplication.
- `negate(vector: Vector): Vector` - Negates vector components.
- `dot(a: Vector, b: Vector): number` - Dot product `a.dx * b.dx + a.dz * b.dz`.
- `cross(a: Vector, b: Vector): number` - Cross product `a.dx * b.dz - a.dz * b.dx` (positive when +x turns to +z).
- `angle(vector: Vector): number` - Angle in radians in `[0, 2π)` from +x towards +z (`atan2(dz, dx)`).
- `rotate(vector: Vector, angle: number): Vector` - Rotates vector by angle (positive rotates +x towards +z).
- `perpendicular(vector: Vector): Vector` - Perpendicular vector rotated +90° (`{-dz, dx}`).

**Example:**
```typescript
import { Point, Vector } from '@baustatik/fem-geometry';

const v1 = Vector.make(1, 0);
const v2 = Vector.make(0, 1);

const sum = Vector.add(v1, v2); // { dx: 1, dz: 1 }
const dot = Vector.dot(v1, v2); // 0
const cross = Vector.cross(v1, v2); // 1 (cross(+x, +z) = +1 in x/z frame)
const dir = Vector.fromPoints(Point.make(0, 0), Point.make(1, 1)); // { dx: 1, dz: 1 }
const normalized = Vector.normalize(Vector.make(3, 4)); // { dx: 0.6, dz: 0.8 }
const perp = Vector.perpendicular(Vector.make(1, 0)); // { dx: 0, dz: 1 }
```

### Line

**Signature:** `type Line = { readonly p1: Point; readonly p2: Point }`
**Description:** Line segment between start point `p1` and end point `p2`. Provides length, direction, normal vector, intersections, line frame transformations (`frame`, `toLocal`, `toGlobal`), geometry queries, and rigid transformations.

**Functions:**
- `make(p1: Point, p2: Point): Line` - Creates line segment.
- `length(line: Line): number` - Length of line segment.
- `midpoint(line: Line): Point` - Midpoint of line segment.
- `direction(line: Line): Vector` - Normalized unit direction vector from `p1` to `p2`.
- `normalVector(line: Line): Vector` - Unit normal vector (`ez`) perpendicular to `direction` turned towards positive z.
- `frame(line: Line): LineFrame` - Orthonormal local beam coordinate basis `{ ex, ez }`.
- `toLocal(line: Line, vector: Vector): Vector` - Decomposes global vector into beam-local components `(qx, qz)`.
- `toGlobal(line: Line, vector: Vector): Vector` - Reconstructs global vector from beam-local components.
- `extend(line: Line, startDelta: number, endDelta: number): Line` - Extends line segment at both ends.
- `parallel(line: Line, distance: number): Line` - Parallel offset line at given distance along normal vector.
- `split(line: Line, point: Point): [Line, Line]` - Splits line into two segments at specified point.
- `closestPoint(line: Line, point: Point): Point` - Projected closest point on line.
- `distanceToPoint(line: Line, point: Point): number` - Shortest distance to line.
- `intersect(a: Line, b: Line): Point | null` - Intersection of infinite lines.
- `intersectSegment(a: Line, b: Line): Point | null` - Intersection of finite segments.
- `isParallel(a: Line, b: Line, tolerance?: number): boolean` - Tests parallelism.
- `isPerpendicular(a: Line, b: Line, tolerance?: number): boolean` - Tests perpendicularity.
- `angle(a: Line, b: Line): number` - Angle between lines in radians.
- `translate(line: Line, vector: Vector): Line` - Translates line endpoints.
- `rotate(line: Line, angle: number, origin?: Point): Line` - Rotates line about origin.
- `mirror(line: Line, axisP1: Point, axisP2: Point): Line` - Mirrors line across axis.

**Example:**
```typescript
import { Line, Point, Vector } from '@baustatik/fem-geometry';

const beam = Line.make(Point.make(0, 0), Point.make(4, 0)); // Horizontal beam

const len = Line.length(beam); // 4
const dir = Line.direction(beam); // { dx: 1, dz: 0 }

// Local beam frame (ex along beam p1 -> p2, ez rotated towards +z downwards)
const { ex, ez } = Line.frame(beam); // ex: { dx: 1, dz: 0 }, ez: { dx: 0, dz: 1 }

// Decompose a global force vector into beam-local axes (qx, qz)
const globalLoad = Vector.make(0, 10); // Downward load of 10 kN
const localLoad = Line.toLocal(beam, globalLoad); // { dx: 0, dz: 10 }
const globalBack = Line.toGlobal(beam, localLoad); // { dx: 0, dz: 10 }
```

### LineFrame

**Signature:** `type LineFrame = { readonly ex: Vector; readonly ez: Vector }`
**Description:** Orthonormal local beam coordinate basis. `ex` points along the beam from `p1` to `p2`. `ez` is perpendicular to `ex` in the structural x/z sense (turned towards positive z).

**Example:**
```typescript
import { Line, LineFrame, Point } from '@baustatik/fem-geometry';

const inclined = Line.make(Point.make(0, 0), Point.make(1, 1)); // 45° downwards beam
const frame: LineFrame = Line.frame(inclined);
// frame.ex ≈ { dx: 0.7071, dz: 0.7071 }
// frame.ez ≈ { dx: -0.7071, dz: 0.7071 }
```

### normalizeAngleYZ

**Signature:** `function normalizeAngleYZ(angle: number): number`
**Description:** Normalizes an angle in radians into the canonical `[0, 2π)` interval.

**Example:**
```typescript
import { normalizeAngleYZ } from '@baustatik/fem-geometry';

const angle = normalizeAngleYZ(-Math.PI / 2); // 4.71238898038469 (3π/2)
```

## Critical Rules

- **Structural Coordinate System**: Positive `z` points **downwards**.
- **Consistent rotation sense**: A positive rotation takes `+x` to `+z`, so `Vector.angle` is `atan2(dz, dx)` and a beam falling to the lower right has `α = +45°`. `Line.frame().ez`, `Line.normalVector` and `Vector.perpendicular` all agree — `ez` points towards positive `z` (downwards for horizontal beams). Prefer `Line.frame` / `Line.toLocal` for structural load and stress transformations because they state the beam-local intent; the agreement is asserted by a test in `tests/line.test.ts`. Background: the header of `src/convert.ts`.
- **Immutability**: All shapes (`Point`, `Vector`, `Line`) are plain readonly data objects. Use static namespace functions to create modified copies.
