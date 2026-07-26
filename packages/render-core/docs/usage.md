# @baustatik/render-core Usage

Location: `packages/render-core`

## Overview

A core library defining data structures, validation rules, error types, and driver interfaces for 2D engineering graphics rendering.

## API Reference

### Spec

**Signature:**

```typescript
type ShapeSpec =
  | LineSpec
  | CircleSpec
  | PolygonSpec
  | RectangleSpec
  | TriangleSpec
  | ArrowSpec;

type PrimitiveSpec = ShapeSpec | LabelSpec;

type Spec = PrimitiveSpec | GroupSpec;
```

**Description:** A union type representing all renderable graphic specifications in the 2D workspace. Each spec has a unique `id` for reconciliation and rendering.

`ShapeSpec` is the subset that maps to a single drawn shape. `GroupSpec.children`
accepts only those: a `LabelSpec` is a composed box-plus-text in the renderer, so
allowing it as a child would produce the nested group that adapters do not
support.

---

### LineSpec

**Signature:**

```typescript
interface LineSpec {
  readonly id: string;
  readonly kind: 'line';
  readonly from: WorldPoint;
  readonly to: WorldPoint;
  readonly strokeColor?: string;
  readonly strokeWidth?: number;
  readonly strokeStyle?: 'solid' | 'dashed' | 'dotted';
}
```

**Description:** Defines a line segment from a starting point (`from`) to an ending point (`to`) in world coordinates.
**Example:**

```typescript
import type { LineSpec } from '@baustatik/render-core';

const line: LineSpec = {
  id: 'line-1',
  kind: 'line',
  from: { u: 0, v: 0 },
  to: { u: 10, v: 5 },
  strokeWidth: 2,
  strokeColor: '#333333',
  strokeStyle: 'solid',
};
```

---

### CircleSpec

**Signature:**

```typescript
interface CircleSpec {
  readonly id: string;
  readonly kind: 'circle';
  readonly center: WorldPoint;
  readonly radius: number;
  readonly strokeColor?: string;
  readonly strokeWidth?: number;
  readonly strokeStyle?: 'solid' | 'dashed' | 'dotted';
  readonly fillColor?: string;
}
```

**Description:** Defines a circle centered at a world point with a given radius.
**Example:**

```typescript
import type { CircleSpec } from '@baustatik/render-core';

const circle: CircleSpec = {
  id: 'circle-1',
  kind: 'circle',
  center: { u: 5, v: 5 },
  radius: 3,
  fillColor: 'rgba(0, 0, 255, 0.5)',
};
```

---

### PolygonSpec

**Signature:**

```typescript
interface PolygonSpec {
  readonly id: string;
  readonly kind: 'polygon';
  readonly points: readonly WorldPoint[];
  readonly closed: boolean;
  readonly strokeColor?: string;
  readonly strokeWidth?: number;
  readonly strokeStyle?: 'solid' | 'dashed' | 'dotted';
  readonly fillColor?: string;
}
```

**Description:** Defines a polygon determined by a list of world points. Can be open or closed.
**Example:**

```typescript
import type { PolygonSpec } from '@baustatik/render-core';

const polygon: PolygonSpec = {
  id: 'poly-1',
  kind: 'polygon',
  points: [
    { u: 0, v: 0 },
    { u: 5, v: 0 },
    { u: 2.5, v: 4.33 },
  ],
  closed: true,
  strokeWidth: 1,
  strokeColor: 'black',
};
```

---

### ArrowSpec

**Signature:**

```typescript
interface ArrowSpec {
  readonly id: string;
  readonly kind: 'arrow';
  readonly tail: WorldPoint;
  readonly tip: WorldPoint;
  readonly pointerLength: number;
  readonly pointerWidth: number;
  readonly strokeColor?: string;
  readonly strokeWidth?: number;
  readonly strokeStyle?: 'solid' | 'dashed' | 'dotted';
  readonly fillColor?: string;
}
```

**Description:** A directed segment with a head at `tip`. The order `tail → tip`
_is_ the direction of action, which is why the points are not called `from`/`to`
like on a line — swapping them silently reverses the arrow. `pointerLength` and
`pointerWidth` are world quantities and scale with zoom (like `CircleSpec.radius`),
while `strokeWidth` stays in screen pixels as everywhere else.

**Example:**

```typescript
import type { ArrowSpec } from '@baustatik/render-core';

const arrow: ArrowSpec = {
  id: 'load-1:arrow',
  kind: 'arrow',
  tail: { u: 0, v: -3 },
  tip: { u: 0, v: 0 },
  pointerLength: 0.6,
  pointerWidth: 0.5,
  strokeColor: '#1d4ed8',
  strokeWidth: 2,
  fillColor: '#1d4ed8',
};
```

---

### LabelSpec

**Signature:**

```typescript
interface LabelSpec {
  readonly id: string;
  readonly kind: 'label';
  readonly text: string;
  readonly anchor: WorldPoint;
  readonly direction: WorldPoint; // read as a u/v direction, not a point
  readonly gap: number;
  readonly fontSize: number;
  readonly fontFamily: string;
  readonly textColor: string;
  readonly padding: number;
  readonly backgroundColor: string;
  readonly borderColor?: string;
  readonly borderWidth?: number;
  readonly cornerRadius?: number;
}
```

