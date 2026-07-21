import type { TriangleSpec } from '@baustatik/render-core';
import type Konva from 'konva';
import { strokeConfig } from '../stroke';

// Gleichseitiges Dreieck als Konva.RegularPolygon (sides:3). sideLength ist die
// Kantenlaenge a; Konva erwartet den Umkreisradius R = a / sqrt(3). Wie beim
// Circle ist radius das einzige lokale Feld und wird pro Frame gepatcht.
// Bei v nach unten zeigt die Default-Spitze nach oben.
export function triangleConfig(spec: TriangleSpec): Konva.RegularPolygonConfig {
  return {
    id: spec.id,
    x: spec.center.u,
    y: spec.center.v,
    sides: 3,
    radius: spec.sideLength / Math.sqrt(3),
    fill: spec.fillColor,
    ...strokeConfig(spec),
  };
}
