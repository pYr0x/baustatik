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

### Bulge
**Signature:** the DXF bulge `tan(Δ/4)` and its conversions to and from `Arc`.
**Description:** `bulge` is a redundancy-free but unreadable way to store an arc between two points that are already stored. `Bulge` is the pair that translates it. Sign follows `Arc.sweep`: positive turns the first axis onto the second.

The load-bearing identity is the sagitta, which is **exact** and not an approximation:

```text
h = (chord / 2) · |bulge|
```

That makes "how curved is this edge" answerable without trigonometry, and it makes "when is an arc a straight line" collapse onto the discretisation tolerance instead of needing a second number. A fixed epsilon on `bulge` would be length-blind — the same value is harmless on a 5 mm chord and visible on a 2 m one.

```typescript
import { Bulge, DEFAULT_ARC_TOLERANCE, Point } from '@baustatik/geometry-2d';

Bulge.sweep(1);                      // Math.PI — Δ = 4·atan(bulge)
Bulge.sagitta(100, 1);               // 50 — exact
Bulge.isStraight(100, 0.0001, 0.05); // true — h = 0.005 mm

const p1 = Point.make(0, 0);
const p2 = Point.make(100, 0);

// Throws StraightBulgeError when isStraight — the straight line is a KNOWN
// answer, not "I don't know", so it is not the `undefined` channel.
const arc = Bulge.toArc(p1, p2, 1, DEFAULT_ARC_TOLERANCE);
Bulge.fromArc(arc);                  // 1 — throws FullCircleBulgeError at |sweep| >= 2π

// TOTAL: a straight edge yields exactly [p1, p2]. Both endpoints included.
Bulge.toPolyline(p1, p2, 0, DEFAULT_ARC_TOLERANCE);   // { points: [p1, p2] }
Bulge.toPolyline(p1, p2, 0.6, DEFAULT_ARC_TOLERANCE); // discretised arc
```

The tolerance does **two** jobs on purpose: it decides whether the edge is curved at all *and* how finely the arc is split. That is one model assumption, not two. Chaining edges? Drop the last point per edge — one `.slice(0, -1)` in one place. A half-open "polyline" would not be one, and the name would lie.

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
**Description:** A closed shape. The winding is **kept as given** — `Polygon.make` validates (at least 3 points) but does not rotate, so a clockwise ring stays clockwise and can express a hole (ADR 0034). `mirror` reverses the winding; the boolean operations still return CCW rings, because that promise sits at the martinez boundary. Supports boolean operations (union, subtract, intersect) and property calculations (area, centroid, moments).
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

// Boolean operation (returns array of CCW Polygons)
const clipped = Polygon.subtract(rect, someOtherPoly);

// Raw area moments about the ORIGIN, signed — the input for a Green summation
// over several rings. All six numbers add up linearly, and a hole ring
// (clockwise) contributes with a negative sign on its own.
const m = Polygon.moments(rect.points);
// { A: 12, Sx: 24, Sy: 18, Ixx: 36, Iyy: 64, Ixy: 36 }
```

### Polygon.inflate
**Signature:** `inflate(paths: readonly InflatePath[], options?: InflateOptions): Polygon[]`
**Description:** Inflates **open or closed runs** by a per-run `delta` and returns a **ring set with holes** — outer `signedArea > 0`, holes `< 0`, sorted by `|A|` descending with every hole directly behind its outer ring (ADR 0037). Backed by `clipper2-ts`, the second clipping library in this package; martinez keeps `union`/`intersect`/`subtract`. It inflates **and** unions, because Clipper2 takes one `delta` per offset call while a profile has several wall thicknesses. Nesting is read from Clipper2's `PolyTreeD`; the winding is then *set*, never passed through. Total: an empty input returns an empty ring set, nothing is validated.
**Example:**
```typescript
// A closed run gives the inner ring in the same call — this is what carries
// the hollow box section.
const rings = Polygon.inflate([
  { polyline: boxCentreline, delta: 3, endType: 'joined' },
]);
// [outer (A > 0), hole (A < 0)]
```

**`InflatePath`**: `{ polyline: Polyline; delta: number; endType: 'butt' | 'joined' }` — `delta` is the inflation per side (`t/2` for a wall), `butt` ends a run flat, `joined` closes it.
**`InflateOptions`**: `{ arcTolerance?: number; miterLimit?: number }` — `joinType` is deliberately absent: it is nailed to `Miter`, because `Round` would round off every corner of an I-profile.

### PolygonMoments
**Signature:** `type PolygonMoments = { A, Sx, Sy, Ixx, Iyy, Ixy }`
**Description:** `A = ∫dA`, `Sx = ∫x dA`, `Sy = ∫y dA`, `Ixx = ∫y² dA`, `Iyy = ∫x² dA`, `Ixy = ∫xy dA` — raw about the origin, signed, and scale-free: millimetres in, mm²/mm³/mm⁴ out. Deliberately *not* centroid-relative, so that a sum over several rings needs one Steiner shift at the end instead of one per ring.

### Types
**`BoundingBox`**: `{ min: Point; max: Point }`
**`Transformable<T>`**: Interface for types that support `translate`, `rotate`, and `mirror`.

### Error Handling
The package throws specific error classes for invalid operations:
- **`CollinearPointsError`**: Three points on a straight line for an arc.
- **`DegenerateAxisError`**: Mirror axis points are identical.
- **`DegenerateVectorError`**: Attempting to normalize a zero vector.
- **`DiscontinuousLinesError`**: Lines for polyline/polygon are not connected.
- **`FullCircleBulgeError`**: `|sweep| >= 2π` — `tan(Δ/4)` has its pole there, and IEEE-754 returns a silently wrong finite `1.633e16` rather than `Infinity`. Carries `sweep`.
- **`InvalidArcError`**: Invalid radius or sweep angle.
- **`StraightBulgeError`**: `Bulge.toArc` asked for an arc where the sagitta stays within the tolerance. Carries `bulge`, `chordLength` and `tolerance` — `bulge` alone does not explain the throw.
- **`InvalidPolygonError` / `InvalidPolylineError`**: Insufficient points or degenerate geometry.
- **`OpenPolylineError`**: Converting an open polyline to a polygon.

## Critical Rules
- **Immutability**: All geometry types are readonly. Use the static methods to create modified copies.
- **Orientation**: `Polygon` keeps the winding it is given (`signedArea > 0` is CCW); only the boolean operations promise CCW output. `Arc` uses signed `sweep` where positive is CCW.
- **Precision**: Most equality checks use a default tolerance of `1e-10`.
