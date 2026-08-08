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
- **Rotation sense**: a positive rotation takes **+y onto +z**. Drawn on screen
  with `z` downwards this is _clockwise_. This is the same sense
  `@baustatik/fem-geometry` uses for the beam plane (`+x → +z`), and it is the
  sense in which a rotation about the member axis `+x` acts on the section in a
  right-handed `(x, y, z)` system.
- **Angles**:
  - `0` radians points along the **+y** axis (right).
  - `Vector.angle` is `atan2(dz, dy)`, normalised to `[0, 2π)`. So `+z` (down)
    is `π/2` and `−z` (up) is `3π/2`.
  - `Arc.sweep` follows the same sense: positive sweeps from `+y` towards `+z`.
- **Winding**:
  - `signedArea > 0` means the ring runs in the positive rotation sense above —
    _clockwise as drawn_.
  - `Polygon.make` normalises rings to `signedArea >= 0`, i.e. to that same
    positive sense. So `Polygon.signedArea` of a constructed polygon is directly
    its area, and area moments derived later come out signed correctly without a
    correction factor.
  - `Polygon.isClockwise` reports the on-screen reading and is therefore `true`
    for a normalised polygon. `toClockwise` / `toCounterClockwise` force a
    specific winding and deliberately bypass the normalisation.

> **Note on the mapping.** Internally this package delegates to
> `@baustatik/geometry-2d` via `src/convert.ts`, which maps `x := y`, `y := z`
> **without a sign change**. That looks wrong at first — geometry-2d's `y` is
> conventionally "up" — but geometry-2d never renders, so it encodes only a
> rotation sense, not a direction of "up". Mirroring (`y = −z`, the package's
> earlier design) would conjugate every rotation into its inverse
> (`M·P·M = P⁻¹`) and silently invert `angle`, `rotate`, `perpendicular`,
> `normalVector`, `parallel` and `Arc.sweep`, while leaving `dot`, `distance`,
> `cross` and `signedArea` correct — an inconsistency the package used to carry.
> The full rationale is in the header of `src/convert.ts`; the sense is pinned
> by `tests/direction.test.ts`.

## Primitives

The package provides the following 2D primitives, all with `readonly` properties:

- **`Point`**: `{ y: number, z: number }`
- **`Vector`**: `{ dy: number, dz: number }`
- **`Line`**: `{ p1: Point, p2: Point }`
- **`Arc`**: `{ center: Point, radius: number, startAngle: number, sweep: number }`
- **`Polyline`**: `{ points: Point[] }` (open path)
- **`Polygon`**: `{ points: Point[] }` (closed path, normalized to `signedArea >= 0`)

Alongside them, **`Bulge`** converts between the DXF bulge `tan(Δ/4)` — the
storage form used by `Wall.bulge` and `Vertex.bulge` — and an `Arc`. Signs carry
through 1:1: a positive `bulge` turns `+y` onto `+z`, like `Arc.sweep`.

All geometry shapes implement a common `Transformable<T>` interface:

- `translate(shape, vector)`
- `rotate(shape, angle, origin?)`
- `mirror(shape, axisP1, axisP2)`

## Usage

For detailed API documentation, see [docs/usage.md](docs/usage.md).

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

// Create an arc from center, radius, start angle, and end angle (in radians)
const arc1 = Arc.fromCenter(Point.make(0, 0), 50, 0, Math.PI / 2);

// Create an arc from center, radius, start angle, and sweep angle (in radians)
// Positive sweep runs +y -> +z (clockwise as drawn); negative runs the other way.
const arcDown = Arc.make(Point.make(0, 0), 50, 0, Math.PI / 2); // ends at (0, 50)
const arcUp = Arc.make(Point.make(0, 0), 50, 0, -Math.PI / 2); // ends at (0, -50)
```

### Polygons

```typescript
import { Polygon, Point } from '@baustatik/section-geometry';

const poly = Polygon.make([
  Point.make(0, 0),
  Point.make(100, 0),
  Point.make(100, 100),
  Point.make(0, 100),
]);

// Automatically normalized to signedArea >= 0 (the positive +y -> +z sense)
const area = Polygon.area(poly); // 10000
const signed = Polygon.signedArea(poly.points); // 10000, same value
const isCw = Polygon.isClockwise(poly); // true (clockwise as drawn)
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
