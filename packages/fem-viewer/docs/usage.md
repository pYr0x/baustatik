# @baustatik/fem-viewer Usage

Location: `packages/fem-viewer`

## Overview

A framework-agnostic viewer for planar FEM frame models. It decouples the UI rendering driver (such as Konva/HTML Canvas) from the model data, rendering beams, nodes, node support symbols, loads and — once a load case has been solved — the support reactions as schematic elements on top of a 2D viewport and grid.

The viewer is schematic: node radii, beam widths, and support symbol sizes use screen pixels and remain visually constant under zoom.

## API Reference

### FEM_LAYERS

**Signature:**

```typescript
const FEM_LAYERS: readonly [
  'grid',
  'supports',
  'beams',
  'nodes',
  'hinges',
  'loads',
  'reactions',
];
type FEMLayer = (typeof FEM_LAYERS)[number];
```

**Description:** The paint bands of a FEM scene in paint order — last is topmost. Pass this to the render driver at construction so nodes always draw above beams, supports draw behind beams/nodes, hinges draw above the nodes they sit next to, loads draw above the model and reactions above everything, guaranteeing correct z-ordering regardless of creation order.

Reactions sit on top because they are only in the picture once something has been solved, and then they are what one is looking at.

Hinges sit above `nodes` because a hinge is a white disc that has to read as a *hole* in the beam: drawn underneath, the node circle and the beam line would show through it and it would stop being a hinge.

### femSpecs()

**Signature:**

```typescript
function femSpecs(options: {
  readonly nodes: readonly Node[];
  readonly beams: readonly Beam[];
  readonly supports: readonly NodeSupport[];
  readonly loads: readonly FEMLoad[];
  readonly reactions?: ReadonlyMap<string, SupportReaction>;
  readonly viewport: Viewport;
  readonly style?: FEMStyle;
}): readonly Spec[];
```

**Description:** Pure mapping from model data to render-agnostic specs. Resolves each beam's, support's and reaction's node references against `nodes`, maps structural coordinates (x, z) to world points (u, v) without sign flip, and assigns the corresponding layer bands (`beams`, `nodes`, `hinges`, `supports`, `loads`, `reactions`). Throws `UnknownNodeReferenceError` when an element or a reaction references a non-existent node ID, and `UnknownLoadTargetError` (from `@baustatik/fem-loads`) when a load targets one.

A single options object rather than positional parameters: three `readonly X[]`
in a row would otherwise sit next to each other, and a swapped pair would not
fail at any type boundary.

**Loads.** Concentrated forces — `NodeLoad.fx`/`fz` and `BeamForcePointLoad` —
each become an arrow whose **tip sits on the point of application** plus a
horizontal label carrying the magnitude in `kN`. Every arrow has the same
schematic length (`DEFAULT_POINT_FORCE_ARROW_LENGTH_PX`, 48 px); the magnitude is
in the label, not in the length. A negative value flips the arrow, the label still
shows the unsigned input.

**Moments** — `NodeLoad.my` and `BeamMomentPointLoad` — become a curved arrow
instead: a 270° arc of radius `DEFAULT_MOMENT_RADIUS_PX` (22 px) centred **on the
point of application**, a triangular head, and a label carrying the magnitude in
`kNm` above the arc. A positive moment turns **counter-clockwise** (global y points
out of the plane); a negative one is the mirror image. The 90° gap stays at the
**bottom** for either sign, and the head sits on the edge of the gap it points
into. `my` sits next to `fx`/`fz` in the same load object, so a node can carry
force and moment at once and both are drawn.

`momentPointerLengthPx` and `momentPointerWidthPx` mean exactly what Konva's
`pointerLength`/`pointerWidth` mean on the force arrow — full length, full base
width — because the head carries the same stroke Konva's arrow head does.

Distributed loads (line forces and line moments) are silently skipped for now, so
an existing line load does not stop the rest from drawing.

**Support reactions.** `reactions` takes `SolveResult.reactions` directly. Each
non-zero component becomes the *same* symbol as a load — arrow for `fx`/`fz`,
curved arrow for `my`, tip and centre on the node, magnitude in the label — only
green and in the `reactions` band. Omitting `reactions` (or passing `undefined`)
is the off state and adds no spec at all; there is no separate flag.

A reaction is the force the support exerts **on the structure**, exactly as
`SupportReaction` defines it. A prop under a downward load therefore reports a
negative `fz` and its arrow points **up**, which is what makes `Σ loads +
Σ reactions = 0` legible in the picture. A released direction carries exactly `0`
and produces no symbol, so a two-value bearing draws two arrows and no moment
without the viewer ever inspecting the `NodeSupport`.

Only the reactions are drawn — `N`/`V`/`M` diagrams and the deformed shape are
not implemented yet.

`FEMStyle` fields are optional and default to thin black beams (`'#000'`, 2px width), small red nodes (`'#f00'`, 4px radius), green support symbols (`'#0f0'`), white hinge discs with a black outline (3px radius), blue loads (`'#1d4ed8'` on a light `'#dbeafe'` label box) and green reactions (`'#15803d'` on `'#dcfce7'`). Load and reaction must not share a colour: they sit at the same node, use the same symbol and point opposite ways.

It is the composition of three slices — `ModelStyle` for beams, nodes, hinges and supports, `LoadStyle` for forces and moments, `ResultStyle` for the reactions — resolved once and passed to all three, so a single override object reaches the whole scene. The keys are disjoint on purpose: `FEMStyle` is flat, so load and reaction need their own names even though they drive the same symbols.

