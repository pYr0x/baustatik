# @baustatik/fem-loads Usage

Location: `packages/fem-loads`

## Overview

Domain load input model for 2D plane frame structural analysis (node and beam loads) and its validation gate. Defines typed load models for node loads, point/constant/trapezoidal beam forces and moments, reference length projection factors, model geometry abstractions, and validation functions (`validateLoad`, `validateLoads`, `assertValidLoads`) with specific domain errors — plus the `LoadValidationPolicy` that carries the thresholds those rules check against.

For a scenario-oriented catalogue of node, beam-force, and beam-moment inputs, see [load-examples.md](load-examples.md).

## Load Conventions

- **Sign convention**: Positive `z` points downwards. Downward forces (`fz > 0`) are positive.
- **Rotation sense**: Positive moment (`my > 0` or `m > 0`) rotates counter-clockwise around global `y` (out of the drawing plane, turning `+z` towards `+x`).
- **Load direction & frame**: Forces specify `frame` (`'global'` or `'local'`) and `axis` (`'x'` or `'z'`). Moments act in plane around `y`.
- **Reference length**: Distributed beam forces can be defined on `'trueLength'`, `'horizontalProjection'`, or `'verticalProjection'`.

---

## Load Model Types

### `LoadFrame` & `LoadAxis`

```typescript
type LoadFrame = 'global' | 'local';
type LoadAxis = 'x' | 'z';
```

### `ReferenceLength`

```typescript
type ReferenceLength =
  'trueLength' | 'horizontalProjection' | 'verticalProjection';
```

### `NodeLoad`

**Signature:**

```typescript
type NodeLoad = {
  id: string;
  target: 'node';
  nodeIds: string[];
  fx?: number; // kN, global x
  fz?: number; // kN, global z (positive downwards)
  my?: number; // kNm, rotation around global y (counter-clockwise)
  origin?: LoadOrigin;
  comment?: string;
};
```

**Description:** Component-wise nodal load applied to one or more nodes. At least one force or moment component (`fx`, `fz`, or `my`) must be non-zero.

---

### `BeamForcePointLoad`

**Signature:**

```typescript
type BeamForcePointLoad = {
  id: string;
  target: 'beam';
  beamIds: string[];
  kind: 'force';
  distribution: 'point';
  frame: LoadFrame;
  axis: LoadAxis;
  p: number; // kN
  distanceFromStart: number;
  relativeDistances?: boolean;
  origin?: LoadOrigin;
  comment?: string;
};
```

**Description:** Point force acting on a beam at a specified distance from the start node along the beam axis.

---

### `BeamForceConstantLoad`

**Signature:**

```typescript
type BeamForceConstantLoad = {
  id: string;
  target: 'beam';
  beamIds: string[];
  kind: 'force';
  distribution: 'constant';
  frame: LoadFrame;
  axis: LoadAxis;
  referenceLength: ReferenceLength;
  q: number; // kN/m
  origin?: LoadOrigin;
  comment?: string;
};
```

**Description:** Uniformly distributed line load acting along the entire length of the beam.

---

### `BeamForceTrapezoidalLoad`

**Signature:**

```typescript
type BeamForceTrapezoidalLoad = {
  id: string;
  target: 'beam';
  beamIds: string[];
  kind: 'force';
  distribution: 'trapezoidal';
  frame: LoadFrame;
  axis: LoadAxis;
  referenceLength: ReferenceLength;
  q1: number; // kN/m at start of load extent
  q2: number; // kN/m at end of load extent
  fullLength?: true;
  // OR if fullLength is false/omitted:
  from?: number;
  to?: number;
  relativeDistances?: boolean;
  origin?: LoadOrigin;
  comment?: string;
};
```

**Description:** Linear trapezoidal (or triangular if one end is zero) distributed line load, either over the full length or a subsegment (`from` to `to`).

---

### `BeamMomentPointLoad`

**Signature:**

```typescript
type BeamMomentPointLoad = {
  id: string;
  target: 'beam';
  beamIds: string[];
  kind: 'moment';
  distribution: 'point';
  m: number; // kNm (positive counter-clockwise)
  distanceFromStart: number;
  relativeDistances?: boolean;
  origin?: LoadOrigin;
  comment?: string;
};
```

