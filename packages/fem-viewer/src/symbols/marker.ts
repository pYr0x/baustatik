/**
 * Die MARKE auf der Stabachse — die Stelle, auf die sich eine Lastfigur bezieht.
 *
 * Sie ist nicht Zierrat, sondern die Gegenrechnung dazu, dass die Figur nicht
 * mehr am Stab klebt: die Streckenlast steht bei einer Projektion ueberhaupt
 * nicht mehr ueber dem belasteten Stueck (ADR 0028), und seit auch der Kraftpfeil
 * um `forceGapPx` absteht, endet er nicht mehr im Angriffspunkt. Ohne die Marke
 * sagt das Bild dann nicht mehr, WO die Last am Stab angreift.
 *
 * NUR AUF EINEM STAB. Eine Knotenlast und eine Auflagerreaktion haengen an einem
 * Knoten, und der ist bereits gezeichnet — dort saesse die Marke auf einem
 * groesseren roten Kreis und sagte nichts, was das Bild nicht schon sagt.
 * Deshalb entscheidet der Aufrufer (`loads/beam-loads.ts`), ob es eine Marke
 * gibt, und nicht das Kraftsymbol.
 *
 * ACHSPARALLEL und nicht mitgedreht: `RectangleSpec` kennt keine Drehung, und
 * ein Punkt braucht keine. Die Marke zeigt eine STELLE, keine Richtung.
 */

import type { Point } from '@baustatik/fem-geometry';
import type { RectangleSpec } from '@baustatik/render-core';
import { type Viewport, worldPoint } from '@baustatik/viewport-2d';

import type { FEMLayer } from '../layers';
import type { MarkerStyle } from './style';

export function markerSpec(
  id: string,
  layer: FEMLayer,
  center: Point,
  vp: Viewport,
  style: MarkerStyle,
): RectangleSpec {
  const size = style.markerSizePx / vp.scale;
  return {
    kind: 'rectangle',
    id,
    layer,
    topLeft: worldPoint(center.x - size / 2, center.z - size / 2),
    width: size,
    height: size,
    fillColor: style.markerColor,
  };
}
