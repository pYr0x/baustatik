# @baustatik/section-geometry Usage

Location: `packages/section-geometry`

## Overview
Geometric primitives and operations for 2D structural section analysis. Provides a consistent coordinate system (Y right, Z down) and adapters for common visualization and clipping libraries.

## API Reference

### Point
**Signature:** `const Point = { ... }`
**Description:** Namespace for point operations.
**Example:**
```typescript
import { Point } from '@baustatik/section-geometry';
const p = Point.make(10, 20);
const dist = Point.distance(p, Point.make(0, 0));
```

### Line
**Signature:** `const Line = { ... }`
**Description:** Namespace for line operations.
**Example:**
```typescript
import { Line, Point } from '@baustatik/section-geometry';
const l = Line.make(Point.make(0,0), Point.make(10,0));
const len = Line.length(l);
```

### Arc
**Signature:** `const Arc = { ... }`
**Description:** Namespace for circular arc operations.
**Example:**
```typescript
import { Arc, Point } from '@baustatik/section-geometry';
const a = Arc.fromPoints(Point.make(10,0), Point.make(0,10), Point.make(-10,0));
```

### Contour
**Signature:** `const Contour = { ... }`
**Description:** Namespace for contour (path) operations.
**Example:**
```typescript
import { Contour, Line, Point } from '@baustatik/section-geometry';
const c = Contour.make([Line.make(p1, p2), Line.make(p2, p3)]);
const isClosed = Contour.isClosed(c);
```

## Adapters

### Konva
**Signature:** `function contourToKonvaPath(contour: Contour): string`
**Description:** Returns an SVG path string for Konva, transforming Z to -Z (Z-up).

### Martinez
**Signature:** `function segmentToPolygon(seg: Segment, t: number): [number, number][][]`
**Description:** Returns a polygon for clipping, given a segment and its thickness `t`.