**Description:** A horizontal caption inside a box — the first spec carrying text,
and the first whose **final geometry is known only to the adapter**. How wide
`text` renders at a given `fontSize`/`fontFamily` can only be answered by
something that can measure text; a producer without a canvas cannot. The spec
therefore describes the placement as an _anchor plus direction_ rather than a box
position:

> The adapter puts the box edge at distance `gap` on the ray starting at `anchor`
> in direction `direction`, and centres the box on that ray. Concretely, with the
> normalised direction `d`, half sizes `hw`/`hh` and
> `t = min(hw / |d.u|, hh / |d.v|)` over the non-zero components only, the box
> centre sits at `anchor + d * (gap + t)`. For axis-parallel directions `t` is
> exactly the half width or half height.

The box itself stays axis-aligned; `direction` picks a side, it does not rotate
anything. `fontFamily` is mandatory rather than falling back to the renderer's
default, so appearance and screenshot baselines do not depend on the font list of
the machine.

**Example:**

```typescript
import type { LabelSpec } from '@baustatik/render-core';

const label: LabelSpec = {
  id: 'load-1:label',
  kind: 'label',
  text: '10 kN',
  anchor: { u: 0, v: -3 },
  direction: { u: 0, v: -1 },
  gap: 0.3,
  fontSize: 0.6,
  fontFamily: 'sans-serif',
  textColor: '#1d4ed8',
  padding: 0.15,
  backgroundColor: '#dbeafe',
  borderColor: '#1d4ed8',
  borderWidth: 1,
  cornerRadius: 0.15,
};
```

---

### ViewIntent

**Signature:**

```typescript
type ViewIntent =
  | { readonly type: 'pan'; readonly dx: number; readonly dy: number }
  | {
      readonly type: 'zoom';
      readonly factor: number;
      readonly pointer: ScreenPoint;
    }
  | { readonly type: 'reset' }
  | { readonly type: 'fit' };
```

**Description:** Represents a camera adjustment request initiated by the user interface/adapter. The rendering driver passes this intent to the parent viewer, which manages the source-of-truth viewport.

---

### RenderDriver

**Signature:**

```typescript
interface RenderDriver {
  applyViewport(vp: Viewport): void;
  reconcile(specs: readonly Spec[]): void;
  flush(): void;
  onViewIntent(handler: (intent: ViewIntent) => void): void;
  destroy(): void;
}
```

**Description:** The abstract interface that platform-specific adapters (e.g., Konva, Canvas) must implement to handle viewport transformations, render spec updates, and user interactions.

---

### validateSpec()

**Signature:** `function validateSpec(spec: Spec): void`
**Description:** Validates a single graphic specification. Throws `InvalidSpecError` or `InvalidWorldPointError` if invalid.
**Example:**

```typescript
import { validateSpec } from '@baustatik/render-core';

try {
  validateSpec({
    id: 'c1',
    kind: 'circle',
    center: { u: 0, v: 0 },
    radius: -5, // Invalid radius
  });
} catch (error) {
  // Handles InvalidSpecError
}
```

---

### validateSpecs()

**Signature:** `function validateSpecs(specs: readonly Spec[]): void`
**Description:** Validates an array of specifications, additionally ensuring that all IDs are unique. Throws `DuplicateSpecIdError` if any ID is duplicated.
**Example:**

```typescript
import { validateSpecs } from '@baustatik/render-core';

const specs = [
  {
    id: '1',
    kind: 'line' as const,
    from: { u: 0, v: 0 },
    to: { u: 10, v: 10 },
  },
  { id: '2', kind: 'circle' as const, center: { u: 5, v: 5 }, radius: 2 },
];

// Validates successfully
validateSpecs(specs);
```

---

### assertNever()

**Signature:** `function assertNever(x: never): never`
**Description:** Exhaustiveness utility function for TypeScript to ensure at compile-time and run-time that all cases of a union (like `Spec` or `ViewIntent`) are covered.
**Example:**

```typescript
import { assertNever } from '@baustatik/render-core';
import type { Spec } from '@baustatik/render-core';

function draw(spec: Spec) {
  switch (spec.kind) {
    case 'line':
      // draw line
      break;
    case 'circle':
      // draw circle
      break;
    case 'polygon':
      // draw polygon
      break;
    case 'triangle':
      // draw triangle
      break;
    case 'arrow':
      // draw arrow
      break;
    case 'label':
      // draw label
      break;
    default:
      assertNever(spec);
  }
}
```

---

### InvalidSpecError

**Signature:** `class InvalidSpecError extends BaustatikError`
**Description:** Thrown when a specification's properties (e.g., radius, stroke width, points array length) are semantically invalid.

---

### DuplicateSpecIdError

**Signature:** `class DuplicateSpecIdError extends BaustatikError`
**Description:** Thrown by `validateSpecs()` when two or more specifications share the same `id`.

---

### UnreachableCaseError

**Signature:** `class UnreachableCaseError extends BaustatikError`
**Description:** Thrown by `assertNever()` at runtime when an unexpected case is encountered.
