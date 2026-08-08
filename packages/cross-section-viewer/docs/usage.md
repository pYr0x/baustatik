# @baustatik/cross-section-viewer Usage
Location: `packages/cross-section-viewer`

## Overview
A framework-agnostic cross-section viewer that decouples UI rendering drivers (such as Konva/HTML Canvas) from the stored cross-section geometry and store state.

## API Reference

### createCrossSectionViewer()
**Signature:**
```typescript
function createCrossSectionViewer(config: {
  driver: RenderDriver;
  getGeometry: () => SectionGeometry;
  getSectionPolicy: () => SectionPolicy;
  getScreenSize: () => Size;
  grid?: GridOptions;
  initialViewport?: Viewport;
}): {
  requestRender: () => void;
  destroy: () => void;
}
```
**Description:** Initializes and returns a cross-section viewer instance. The viewer interacts with a rendering driver, pulls the stored `SectionGeometry` on demand (e.g. from a state store), manages viewport transformations (pan, zoom, reset), and maps the physical 2D coordinates ($y, z$) to world points ($u, v$).

**What it draws, and from which source.** `SectionGeometry` carries its derived outline with it ([ADR 0030](../../../docs/adr/0030-the-section-editor-stores-a-wall-graph.md)), and the viewer reads that outline rather than deriving its own — a second outline would be a second opinion on the shape whose section values are printed in the report. On top of it, the `midline` variant draws each wall's centre line with its physical thickness `t` as the stroke width: a straight wall as a `line`, a curved one as an `arcPath`. A stroke of width `t` on an arc **is** the wall — `arcPath` carries no fill, which is exactly right for a centre line.

**Two pulls, one source.** `getSectionPolicy` sits next to `getGeometry` because `arcTolerance` decides which edge counts as curved at all, and since `schemaVersion: 7` it lives in the *same* record as the outline the viewer draws beside it ([ADR 0033](../../../docs/adr/0033-the-cross-section-has-a-creation-policy.md)). A module constant would take the tolerance from a different source than the record; an *optional* pull would only make the silent divergence less noticeable. What `Bulge.isStraight` reads as straight, the viewer draws straight — one threshold, not two.

**Signs carry through without conversion.** `Arc.sweep` counts positive from `+y` to `+z`, `ArcPathSpec.sweepAngle` from `+u` to `+v`, and the mapping between them is `worldPoint(y, z)` — the identity. This is pinned by a test rather than believed; it is the one place where three rotation senses meet.

The geometry port replaces the former `getSegments(): readonly Segment[]`. `Segment` was dead code — nothing in `src/` ever constructed one, and this viewer was its only consumer.

**Example:**
```typescript
import { createCrossSectionViewer } from '@baustatik/cross-section-viewer';
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

// 2. Instantiate the render driver (e.g. the Konva driver)
const driver = createKonvaAdapter({
  container: document.getElementById('canvas-container') as HTMLDivElement,
  width: 800,
  height: 600,
});

// 3. Create the viewer by injecting the driver and the geometry callback
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

## Checking a geometry before drawing it

`@baustatik/cross-section` owns the gate. It **warns, it does not refuse** ([ADR 0032](../../../docs/adr/0032-the-cross-section-gate-warns.md)) — the viewer draws a flawed section anyway, so that the flaw is visible next to its report.

Both doors take the **`SectionPolicy`** — the same record the viewer pulls, so
the figure is judged under the settings it was created with. Pass the project's
stored policy, not a fresh default: a project stores its *effective* values
precisely so that a change to the software defaults cannot silently move its
numbers ([ADR 0033](../../../docs/adr/0033-the-cross-section-has-a-creation-policy.md)).

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
const policy = createSectionPolicy({ arcTolerance: 0.01 });
```
