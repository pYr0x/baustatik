import {
  assertNever,
  type GroupSpec,
  type PrimitiveSpec,
  type RenderDriver,
  type Spec,
  UnknownLayerError,
  type ViewIntent,
} from '@baustatik/render-core';
import { type Viewport, worldPointsToFlatArray } from '@baustatik/viewport-2d';
import Konva from 'konva';

interface KonvaDriverConfig {
  container: HTMLDivElement;
  width: number;
  height: number;
  // Zeichenbaender in Malreihenfolge — hinten = oben. Weggelassen = ein
  // einziges implizites Band, spec.layer wird dann ignoriert.
  layers?: readonly string[];
}

// Uebersetzung neutrale Spec -> Konva.Shape. Einzige Stelle mit Konva-Feldnamen.
function buildPrimitive(spec: PrimitiveSpec): Konva.Shape {
  switch (spec.kind) {
    case 'line':
      return new Konva.Line({
        // points: [spec.from.u, spec.from.v, spec.to.u, spec.to.v],
        points: worldPointsToFlatArray([spec.from, spec.to]),
        stroke: spec.strokeColor,
        strokeWidth: spec.strokeWidth,
        strokeScaleEnabled: false,
      });
    case 'circle':
      return new Konva.Circle({
        x: spec.center.u,
        y: spec.center.v,
        radius: spec.radius,
        fill: spec.fillColor,
        stroke: spec.strokeColor,
        strokeWidth: spec.strokeWidth,
        strokeScaleEnabled: false,
      });
    case 'polygon':
      return new Konva.Line({
        points: worldPointsToFlatArray(spec.points),
        closed: spec.closed,
        fill: spec.fillColor,
        stroke: spec.strokeColor,
        strokeWidth: spec.strokeWidth,
        strokeScaleEnabled: false,
      });
    case 'rectangle':
      return new Konva.Rect({
        x: spec.topLeft.u,
        y: spec.topLeft.v,
        width: spec.width,
        height: spec.height,
        fill: spec.fillColor,
        stroke: spec.strokeColor,
        strokeWidth: spec.strokeWidth,
        strokeScaleEnabled: false,
      });
    case 'triangle':
      // noch nicht implementiert — explizit werfen statt undefined zurueckgeben
      throw new Error(`Spec-Kind noch nicht unterstuetzt: ${spec.kind}`);
    //   // gleichseitiges Dreieck um center; als geschlossene Linie
    //   return new Konva.Line({ points: [], closed: true, fill: spec.fillColor, stroke: spec.strokeColor });
    default:
      return assertNever(spec);
  }
}

function patchPrimitive(shape: Konva.Shape, spec: PrimitiveSpec): void {
  switch (spec.kind) {
    case 'line':
      (shape as Konva.Line).points(
        worldPointsToFlatArray([spec.from, spec.to]),
      );
      if (spec.strokeColor !== undefined) shape.stroke(spec.strokeColor);
      if (spec.strokeWidth !== undefined) shape.strokeWidth(spec.strokeWidth);
      break;
    case 'circle':
      shape.position({ x: spec.center.u, y: spec.center.v });
      // Der Radius liegt als einziges Feld in LOKALEN Koordinaten und skaliert
      // mit der Stage. Screen-konstante Symbole liefern deshalb pro Zoom-Frame
      // einen neuen Radius — ohne dieses Patch friert die Punktgroesse ein.
      (shape as Konva.Circle).radius(spec.radius);
      if (spec.fillColor !== undefined) shape.fill(spec.fillColor);
      if (spec.strokeColor !== undefined) shape.stroke(spec.strokeColor);
      if (spec.strokeWidth !== undefined) shape.strokeWidth(spec.strokeWidth);
      break;
    case 'polygon':
      (shape as Konva.Line).points(worldPointsToFlatArray(spec.points));
      (shape as Konva.Line).closed(spec.closed);
      if (spec.fillColor !== undefined) shape.fill(spec.fillColor);
      if (spec.strokeColor !== undefined) shape.stroke(spec.strokeColor);
      if (spec.strokeWidth !== undefined) shape.strokeWidth(spec.strokeWidth);
      break;
    case 'triangle':
      break;
    default:
      return assertNever(spec);
  }
}

