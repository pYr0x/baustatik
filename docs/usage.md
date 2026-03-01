# @baustatik Ecosystem Usage Guide

This document provides a comprehensive overview of how to use the packages in the `@baustatik` ecosystem.

---

# @baustatik/errors Usage
Location: `packages/errors`

## Overview
Base error hierarchy for the Baustatik ecosystem. All library-specific errors should extend the `BaustatikError` class.

## API Reference

### BaustatikError
**Signature:** `class BaustatikError extends Error`
**Description:** The base class for all errors thrown by `@baustatik/*` packages. It automatically sets the `name` property to the constructor name.
**Example:**
```typescript
import { BaustatikError } from '@baustatik/errors';

try {
  // Call some library function
} catch (e) {
  if (e instanceof BaustatikError) {
    console.error(`Library error: ${e.message}`);
  }
}
```

## Extending BaustatikError
When creating a new package, use `BaustatikError` as the base class for your custom errors to ensure they can be caught globally.

**Example:**
```typescript
import { BaustatikError } from '@baustatik/errors';

export class MyCustomError extends BaustatikError {
  constructor(detail: string) {
    super(`My custom error occurred: ${detail}`);
  }
}
```

---

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

---

# @baustatik/round Usage
Location: `packages/round`

## Overview
Atomic and smart numeric rounding for engineering applications with a focus on structural analysis. It provides a fluent API to handle complex rounding logic, magnitude-aware "smart" precision, and unit-driven "atomic" rounding.

## API Reference

### round()
**Signature:** `function round(value: number): RoundChain`
**Description:** Entry point for the fluent rounding API. Returns a chainable object providing various rounding methods.
**Example:**
```typescript
import { round } from '@baustatik/round';

const base = round(1.2345);
base.toDecimals(2);      // 1.23
base.toSignificant(2);   // 1.2
base.toInteger();        // 1
base.smart();            // 1.235 (magnitude based)
```

### RoundChain.toDecimals()
**Signature:** `toDecimals(n: number): number`
**Description:** Rounds the value to a fixed number of decimal places.
**Example:**
```typescript
round(1.255).toDecimals(2); // 1.26
```

### RoundChain.toSignificant()
**Signature:** `toSignificant(n: number): number`
**Description:** Rounds the value to a set number of significant figures.
**Example:**
```typescript
round(0.001333).toSignificant(2); // 0.0013
```

### RoundChain.toInteger()
**Signature:** `toInteger(): number`
**Description:** Rounds the value to the nearest integer.
**Example:**
```typescript
round(1.5).toInteger(); // 2
```

### RoundChain.smart()
**Signature:** `smart(options?: SmartOptions): number`
**Description:** Automatically adjusts decimal places based on the value's magnitude.
**Example:**
```typescript
round(1333.333).smart(); // 1333.33
round(1.33333).smart();  // 1.333
```

### RoundChain.atomic()
**Signature:** `atomic(targetToBase: number, atomicToBase: number): number`
**Description:** Rounds to a specific "atomic" step relative to a base unit (e.g., nearest mm in m).
**Example:**
```typescript
// Rounding 1.2555m to the nearest mm (1/1000m)
round(1.25551).atomic(1, 0.001); // 1.256
```

## Types

### SmartOptions
```typescript
interface SmartOptions {
  sigDigits?: number;    // Number of significant digits to target
  minDecimals?: number;  // Minimum number of decimals to keep
}
```

---

# @baustatik/units Usage
Location: `packages/units`

## Overview
Unit conversion and parsing library for structural engineering. Supports Length, Area, Volume, Force, Mass, and derived units like Linear and Surface loads.

## API Reference

### convert()
**Signature:** `function convert(value: number): ConvertChain`
**Description:** Entry point for the unit conversion API. Throws `InvalidValueError` if the value is not a finite number.
**Example:**
```typescript
import { convert } from '@baustatik/units';

const result = convert(10).from('m').to('cm'); // 1000
```

### ConvertChain.from()
**Signature:** `from(unit: string): FromChain`
**Description:** Sets the source unit. The unit string is resolved against supported aliases (e.g., 'm', 'meter', 'm²').
**Example:**
```typescript
convert(1).from('kN');
```

### FromChain.to()
**Signature:** `to(unit: string): number`
**Description:** Converts the value to the target unit and applies category-specific rounding.
**Example:**
```typescript
convert(2.5).from('MN/m²').to('N/mm²'); // 2.5
```

## Supported Units

The library supports ASCII (`^2`) and Unicode (`²`) superscripts. For example, `m^2` and `m²` are equivalent.

### Categorized Units

You can only convert between units within the same category (except for Mass and Force, see below).

| Category | Units | Rounding Logic |
| :--- | :--- | :--- |
| **Length** | `mm`, `cm`, `dm`, `m`, `km` | **Atomic**: Increments relative to `mm`. |
| **Area** | `mm²`, `cm²`, `dm²`, `m²`, `km²` | **Atomic**: Increments relative to `mm²`. |
| **Volume** | `mm³`, `cm³`, `m³`, `ml`, `l` | **Atomic**: Increments relative to `mm³`. |
| **Moment of Inertia** | `mm⁴`, `cm⁴`, `dm⁴`, `m⁴` | **Atomic**: Increments relative to `mm⁴`. |
| **Mass** | `g`, `kg`, `t` | **Atomic**: Increments relative to `g`. |
| **Force** | `N`, `kN`, `MN` | **Atomic**: Increments relative to `N`. |
| **Force per Length** | `N/m`, `N/cm`, `N/mm`, `kN/m`, `kN/cm`, `kN/mm`, `MN/m`, `MN/cm`, `MN/mm` | **Smart**: Professional rounding to significant digits. |
| **Force per Area** | `N/m²`, `N/cm²`, `N/mm²`, `kN/m²`, `kN/cm²`, `kN/mm²`, `MN/m²`, `MN/cm²`, `MN/mm²` | **Smart**: Professional rounding to significant digits. |

## Special Conversions

### Mass and Force (Gravity)
The library automatically handles conversions between Mass (`kg`, `t`) and Force (`N`, `kN`, `MN`) using standard gravity ($g = 9.81 m/s^2$).

**Example:**
```typescript
convert(100).from('kg').to('kN'); // 0.981
convert(1).from('kN').to('kg');   // 101.937
```

## Error Handling

All errors in this package extend `BaustatikError` from `@baustatik/errors`.

### BaustatikError
Base class for all library errors. Catch this if you want to handle any error produced by the conversion logic.

### IncompatibleUnitsError
Thrown when attempting to convert between different physical categories (e.g., Length to Mass) that are not covered by special gravity logic.
```typescript
try {
  convert(10).from('m').to('kg');
} catch (e) {
  // Handle incompatibility
}
```

### UnknownUnitError
Thrown when a unit alias cannot be resolved.

### InvalidValueError
Thrown if the input to `convert()` is not a finite number (`NaN` or `Infinity`).
