# @baustatik/cross-section-viewer Usage

Location: `packages/cross-section-viewer`

## Overview

A framework-agnostic cross-section viewer that decouples UI rendering drivers
(such as Konva/HTML Canvas) from the stored cross-section geometry and from the
results a caller hands in.

The viewer maps **stored geometry** and **externally supplied results** onto
render-neutral specs. It derives neither an outline, nor a mesh, nor section
values.

## The five bands

The scene has five paint bands, in this fixed order:

```text
grid → thin-walls → outlines → fe → symbols
```

`CROSS_SECTION_LAYERS` is the single name list, type source and z-order; the last
entry is topmost. Pass it to the render driver at construction.

| Band | Content | Source | Look |
| --- | --- | --- | --- |
| `grid` | coordinate grid | `@baustatik/grid-2d` | — |
| `thin-walls` | input centre lines | `SectionGeometry.nodes`/`walls` | black, physical wall thickness |
| `outlines` | derived, carried outline | `SectionGeometry.outline` | orange, screen-constant stroke |
| `fe` | optional triangle mesh | transient mesh pull | light ochre wireframe |
| `symbols` | centroid, shear centre, stress points | optional result pulls | red, green, blue |

## API Reference

### createCrossSectionViewer()

**Signature:**

```typescript
function createCrossSectionViewer(config: {
  driver: RenderDriver;
  getGeometry: () => SectionGeometry;
  getSectionPolicy: () => SectionPolicy;
  getScreenSize: () => Size;
  getProperties?: () => SectionProperties | undefined;
  getStressPoints?: () => readonly StressPoint[] | undefined;
  getFEMesh?: () => CrossSectionFEMesh | undefined;
  grid?: GridOptions;
  initialViewport?: Viewport;
  style?: CrossSectionStyle;
}): {
  requestRender: () => void;
  destroy: () => void;
}
```

**Description:** Initializes and returns a cross-section viewer instance. The
viewer pulls the stored `SectionGeometry` on demand (e.g. from a state store),
manages viewport transformations (pan, zoom, reset), and maps the physical 2D
coordinates ($y, z$) to world points ($u, v$).

**Two pulls for the input, one source.** `getSectionPolicy` sits next to
`getGeometry` because `discretisationTolerance` decides which edge counts as curved at all,
and since `schemaVersion: 7` it lives in the *same* record as the outline the
viewer draws beside it
([ADR 0033](../../../docs/adr/0033-the-cross-section-has-a-creation-policy.md)).
A module constant would take the tolerance from a different source than the
record; an *optional* pull would only make the silent divergence less noticeable.
What `Bulge.isStraight` reads as straight, the viewer draws straight — one
threshold, not two.

**Three pulls for the results, and an omitted one is the off state.**
`getProperties`, `getStressPoints` and `getFEMesh` each return `undefined` for
"not computed yet". There is no separate visibility switch: a flag beside the
existence of a result would be a second state that can go stale. The caller
decides when a calculation is valid and discards it on every geometry or policy
change — the picture follows without a second state in the viewer. For the mesh
this is the rule of
[ADR 0039](../../../docs/adr/0039-meshing-is-a-transient-worker-capability.md);
for computed values it is the pattern of the support reactions in the FEM viewer.

Every pull is read **exactly once per frame**: a second call could return a
different value, and then one picture would show two calculation states.

**What it draws, and from which source.** `SectionGeometry` carries its derived
outline with it
([ADR 0030](../../../docs/adr/0030-the-section-editor-stores-a-wall-graph.md)),
and the viewer reads that outline rather than deriving its own — a second outline
would be a second opinion on the shape whose section values are printed in the
report. On top of it, the `midline` variant draws each wall's centre line with
its physical thickness `t` as the stroke width: a straight wall as a `line`, a
curved one as an `arcPath`. A stroke of width `t` on an arc **is** the wall —
`arcPath` carries no fill, which is exactly right for a centre line.

