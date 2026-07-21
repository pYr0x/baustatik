import type { CircleSpec } from '@baustatik/render-core';
import type Konva from 'konva';
import { strokeConfig } from '../stroke';

// radius liegt als EINZIGES Feld in lokalen Koordinaten und skaliert mit der
// Stage. Screen-konstante Symbole liefern deshalb pro Zoom-Frame einen neuen
// radius; der einheitliche setAttrs-Patch-Pfad uebernimmt ihn automatisch.
export function circleConfig(spec: CircleSpec): Konva.CircleConfig {
  return {
    id: spec.id,
    x: spec.center.u,
    y: spec.center.v,
    radius: spec.radius,
    fill: spec.fillColor,
    ...strokeConfig(spec),
  };
}
