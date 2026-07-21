import { type Spec, UnknownLayerError } from '@baustatik/render-core';
import Konva from 'konva';

export interface Bands {
  // Zielcontainer fuer ein Spec: das deklarierte Band oder — ohne Baender — der
  // Layer selbst (exakt das alte Verhalten).
  containerFor(spec: Spec): Konva.Layer | Konva.Group;
}

// Ein Konva.Group je Band, EINMAL in Bandreihenfolge in den Layer gehaengt.
// Damit haengt die z-Order nicht mehr an der Einfuegereihenfolge: ein spaeter
// entstehendes Shape landet am Ende SEINES Bandes (O(1)) statt ganz obenauf.
export function createBands(
  layer: Konva.Layer,
  declaredLayers: readonly string[],
): Bands {
  const layerGroups = new Map<string, Konva.Group>();
  for (const name of declaredLayers) {
    const group = new Konva.Group();
    layer.add(group);
    layerGroups.set(name, group);
  }

  function containerFor(spec: Spec): Konva.Layer | Konva.Group {
    if (layerGroups.size === 0) return layer;
    const group =
      spec.layer === undefined ? undefined : layerGroups.get(spec.layer);
    if (!group) {
      throw new UnknownLayerError(spec.id, spec.layer, declaredLayers);
    }
    return group;
  }

  return { containerFor };
}