**Signs carry through without conversion.** `Arc.sweep` counts positive from `+y`
to `+z`, `ArcPathSpec.sweepAngle` from `+u` to `+v`, and the mapping between them
is `worldPoint(y, z)` — the identity. This is pinned by a test rather than
believed; it is the one place where three rotation senses meet.

**Example:**

```typescript
import { createCrossSectionViewer, CROSS_SECTION_LAYERS } from '@baustatik/cross-section-viewer';
import { createKonvaAdapter } from '@baustatik/konva-adapter';
import {
  DEFAULT_SECTION_POLICY,
  type SectionGeometry,
} from '@baustatik/cross-section';

// 1. Set up a state container (e.g. Pinia, a plain object, or a reactive store).
//    Coordinates and thicknesses are millimetres. The store holds the geometry
//    AND the creation policy — the record and its recipe travel together.
const store = { sectionPolicy: DEFAULT_SECTION_POLICY };

const geometry: SectionGeometry = {
  kind: 'midline',
  idealisation: 'thin-walled',
  nodes: [
    { id: 'n1', y: 0, z: 0 },
    { id: 'n2', y: 0, z: 100 },
  ],
  walls: [{ id: 'wall-1', startNodeId: 'n1', endNodeId: 'n2', t: 8 }],
  // Derived from nodes/walls by the editor and stored with them.
  outline: [
    {
      points: [
        { y: -4, z: 0 },
        { y: 4, z: 0 },
        { y: 4, z: 100 },
        { y: -4, z: 100 },
      ],
    },
  ],
};

// 2. Instantiate the render driver with the declared bands.
const driver = createKonvaAdapter({
  container: document.getElementById('canvas-container') as HTMLDivElement,
  width: 800,
  height: 600,
  layers: CROSS_SECTION_LAYERS,
});

// 3. Create the viewer by injecting the driver and the pulls
const viewer = createCrossSectionViewer({
  driver,
  getGeometry: () => geometry,
  // Pull the policy the PROJECT stored, next to the geometry it was created
  // with. `DEFAULT_SECTION_POLICY` stands in here only because this example has
  // no project behind it — in an application this reads from the same store as
  // `getGeometry`, so the outline and the tolerance that produced it cannot
  // drift apart.
  getSectionPolicy: () => store.sectionPolicy,
  getScreenSize: () => ({ width: 800, height: 600 }),
});

// 4. Perform initial render
viewer.requestRender();

// 5. Clean up when done (e.g. when a component unmounts)
// viewer.destroy();
```

## Showing a computed result

The result is **not** input data. Hold it beside the store, discard it whenever
the geometry or the policy changes, and let the viewer pull it:

```typescript
import { sectionProperties, stressPoints } from '@baustatik/cross-section';

let result: { properties?: SectionProperties; points?: readonly StressPoint[] } | undefined;

const viewer = createCrossSectionViewer({
  driver,
  getGeometry: () => store.geometry,
  getSectionPolicy: () => store.sectionPolicy,
  getScreenSize: () => stageSize,
  getProperties: () => result?.properties,
  getStressPoints: () => result?.points,
});
```

The centroid appears as soon as `properties` exists. The shear centre appears
only when **both** `yM` and `zM` are determined: `undefined` means "not
determined", never `0` and never "coincides with the centroid". Stress points
without `properties` stay invisible too, because their coordinates are relative
to the centroid and have no absolute place without it.

## Showing an FE mesh

```typescript
interface CrossSectionFEMesh {
  readonly kind: 'tri3' | 'tri6';
  readonly points: Float64Array;   // [y0, z0, y1, z1, …] in millimetres
  readonly elements: Uint32Array;  // 3 resp. 6 node indices per element
}
```

The type is **deliberately only structurally** compatible with `Mesh2DResult`: a
result from `@baustatik/mesh-2d-wasm` drops straight in, but this package does
not import the mesher and knows neither worker, PSLG, `boundarySegments` nor
markers. Turning Triangle elements into a wireframe is the visual consumer's job,
not the generic mesher's.

