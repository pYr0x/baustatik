/**
 * Der STAB als duenne Linie, plus die Gelenke an seinen Enden.
 *
 * Diese Datei beantwortet, WAS ein Stab zeichnet — die Linie selbst und, wo
 * eine Freigabe sitzt, ein Gelenk. Wie das Gelenksymbol aussieht und wo genau
 * es liegt, steht in `hinge.ts`.
 */

import type { Beam, Node } from '@baustatik/fem';
import { Vector } from '@baustatik/fem-geometry';
import type { LineSpec, Spec } from '@baustatik/render-core';
import { type Viewport, worldPoint } from '@baustatik/viewport-2d';

import { hasRelease, hingeSpec } from './hinge';
import type { ModelStyle } from './style';

export function beamSpecs(
  beam: Beam,
  start: Node,
  end: Node,
  vp: Viewport,
  style: Required<ModelStyle>,
): readonly Spec[] {
  const specs: Spec[] = [beamSpec(beam, start, end, style)];

  const v = Vector.fromPoints(start.position, end.position);

  // Das Gelenk zeigt jeweils IN den Stab hinein, am Endknoten also gegen die
  // Stabrichtung.
  if (hasRelease(beam.releases?.start)) {
    specs.push(hingeSpec(beam, start, v, vp, style));
  }

  if (hasRelease(beam.releases?.end)) {
    specs.push(hingeSpec(beam, end, Vector.negate(v), vp, style));
  }

  return specs;
}

function beamSpec(
  beam: Beam,
  start: Node,
  end: Node,
  style: Required<ModelStyle>,
): LineSpec {
  return {
    kind: 'line',
    id: `beam:${beam.id}`,
    layer: 'beams',
    // x/z -> u/v OHNE Vorzeichenwechsel: in fem-geometry zeigt z nach unten
    // (Baustatik-Konvention), und v zeigt auf dem Schirm ebenfalls nach unten.
    // Dieselbe Regel gilt an jeder `worldPoint`-Stelle des Pakets — es gibt
    // keine, die spiegelt.
    from: worldPoint(start.position.x, start.position.z),
    to: worldPoint(end.position.x, end.position.z),
    // Konstant, OHNE vp.scale: der Adapter setzt strokeScaleEnabled:false,
    // der Wert ist damit bereits screen-konstant.
    strokeWidth: style.beamWidthPx,
    strokeColor: style.beamColor,
  };
}
