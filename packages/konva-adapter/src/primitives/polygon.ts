import type { PolygonSpec } from '@baustatik/render-core';
import { worldPointsToFlatArray } from '@baustatik/viewport-2d';
import type Konva from 'konva';
import { strokeConfig } from '../stroke';

// Polygon wird wie in Konva ueblich als (geschlossene) Konva.Line dargestellt.
export function polygonConfig(spec: PolygonSpec): Konva.LineConfig {
  return {
    id: spec.id,
    points: worldPointsToFlatArray(spec.points),
    closed: spec.closed,
    fill: spec.fillColor,
    ...strokeConfig(spec),
  };
}