export function createKonvaAdapter(config: KonvaDriverConfig): RenderDriver {
  const stage = new Konva.Stage({
    container: config.container,
    width: config.width,
    height: config.height,
  });
  const layer = new Konva.Layer();
  stage.add(layer);
  // stage.rotate(45);

  // Ein Konva.Group je Band, EINMAL in Bandreihenfolge in den Layer gehaengt.
  // Damit haengt die z-Order nicht mehr an der Einfuegereihenfolge: ein spaeter
  // entstehendes Shape landet am Ende SEINES Bandes (O(1)) statt ganz obenauf.
  const declaredLayers = config.layers ?? [];
  const layerGroups = new Map<string, Konva.Group>();
  for (const name of declaredLayers) {
    const group = new Konva.Group();
    layer.add(group);
    layerGroups.set(name, group);
  }

  // Ohne deklarierte Baender bleibt alles im Layer — exakt das alte Verhalten.
  function containerFor(spec: Spec): Konva.Layer | Konva.Group {
    if (layerGroups.size === 0) return layer;
    const group =
      spec.layer === undefined ? undefined : layerGroups.get(spec.layer);
    if (!group) {
      throw new UnknownLayerError(spec.id, spec.layer, declaredLayers);
    }
    return group;
  }

  interface LivePrimitive {
    readonly kind: PrimitiveSpec['kind'];
    readonly shape: Konva.Shape;
  }

  interface LiveGroup {
    readonly kind: 'group';
    readonly group: Konva.Group;
    readonly children: Map<string, LivePrimitive>;
  }

  type LiveSpec = LivePrimitive | LiveGroup;

  function buildLivePrimitive(spec: PrimitiveSpec): LivePrimitive {
    return { kind: spec.kind, shape: buildPrimitive(spec) };
  }

  function reconcileGroupChildren(entry: LiveGroup, spec: GroupSpec): void {
    const seen = new Set<string>();

    for (const childSpec of spec.children) {
      seen.add(childSpec.id);
      const existing = entry.children.get(childSpec.id);

      if (existing?.kind === childSpec.kind) {
        patchPrimitive(existing.shape, childSpec);
        existing.shape.moveToTop();
        continue;
      }

      if (existing) existing.shape.destroy();
      const child = buildLivePrimitive(childSpec);
      entry.group.add(child.shape);
      entry.children.set(childSpec.id, child);
    }

    for (const [id, child] of entry.children) {
      if (!seen.has(id)) {
        child.shape.destroy();
        entry.children.delete(id);
      }
    }
  }

  function patchGroup(entry: LiveGroup, spec: GroupSpec): void {
    entry.group.position({ x: spec.position.u, y: spec.position.v });
    // Konva zieht offset vom lokalen Koordinatensystem ab. Die neutrale Spec
    // beschreibt dagegen die gewuenschte sichtbare Verschiebung positiv.
    entry.group.offset({
      x: -spec.translation.u,
      y: -spec.translation.v,
    });
    entry.group.rotation(spec.rotationDeg ?? 0);
    reconcileGroupChildren(entry, spec);
  }

  function buildLiveGroup(spec: GroupSpec): LiveGroup {
    const entry: LiveGroup = {
      kind: 'group',
      group: new Konva.Group({ id: spec.id }),
      children: new Map(),
    };
    patchGroup(entry, spec);
    return entry;
  }

  function destroyLive(entry: LiveSpec): void {
    if (entry.kind === 'group') entry.group.destroy();
    else entry.shape.destroy();
  }

  function nodeOf(entry: LiveSpec): Konva.Shape | Konva.Group {
    return entry.kind === 'group' ? entry.group : entry.shape;
  }

  const live = new Map<string, LiveSpec>();
  // 1. DEKLARIEREN
  let intentHandler: ((intent: ViewIntent) => void) | null = null;

  // Maus-Interaktion: nur MELDEN.
  let dragging = false,
    lastX = 0,
    lastY = 0;
  stage.on('mousedown', (e) => {
    dragging = true;
    lastX = e.evt.clientX;
    lastY = e.evt.clientY;
  });
  stage.on('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.evt.clientX - lastX;
    const dy = e.evt.clientY - lastY;
    lastX = e.evt.clientX;
    lastY = e.evt.clientY;
    // 3. AUSLOESEN
    intentHandler?.({ type: 'pan', dx, dy });
  });
  stage.on('mouseup', () => {
    dragging = false;
  });
  stage.on('wheel', (e) => {
    e.evt.preventDefault();
    const factor = e.evt.deltaY < 0 ? 1.1 : 1 / 1.1;
    const pointer = stage.getPointerPosition() ?? { x: 0, y: 0 };
    intentHandler?.({ type: 'zoom', factor, pointer });
  });

  return {
    applyViewport(vp: Viewport) {
      stage.scale({ x: vp.scale, y: vp.scale });
      stage.position({ x: vp.origin.x, y: vp.origin.y });
    },

    // 2. MERKEN
    onViewIntent(handler) {
      intentHandler = handler;
    },

    reconcile(specs: readonly Spec[]) {
      const seen = new Set<string>();
      for (const spec of specs) {
        seen.add(spec.id);
        const existing = live.get(spec.id);

        if (existing?.kind === spec.kind) {
          const parent = containerFor(spec);
          const node = nodeOf(existing);
          if (node.getParent() !== parent) node.moveTo(parent);

          if (spec.kind === 'group') {
            patchGroup(existing as LiveGroup, spec);
          } else {
            patchPrimitive(
              (existing as LivePrimitive).shape,
              spec as PrimitiveSpec,
            );
          }
          continue;
        }

        // Das gleiche stabile ID darf seine Art wechseln. Dann wird der alte
        // Konva-Knoten kontrolliert ersetzt, statt mit einem falschen Cast zu
        // patchen.
        if (existing) destroyLive(existing);

        const parent = containerFor(spec);
        const next =
          spec.kind === 'group'
            ? buildLiveGroup(spec)
            : buildLivePrimitive(spec);
        parent.add(nodeOf(next));
        live.set(spec.id, next);
      }
      for (const [id, entry] of live) {
        if (!seen.has(id)) {
          destroyLive(entry);
          live.delete(id);
        }
      }
    },

    flush() {
      layer.batchDraw();
    },
    destroy() {
      stage.destroy();
    },
  };
}