```typescript
interface FEMStyle extends ModelStyle, LoadStyle, ResultStyle {}

interface ModelStyle {
  readonly beamColor?: string;
  readonly beamWidthPx?: number;
  readonly nodeColor?: string;
  readonly nodeRadiusPx?: number;
  readonly nodeSupportColor?: string;
  readonly hingeRadiusPx?: number;
  readonly hingeInnerColor?: string;
  readonly hingeStrokeColor?: string;
}

interface LoadStyle {
  readonly pointForceColor?: string;
  readonly pointForceArrowLengthPx?: number;
  readonly pointForceArrowWidthPx?: number;
  readonly pointForcePointerLengthPx?: number;
  readonly pointForcePointerWidthPx?: number;
  readonly momentColor?: string;
  readonly momentRadiusPx?: number;
  readonly momentArcWidthPx?: number;
  readonly momentPointerLengthPx?: number;
  readonly momentPointerWidthPx?: number;
  readonly loadLabelGapPx?: number;
  readonly loadLabelFontSizePx?: number;
  readonly loadLabelFontFamily?: string;
  readonly loadLabelPaddingPx?: number;
  readonly loadLabelCornerRadiusPx?: number;
  readonly loadLabelTextColor?: string;
  readonly loadLabelBackgroundColor?: string;
  readonly loadLabelBorderColor?: string;
  readonly loadLabelBorderWidthPx?: number;
}

// Same shape as LoadStyle, own keys — it drives the same symbols in a different
// colour and a different band.
interface ResultStyle {
  readonly reactionForceColor?: string;
  readonly reactionForceArrowLengthPx?: number;
  readonly reactionForceArrowWidthPx?: number;
  readonly reactionForcePointerLengthPx?: number;
  readonly reactionForcePointerWidthPx?: number;
  readonly reactionMomentColor?: string;
  readonly reactionMomentRadiusPx?: number;
  readonly reactionMomentArcWidthPx?: number;
  readonly reactionMomentPointerLengthPx?: number;
  readonly reactionMomentPointerWidthPx?: number;
  readonly reactionLabelGapPx?: number;
  readonly reactionLabelFontSizePx?: number;
  readonly reactionLabelFontFamily?: string;
  readonly reactionLabelPaddingPx?: number;
  readonly reactionLabelCornerRadiusPx?: number;
  readonly reactionLabelTextColor?: string;
  readonly reactionLabelBackgroundColor?: string;
  readonly reactionLabelBorderColor?: string;
  readonly reactionLabelBorderWidthPx?: number;
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
  getLoads: () => readonly FEMLoad[];
  getReactions?: () => ReadonlyMap<string, SupportReaction> | undefined;
  getScreenSize: () => Size;
  grid?: GridOptions;
  initialViewport?: Viewport;
  style?: FEMStyle;
}): {
  requestRender: () => void;
  destroy: () => void;
};
```

**Description:** Initializes and returns a viewer instance. It pulls raw domain model data on demand (`getNodes`, `getBeams`, `getSupports`, `getLoads`, `getReactions`) whenever `requestRender()` is called, manages viewport interactions (pan, zoom around pointer, reset), and reconciles combined grid and model specs with the injected render driver.

`getLoads` is **mandatory**, following the same pull pattern as the rest: pass
`() => []` if the model has no loads yet.

`getReactions` is **optional** and returns `undefined` while nothing has been
solved. The caller holds the result outside the model store and discards it on
every model change; the picture follows without a second state running alongside.
After solving, call `requestRender()` — solving does not touch the model, so a
store subscription will not fire.

**Example:**

```typescript
import { createFEMViewer, FEM_LAYERS } from '@baustatik/fem-viewer';
import { createKonvaAdapter } from '@baustatik/konva-adapter';
import type { Beam, Node, NodeSupport } from '@baustatik/fem';
import type { FEMLoad } from '@baustatik/fem-loads';
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
const loads: FEMLoad[] = [
  { id: 'l1', target: 'node', nodeIds: ['n2'], fz: 10 },
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
  getLoads: () => loads,
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
  constructor(elementId: string, nodeId: string, elementKind?: string);
}
```

**Description:** Thrown when a beam, a node support or a support reaction references a node ID that does not exist in the provided nodes list. For a reaction, `elementId` and `nodeId` coincide — a reaction has no identity of its own, it *is* the node.

### UnsupportedSupportError

**Signature:**

```typescript
class UnsupportedSupportError extends BaustatikError {
  constructor(supportId: string, ux: string, uz: string, phiY: string);
}
```

**Description:** Thrown when a `NodeSupport` degree-of-freedom configuration (`ux`, `uz`, `phiY`) is not currently supported for visualization by the viewer.

## Notes

- **Layer Ordering**: Passing `FEM_LAYERS` to the driver ensures that element specs are sorted correctly (`grid` -> `supports` -> `beams` -> `nodes` -> `hinges` -> `loads` -> `reactions`). Missing or invalid layer registrations throw `UnknownLayerError`.
- **Coordinate Convention**: `z` points downwards in structural coordinates (`fem-geometry`), matching screen coordinate `v`.
- **Spec Namespacing**: IDs are namespaced as `node:{id}`, `beam:{id}`, and `support:{id}` (plus child spec suffixes for supports). Loads use `load:{loadId}:{targetId}[:{component}]:arrow` and `…:label` for a force, `…:arc`, `…:head` and `…:label` for a moment, so the same load on several targets stays distinguishable. Reactions use `reaction:{nodeId}:{fx|fz|my}` with the same symbol suffixes — a node can carry a load and a reaction with the same component, and the two prefixes are what keeps them apart.