**Description:** Point moment applied to a beam at a given distance from the start node.

---

### `BeamMomentConstantLoad` & `BeamMomentTrapezoidalLoad`

**Signature:**

```typescript
type BeamMomentConstantLoad = {
  id: string;
  target: 'beam';
  beamIds: string[];
  kind: 'moment';
  distribution: 'constant';
  m: number; // kNm/m
  origin?: LoadOrigin;
  comment?: string;
};

type BeamMomentTrapezoidalLoad = {
  id: string;
  target: 'beam';
  beamIds: string[];
  kind: 'moment';
  distribution: 'trapezoidal';
  m1: number; // kNm/m
  m2: number; // kNm/m
  fullLength?: true;
  from?: number;
  to?: number;
  relativeDistances?: boolean;
  origin?: LoadOrigin;
  comment?: string;
};
```

**Description:** Distributed line moment loads (constant or trapezoidal) applied to a beam.

---

### Union Load Types

```typescript
type BeamForceLoad =
  BeamForcePointLoad | BeamForceConstantLoad | BeamForceTrapezoidalLoad;
type BeamMomentLoad =
  BeamMomentPointLoad | BeamMomentConstantLoad | BeamMomentTrapezoidalLoad;
type BeamLoad = BeamForceLoad | BeamMomentLoad;
type FEMLoad = NodeLoad | BeamLoad;
```

---

## API Reference

### modelGeometry()

**Signature:** `function modelGeometry(nodes: readonly Node[], beams: readonly Beam[]): LoadModelGeometry`
**Description:** Builds an immutable lookup snapshot (`LoadModelGeometry`) for node existence (`hasNode`) and beam axis geometry (`beamAxis`) from structural `@baustatik/fem` model arrays. Must be rebuilt per validation pass to reflect current model state.

**Example:**

```typescript
import { type Beam, type Node } from '@baustatik/fem';
import { modelGeometry } from '@baustatik/fem-loads';

const nodes: Node[] = [
  { id: 'n1', position: { x: 0, z: 0 } },
  { id: 'n2', position: { x: 10, z: 0 } },
];
const beams: Beam[] = [{ id: 'b1', startNodeId: 'n1', endNodeId: 'n2' }];

const geom = modelGeometry(nodes, beams);
console.log(geom.hasNode('n1')); // true
console.log(geom.beamAxis('b1')); // Line { p1: { x: 0, z: 0 }, p2: { x: 10, z: 0 } }
```

---

### validateLoad()

**Signature:** `function validateLoad(model: LoadModelGeometry, load: FEMLoad): LoadValidationResult`
**Description:** Validates a single load against model geometry and load domain constraints, using the default `LoadValidationPolicy`. Returns `{ errors, warnings }` — **two** kinds of finding, because the workflow has three exits: errors stop the computation, warnings do not. `errors.length === 0` means the load is admissible.

**Example:**

```typescript
import {
  modelGeometry,
  validateLoad,
  type BeamForceConstantLoad,
} from '@baustatik/fem-loads';

const geom = modelGeometry(nodes, beams);
const load: BeamForceConstantLoad = {
  id: 'load-q1',
  target: 'beam',
  beamIds: ['b1'],
  kind: 'force',
  distribution: 'constant',
  frame: 'global',
  axis: 'z',
  referenceLength: 'trueLength',
  q: 5,
};

const { errors, warnings } = validateLoad(geom, load);
if (errors.length === 0) {
  console.log('Load is valid');
}
for (const warning of warnings) {
  console.warn(warning.message); // admissible, but looks like a slip
}
```

---

### validateLoads()

**Signature:** `function validateLoads(model: LoadModelGeometry, loads: readonly FEMLoad[]): LoadValidationResult`
**Description:** Validates an array of loads against model geometry, using the default policy. Returns the flat `{ errors, warnings }` across all loads in input order — suitable for form/UI validation where all user input problems should be shown at once.

**Example:**

```typescript
import {
  modelGeometry,
  validateLoads,
  type FEMLoad,
} from '@baustatik/fem-loads';

const geom = modelGeometry(nodes, beams);
const loads: FEMLoad[] = [nodeLoad, beamLoad];

const { errors } = validateLoads(geom, loads);
for (const err of errors) {
  console.error(`Load "${err.loadId}": ${err.message}`);
}
```

