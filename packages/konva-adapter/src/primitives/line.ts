import type { LineSpec } from '@baustatik/render-core';
import { worldPointsToFlatArray } from '@baustatik/viewport-2d';
import type Konva from 'konva';
import { strokeConfig } from '../stroke';

// Neutrale LineSpec -> Konva.LineConfig. Reine Funktion, kein Konva-Konstruktor:
// so ist die Uebersetzung in node ohne Canvas testbar.
export function lineConfig(spec: LineSpec): Konva.LineConfig {
  return {
    id: spec.id,
    points: worldPointsToFlatArray([spec.from, spec.to]),
    ...strokeConfig(spec),
  };
}
