# @baustatik/fem-viewer Usage
Location: `packages/fem-viewer`

## Overview
A framework-agnostic viewer for planar FEM frame models. It decouples the UI rendering driver (such as Konva/HTML Canvas) from the model data, rendering beams, nodes, and node support symbols as schematic elements on top of a 2D viewport and grid.

The viewer is schematic: node radii, beam widths, and support symbol sizes use screen pixels and remain visually constant under zoom.

## API Reference

### FEM_LAYERS
**Signature:**
```typescript
const FEM_LAYERS: readonly ['grid', 'supports', 'beams', 'nodes'];
type FEMLayer = (typeof FEM_LAYERS)[number];
```
**Description:** The paint bands of a FEM scene in paint order — last is topmost. Pass this to the render driver at construction so nodes always draw above beams, and supports draw behind beams/nodes, guaranteeing correct z-ordering regardless of creation order.

### femSpecs()
**Signature:**
```typescript
function femSpecs(
  nodes: readonly Node[],
  beams: readonly Beam[],
  supports: readonly NodeSupport[],
  vp: Viewport,
  style?: FEMStyle,
): readonly Spec[]
```
**Description:** Pure mapping from model data to render-agnostic specs. Resolves each beam's and support's node references against `nodes`, maps structural coordinates (x, z) to world points (u, v) without sign flip, and assigns the corresponding layer bands (`beams`, `nodes`, `supports`). Throws `UnknownNodeReferenceError` when an element references a non-existent node ID.

`FEMStyle` fields are optional and default to thin black beams (`'#000'`, 2px width), small red nodes (`'#f00'`, 4px radius), and green support symbols (`'#0f0'`):

```typescript
interface FEMStyle {
  readonly beamColor?: string;
  readonly beamWidthPx?: number;
  readonly nodeColor?: string;
  readonly nodeRadiusPx?: number;
  readonly nodeSupportColor?: string;
}
```

### createFEMViewer()
**Signature:**
```typescript
function createFEMViewer(config: {
  driver: RenderDriver;
  getNodes: () => readonly Node[];
  getBeams: () => readonly Beam[];
  getSupports: () => readonly NodeSupport[];
  getScreenSize: () => Size;
  grid?: GridOptions;
  initialViewport?: Viewport;
  style?: FEMStyle;
}): {
  requestRender: () => void;
  destroy: () => void;
}
```
**Description:** Initializes and returns a viewer instance. It pulls raw domain model data on demand (`getNodes`, `getBeams`, `getSupports`) whenever `requestRender()` is called, manages viewport interactions (pan, zoom around pointer, reset), and reconciles combined grid and model specs with the injected render driver.

**Example:**
```typescript
import { createFEMViewer, FEM_LAYERS } from '@baustatik/fem-viewer';
import { createKonvaAdapter } from '@baustatik/konva-adapter';
import type { Beam, Node, NodeSupport } from '@baustatik/fem';
import { screenPoint, viewport } from '@baustatik/viewport-2d';

// 1. Domain model data
const nodes: Node[] = [
  { id: 'n1', position: { x: 0, z: 0 } },
  { id: 'n2', position: { x: 100, z: 0 } },
];
const beams: Beam[] = [
  {
    id: 'b1',
    startNodeId: 'n1',
    endNodeId: 'n2',
    crossSectionId: 'default',
    materialId: 'default',
  },
];
const supports: NodeSupport[] = [
  { id: 's1', nodeId: 'n1', ux: 'fixed', uz: 'fixed', phiY: 'free' },
];

// 2. Instantiate render driver with FEM_LAYERS for z-order guarantee
const driver = createKonvaAdapter({
  container: document.getElementById('canvas-container') as HTMLDivElement,
  width: 800,
  height: 600,
  layers: FEM_LAYERS,
});

// 3. Create viewer instance with pull callbacks
const stageSize = { width: 800, height: 600 };
const viewer = createFEMViewer({
  driver,
  getNodes: () => nodes,
  getBeams: () => beams,
  getSupports: () => supports,
  getScreenSize: () => stageSize,
  initialViewport: viewport(screenPoint(400, 300), 1),
  grid: { spacing: 10 },
});

// 4. Trigger initial render
viewer.requestRender();

// 5. Cleanup on unmount
// viewer.destroy();
```

### UnknownNodeReferenceError
**Signature:**
```typescript
class UnknownNodeReferenceError extends BaustatikError {
  constructor(elementId: string, nodeId: string, elementKind?: string)
}
```
**Description:** Thrown when a beam or node support references a node ID that does not exist in the provided nodes list.

### UnsupportedSupportError
**Signature:**
```typescript
class UnsupportedSupportError extends BaustatikError {
  constructor(supportId: string, ux: string, uz: string, phiY: string)
}
```
**Description:** Thrown when a `NodeSupport` degree-of-freedom configuration (`ux`, `uz`, `phiY`) is not currently supported for visualization by the viewer.

## Notes

- **Layer Ordering**: Passing `FEM_LAYERS` to the driver ensures that element specs are sorted correctly (`grid` -> `supports` -> `beams` -> `nodes`). Missing or invalid layer registrations throw `UnknownLayerError`.
- **Coordinate Convention**: `z` points downwards in structural coordinates (`fem-geometry`), matching screen coordinate `v`.
- **Spec Namespacing**: IDs are namespaced as `node:{id}`, `beam:{id}`, and `support:{id}` (plus child spec suffixes for supports).
