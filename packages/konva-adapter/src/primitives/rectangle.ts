import type { RectangleSpec } from '@baustatik/render-core';
import type Konva from 'konva';
import { strokeConfig } from '../stroke';

export function rectangleConfig(spec: RectangleSpec): Konva.RectConfig {
  return {
    id: spec.id,
    x: spec.topLeft.u,
    y: spec.topLeft.v,
    width: spec.width,
    height: spec.height,
    cornerRadius: spec.cornerRadius,
    fill: spec.fillColor,
    ...strokeConfig(spec),
  };
}
