/**
 * DIE BEWEHRUNG — die sechste Bande
 * ([ADR 0064](../../../docs/adr/0064-the-reinforcement-lives-on-the-cross-section.md)).
 *
 * SIE IST NICHT IN `symbols.ts`, und das ist die Aussage: jene Datei heisst im
 * ersten Satz „DIE ERGEBNISSYMBOLE", und die Bewehrung ist EINGABE. Sie steht
 * im Modellsatz, sie wird nicht gerechnet, und sie veraltet nicht, wenn die
 * Geometrie sich aendert — sie ist dann falsch, und das sagt das Gate
 * (`validateReinforcement`), nicht der Viewer.
 *
 * DER KREIS IST EINE MARKIERUNG, KEIN BILD EINES STABES. Sein Radius kommt
 * NICHT aus `As`: die Markierung sagt WO, nicht WIE VIEL. Ein flaechentreuer
 * Kreis waere bei 4,52 cm² gerade 24 mm gross und bei 0,5 cm² nicht mehr zu
 * treffen — und er behauptete ausserdem einen einzelnen Stab, waehrend ein
 * Element fuer einen oder fuer mehrere stehen darf.
 *
 * DAS `Px`-SUFFIX HEISST IN DIESEM PACKAGE „ZOOMT NICHT MIT" (`style.ts`).
 * `rebarRadiusPx / vp.scale` ist deshalb dieselbe Rechnung wie beim
 * Schwerpunkt, und aus demselben Grund: ein Zeichen hat keine Ausdehnung.
 *
 * KEIN `properties` NOETIG, anders als bei den Spannungspunkten: deren
 * Koordinaten sind schwerpunktsbezogen, die der Bewehrungselemente sind
 * ABSOLUT — im Rahmen der Geometrie daneben (ADR 0064).
 */

import type { ReinforcementLayer } from '@baustatik/cross-section';
import type { GroupSpec, ShapeSpec, Spec } from '@baustatik/render-core';
import { type Viewport, worldPoint } from '@baustatik/viewport-2d';

import type { CrossSectionStyle } from './style';

export const REBAR_LAYER = 'rebar';

/**
 * Eine Gruppe mit einem Kreis je Element — oder gar nichts.
 *
 * EINE GRUPPE UND NICHT *n* TOP-LEVEL SPECS, aus demselben Grund wie bei den
 * Symbolen: die Ueberdeckung wird damit reproduzierbar, und der geordnete
 * Kind-Reconciler tut die Arbeit statt der Einfuegegeschichte.
 *
 * DIE SPEC-ID TRAEGT BEIDE IDS, `layer.id` UND `element.id`. Die zweite ist
 * ueber ALLE Lagen eindeutig (das Gate meldet die Doppelung) — die erste steht
 * trotzdem darin, weil eine Id, an der die Lage ablesbar ist, in jedem
 * Debug-Blick die eigentliche Auskunft ist.
 */
export function rebarSpecs(
  layers: readonly ReinforcementLayer[] | undefined,
  vp: Viewport,
  style: Required<CrossSectionStyle>,
): readonly Spec[] {
  if (layers === undefined || layers.length === 0) return [];

  const children: ShapeSpec[] = [];
  for (const layer of layers) {
    for (const element of layer.elements) {
      children.push({
        kind: 'circle',
        id: `cross-section:rebar:${layer.id}:${element.id}`,
        center: worldPoint(element.y, element.z),
        radius: style.rebarRadiusPx / vp.scale,
        fillColor: style.rebarColor,
      });
    }
  }

  if (children.length === 0) return [];

  const group: GroupSpec = {
    kind: 'group',
    id: 'cross-section:rebar',
    layer: REBAR_LAYER,
    // Die Kinder tragen Weltkoordinaten, die Gruppe verschiebt nichts.
    position: worldPoint(0, 0),
    translation: worldPoint(0, 0),
    children,
  };
  return [group];
}
