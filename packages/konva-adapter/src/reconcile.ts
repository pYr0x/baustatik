import type { GroupSpec, PrimitiveSpec, Spec } from '@baustatik/render-core';
import Konva from 'konva';
import type { Bands } from './bands';
import { buildPrimitive, type LeafNode, patchPrimitive } from './primitives';

// `shape` ist nicht zwingend eine `Konva.Shape`: ein Label ist eine Gruppe aus
// Tag und Text. Fuer den Abgleich zaehlt nur, dass es ein Blatt ist — es hat
// keine vom Reconciler verwalteten Kinder.
interface LivePrimitive {
  readonly kind: PrimitiveSpec['kind'];
  readonly shape: LeafNode;
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

function nodeOf(entry: LiveSpec): LeafNode | Konva.Group {
  return entry.kind === 'group' ? entry.group : entry.shape;
}

export interface Reconciler {
  reconcile(specs: readonly Spec[]): void;
}

// Diff-basierter Abgleich zwischen der aktuellen Spec-Liste und dem lebenden
// Konva-Baum. Stabile IDs werden gepatcht, verschwundene zerstoert, neue
// gebaut. Ein Spec darf bei gleicher ID seine Art wechseln — dann wird der alte
// Knoten kontrolliert ersetzt statt mit falschem Cast gepatcht.
export function createReconciler(bands: Bands): Reconciler {
  const live = new Map<string, LiveSpec>();

  function reconcile(specs: readonly Spec[]): void {
    const seen = new Set<string>();
    for (const spec of specs) {
      seen.add(spec.id);
      const existing = live.get(spec.id);

      if (existing?.kind === spec.kind) {
        const parent = bands.containerFor(spec);
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

      if (existing) destroyLive(existing);

      const parent = bands.containerFor(spec);
      const next =
        spec.kind === 'group' ? buildLiveGroup(spec) : buildLivePrimitive(spec);
      parent.add(nodeOf(next));
      live.set(spec.id, next);
    }
    for (const [id, entry] of live) {
      if (!seen.has(id)) {
        destroyLive(entry);
        live.delete(id);
      }
    }
  }

  return { reconcile };
}