---

### assertValidLoads()

**Signature:** `function assertValidLoads(model: LoadModelGeometry, loads: readonly FEMLoad[]): void`
**Description:** Asserts that all loads in the array are valid, using the default policy. Throws the first encountered `LoadValidationError` if any load fails validation. Used in computation pipelines to fail fast. Warnings are ignored — they report admissible input and must not stop anything.

**Example:**

```typescript
import { assertValidLoads, modelGeometry } from '@baustatik/fem-loads';

const geom = modelGeometry(nodes, beams);
assertValidLoads(geom, loads); // Throws LoadValidationError on invalid input
```

---

### createLoadValidator()

**Signature:** `function createLoadValidator(policy?: LoadValidationPolicy): LoadValidator`
**Description:** Binds one complete policy to all three exits (`validateLoad`, `validateLoads`, `assertValidLoads`). Without an argument it is the default validator — exactly the one whose exits the three free functions are.

**Why bound instead of a third parameter:** the realistic failure is not that someone deliberately uses two different policies, it is that someone **forgets** the third argument. The input dialog would then validate a draft against the defaults while the solver computes with overridden thresholds: the dialog accepts what the Compute button rejects, and nothing shows it.

**Example:**

```typescript
import {
  createLoadValidationPolicy,
  createLoadValidator,
  modelGeometry,
} from '@baustatik/fem-loads';

const policy = createLoadValidationPolicy({ suspiciousReferenceFactor: 0.1 });
const validator = createLoadValidator(policy);

const geom = modelGeometry(nodes, beams);
validator.validateLoad(geom, draft); // input dialog
validator.assertValidLoads(geom, loads); // computation chain
```

---

### createLoadValidationPolicy()

**Signature:** `function createLoadValidationPolicy(overrides?: LoadValidationPolicyOverrides): LoadValidationPolicy`
**Description:** Builds a complete, frozen policy from optional deviations. Checks **values**, not shape — the argument is typed, so the compiler has already ruled on the field names. Without overrides it returns `DEFAULT_LOAD_VALIDATION_POLICY` **itself**, not a copy.

| Field | Default | Meaning |
| --- | --- | --- |
| `stationRelativeTolerance` | `1e-9` | relative tolerance when comparing an **absolute** station against the computed beam length |
| `minimumReferenceFactor` | `1e-9` | hard minimum projection rate; a reference factor `<=` this is rejected |
| `suspiciousReferenceFactor` | `0.05` | warning threshold; below this a `NearlyDegenerateReferenceLengthWarning` is emitted |

Value rules: `stationRelativeTolerance` finite and `>= 0`;
`0 <= minimumReferenceFactor < suspiciousReferenceFactor <= 1`. Violations throw
`InvalidLoadValidationPolicyError`.

**Invariant:** `minimumReferenceFactor: 0` is admissible, and the **exact**
factor 0 stays rejected even then — the check is `factor <= minimum`. A load
whose reference length measures exactly 0 on the beam contributes nothing.

**Example:**

```typescript
import { createLoadValidationPolicy } from '@baustatik/fem-loads';

const strict = createLoadValidationPolicy({
  minimumReferenceFactor: 0.01,
  suspiciousReferenceFactor: 0.1,
});
```

---

### parseLoadValidationPolicy()

**Signature:** `function parseLoadValidationPolicy(input: unknown): LoadValidationPolicy`
**Description:** Reads a stored policy back from JSON. This is the border crossing, so it is the **only** place that checks the shape: all three fields present, every field a number, no unknown fields. Then it applies the same value rules as the factory. Always builds a fresh frozen object. Throws `InvalidLoadValidationPolicyError`.

**Example:**

```typescript
import { parseLoadValidationPolicy } from '@baustatik/fem-loads';

const policy = parseLoadValidationPolicy(JSON.parse(stored));
```

---

### referenceFactor()

**Signature:** `function referenceFactor(reference: ReferenceLength, axis: Line): number`
**Description:** Calculates the dimensionless scaling factor `L_proj / L` for converting a distributed load defined on a projected length (`'horizontalProjection'` or `'verticalProjection'`) to the beam's true length. Returns `1` for `'trueLength'`.