The wireframe draws the three **corner** edges per element, each exactly once —
for Tri6 as well, because its edges stay straight and the mid-nodes sit at their
midpoints. All of it becomes a single `IndexedLineListSpec`, so a mesh with a few
thousand elements is one adapter node rather than several thousand.

A mesh whose element list does not add up to its own `kind` **throws**
(`InvalidFEMeshError`). Unlike the wall graph, which may legitimately be
unfinished during input, a mesh is a calculation result.

```typescript
const viewer = createCrossSectionViewer({
  driver,
  getGeometry: () => store.geometry,
  getSectionPolicy: () => store.sectionPolicy,
  getScreenSize: () => stageSize,
  // The mesh is transient (ADR 0039): the caller holds it, and drops it as soon
  // as the geometry or the policy changes.
  getFEMesh: () => result?.mesh,
});
```

## The style

```typescript
interface CrossSectionStyle {
  readonly thinWallColor?: string;
  readonly outlineColor?: string;
  readonly outlineWidthPx?: number;
  readonly feColor?: string;
  readonly feWidthPx?: number;
  readonly centroidColor?: string;
  readonly centroidRadiusPx?: number;
  readonly shearCentreColor?: string;
  readonly shearCentreRadiusPx?: number;
  readonly stressPointColor?: string;
  readonly stressPointSizePx?: number;
}
```

Omitted fields fall back to `DEFAULT_STYLE`; the style is resolved **once** and
handed to all four mappings, so a caller override cannot reach only part of the
picture.

**Wall thickness is deliberately not a style field.** `Wall.t` is physics in
millimetres and is multiplied by `viewport.scale`, so that the adapter's
screen-constant stroke reproduces the drawn width as a world quantity. Everything
with the `Px` suffix is schematic, is divided by `viewport.scale` and therefore
stays screen-constant while zooming.

## The pure scene function

`crossSectionSpecs` is the one door for anyone who wants specs without a driver —
for tests, for a different renderer, or for composing a larger scene:

```typescript
import { crossSectionSpecs } from '@baustatik/cross-section-viewer';

const specs = crossSectionSpecs({
  geometry,
  sectionPolicy: DEFAULT_SECTION_POLICY,
  viewport,
  properties,   // optional
  stressPoints, // optional
  feMesh,       // optional
  style,        // optional
});
```

It is pure: no driver, no Konva, no state.

## Checking a geometry before drawing it

`@baustatik/cross-section` owns the gate. It **warns, it does not refuse**
([ADR 0032](../../../docs/adr/0032-the-cross-section-gate-warns.md)) — the viewer
draws a flawed section anyway, so that the flaw is visible next to its report.
The drawing path follows the same attitude: a dangling node reference drops
exactly that wall, and a broken `bulge` falls back to the chord. Grid, outline,
mesh and symbols stay in the picture.

Both gate doors take the **`SectionPolicy`** — the same record the viewer pulls,
so the figure is judged under the settings it was created with. Pass the
project's stored policy, not a fresh default: a project stores its *effective*
values precisely so that a change to the software defaults cannot silently move
its numbers
([ADR 0033](../../../docs/adr/0033-the-cross-section-has-a-creation-policy.md)).

`validateSectionProperties` takes the policy today without reading a field from
it. That is deliberate, not an oversight — the "`Iyz` is zero" threshold lands
there with P2, and one break now is cheaper than two.

```typescript
import {
  createSectionPolicy,
  DEFAULT_SECTION_POLICY,
  validateSectionGeometry,
} from '@baustatik/cross-section';

const { errors, warnings } = validateSectionGeometry(
  geometry,
  DEFAULT_SECTION_POLICY,
);

// A project that wants a finer discretisation stores this instead:
const policy = createSectionPolicy({ discretisationTolerance: 0.01 });
```
