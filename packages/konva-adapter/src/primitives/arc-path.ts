import type { ArcPathSpec } from '@baustatik/render-core';
import type Konva from 'konva';
import { strokeConfig } from '../stroke';

// Konva hat mit `Konva.Arc` zwar eine Bogenform, aber die ist ein RINGSEGMENT:
// eine Flaeche, die immer beide Radien und die zweite Kante mitzieht. Ein reiner
// Strichbogen entsteht deshalb ueber `Konva.Path` mit dem SVG-Kommando `A`.
// Genau diese Zweideutigkeit steckt im Namen `ArcPath`: Konvas `Arc` und der
// hier gemeinte Bogen sind nicht dieselbe Figur.
//
// `data` liegt in lokalen Koordinaten, und die Shape bleibt bei x=0/y=0 — die
// Punkte sind damit Weltkoordinaten wie bei jedem anderen Primitive, und die
// Stage-Transformation erledigt den Rest.
function pointOnCircle(
  spec: ArcPathSpec,
  angle: number,
): { readonly u: number; readonly v: number } {
  return {
    u: spec.center.u + spec.radius * Math.cos(angle),
    v: spec.center.v + spec.radius * Math.sin(angle),
  };
}

/**
 * Der SVG-Pfad des Bogens.
 *
 * Beide Flags folgen direkt aus `sweepAngle`: `large-arc-flag` unterscheidet die
 * beiden Boegen zwischen denselben Endpunkten, `sweep-flag` die Umlaufrichtung.
 * SVG zaehlt positiv in Richtung +y, und v zeigt nach unten — ein wachsender
 * Winkel ist also dasselbe wie `sweep-flag: 1`, ohne Vorzeichenwechsel.
 */
export function arcPathData(spec: ArcPathSpec): string {
  const from = pointOnCircle(spec, spec.startAngle);
  const to = pointOnCircle(spec, spec.startAngle + spec.sweepAngle);
  const largeArc = Math.abs(spec.sweepAngle) > Math.PI ? 1 : 0;
  const sweepFlag = spec.sweepAngle > 0 ? 1 : 0;
  const r = spec.radius;

  return `M ${from.u} ${from.v} A ${r} ${r} 0 ${largeArc} ${sweepFlag} ${to.u} ${to.v}`;
}

export function arcPathConfig(spec: ArcPathSpec): Konva.PathConfig {
  return {
    id: spec.id,
    data: arcPathData(spec),
    ...strokeConfig(spec),
  };
}