**Example:**

```typescript
import { Line, Point } from '@baustatik/fem-geometry';
import { referenceFactor } from '@baustatik/fem-loads';

// Sloped beam 3m wide, 4m high -> length = 5m
const axis = Line.make(Point.make(0, 0), Point.make(3, -4));

const factorTrue = referenceFactor('trueLength', axis); // 1.0
const factorHoriz = referenceFactor('horizontalProjection', axis); // 3 / 5 = 0.6
const factorVert = referenceFactor('verticalProjection', axis); // 4 / 5 = 0.8
```

---

## Validation Errors Reference

All custom load validation errors inherit from `LoadValidationError`, which extends `BaustatikError` from `@baustatik/errors`.

```typescript
import {
  LoadValidationError,
  EmptyLoadTargetError,
  UnknownLoadTargetError,
  DegenerateBeamError,
  ZeroNodeLoadError,
  ZeroBeamLoadError,
  NonFiniteLoadValueError,
  NegativeDistanceError,
  DistanceOutOfRangeError,
  BackwardsLoadExtentError,
  ReferenceFactorBelowMinimumError,
} from '@baustatik/fem-loads';
```

| Error Class                | Trigger Condition                                               | Key Properties                              |
| -------------------------- | --------------------------------------------------------------- | ------------------------------------------- |
| `LoadValidationError`      | Abstract base class for all load validation errors              | `loadId: string`                            |
| `EmptyLoadTargetError`     | `nodeIds` or `beamIds` array is empty                           | `targetKind: LoadTargetKind`                |
| `UnknownLoadTargetError`   | Specified node or beam ID does not exist in model               | `targetKind`, `targetId: string`            |
| `DegenerateBeamError`      | Loaded beam has zero length (`p1 === p2`)                       | `beamId: string`                            |
| `ZeroNodeLoadError`        | Node load has all components (`fx`, `fz`, `my`) missing or zero | —                                           |
| `ZeroBeamLoadError`        | Beam load has all force/moment values equal to zero             | `fields: readonly string[]`                 |
| `NonFiniteLoadValueError`  | A load value or position is `NaN` or infinite                   | `field: string`, `value: number`            |
| `NegativeDistanceError`    | `distanceFromStart`, `from`, or `to` is less than zero          | `field: string`, `value: number`            |
| `DistanceOutOfRangeError`  | Distance exceeds beam length (or 100%)                          | `field`, `value`, `limit`, `beamId?`        |
| `BackwardsLoadExtentError` | Load interval runs backwards (`from > to`)                      | `from: number`, `to: number`                |
| `ReferenceFactorBelowMinimumError` | Reference factor `L_proj / L` is at or below `minimumReferenceFactor` on the target beam | `beamId`, `referenceLength`, `factor`, `minimumReferenceFactor` |

`ReferenceFactorBelowMinimumError` was called `ZeroProjectedLengthError`. With a
configurable threshold "Zero" is simply wrong — everything up to the bound is
rejected, and the bound need not be 0.

Warnings live in a second hierarchy, `LoadValidationWarning`. They are never
thrown; they report **admissible** input that looks like a slip.

| Warning Class                            | Trigger Condition                                          | Key Properties                                                       |
| ---------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| `NearlyDegenerateReferenceLengthWarning`  | Reference factor below `suspiciousReferenceFactor`         | `beamId`, `referenceLength`, `factor`, `suspiciousReferenceFactor`, `values` |
| `ZeroExtentLoadSegmentWarning`            | Trapezoidal segment with `from === to`                     | `at: number`, `relative: boolean`                                     |

`InvalidLoadValidationPolicyError` sits outside both hierarchies: it complains
about the **setting**, not about a load, and is always thrown, never returned.

---

## Critical Rules

- **Do Not Catch Without Class Inspection**: Catch or check errors using `instanceof` with specific error classes (e.g. `err instanceof ZeroNodeLoadError`) rather than parsing error message strings.
- **Fail Fast in Solvers**: Use `assertValidLoads` prior to solver assembly so invalid loads never cause matrix singularity or unexpected numerical behavior.
- **UI Form Validation**: Use `validateLoads` for user input dialogs to gather all input validation errors at once without aborting on the first error.
