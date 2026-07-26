import type { ArrowSpec } from '@baustatik/render-core';
import { worldPointsToFlatArray } from '@baustatik/viewport-2d';
import type Konva from 'konva';
import { strokeConfig } from '../stroke';

// Konva zeichnet die Spitze am LETZTEN Punkt von `points`. Die Reihenfolge
// tail -> tip ist deshalb nicht Geschmack, sondern die Wirkrichtung selbst.
export function arrowConfig(spec: ArrowSpec): Konva.ArrowConfig {
  return {
    id: spec.id,
    points: worldPointsToFlatArray([spec.tail, spec.tip]),
    pointerLength: spec.pointerLength,
    pointerWidth: spec.pointerWidth,
    // Ohne Fuellung bleibt die Spitze ein offenes Dreieck aus zwei Strichen.
    fill: spec.fillColor,
    ...strokeConfig(spec),
  };
}
