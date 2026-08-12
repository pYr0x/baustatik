/**
 * DIE ERGEBNISSYMBOLE: Schwerpunkt, Schubmittelpunkt, Spannungspunkte.
 *
 * Alle drei kommen von aussen — der Viewer rechnet nichts. Der Aufrufer
 * entscheidet, wann eine Rechnung gilt, und verwirft ihre Ergebnisse bei
 * Geometrie- oder Policy-Aenderungen; dasselbe Muster wie die Auflagerkraefte
 * im FEM-Viewer. Es gibt deshalb auch keinen Sichtbarkeitsschalter: ein
 * Schalter neben der Ergebnisexistenz waere ein zweiter Zustand, der veralten
 * kann.
 *
 * DREI SICHTBARKEITSREGELN, JEDE AUS DEN DATEN:
 *
 *   Der SCHWERPUNKT wird gezeichnet, sobald `properties` da ist — `ys`/`zs`
 *   sind Pflichtfelder.
 *   Der SCHUBMITTELPUNKT nur, wenn `yM` UND `zM` bestimmt sind. `undefined`
 *   heisst „nicht ermittelt" und nicht „faellt mit dem Schwerpunkt zusammen";
 *   ein fehlender Wert wird weder als `0` noch als Schwerpunkt gedeutet.
 *   SPANNUNGSPUNKTE nur mit `properties`: ihre Koordinaten sind RELATIV zum
 *   Schwerpunkt und haben ohne ihn keinen absoluten Ort.
 *
 * EINE GRUPPE MIT GEORDNETEN KINDERN, keine drei Sorten top-level Specs. Das
 * macht die Ueberdeckung reproduzierbar — etwa wenn der letzte Spannungspunkt
 * genau im Schwerpunkt liegt — und nutzt den bestehenden geordneten
 * Kind-Reconciler, statt die Einfuegegeschichte wirken zu lassen.
 */

import type { SectionProperties, StressPoint } from '@baustatik/cross-section';
import type { GroupSpec, ShapeSpec, Spec } from '@baustatik/render-core';
import { convert } from '@baustatik/units';
import { type Viewport, worldPoint } from '@baustatik/viewport-2d';

import type { CrossSectionStyle } from './style';

export const SYMBOL_LAYER = 'symbols';

/**
 * Die EINE Umrechnung dieses Packages.
 *
 * `SectionProperties` liegt in SI-Metern (ADR 0024), die Welt des Viewers ist
 * Millimeter. `toExact` und nicht `to`: `to('mm')` rundet auf ganze
 * Millimeter, und ein Schwerpunkt bei `139,5 mm` landete als `140 mm` in der
 * Szene — sichtbar daneben, sobald man ihn an das Grid haelt. Ein Literal
 * `1000` waere dieselbe Zahl ohne den Namen, der sie erklaert.
 */
const M_TO_MM = convert(1).from('m').toExact('mm');

export function symbolSpecs(
  properties: SectionProperties | undefined,
  stressPoints: readonly StressPoint[] | undefined,
  vp: Viewport,
  style: Required<CrossSectionStyle>,
): readonly Spec[] {
  if (properties === undefined) return [];

  const ys = properties.ys * M_TO_MM;
  const zs = properties.zs * M_TO_MM;

  // FESTE REIHENFOLGE: Schwerpunkt, Schubmittelpunkt, Spannungspunkte nach
  // `nr`. Wer weiter hinten steht, liegt oben.
  const children: ShapeSpec[] = [
    {
      kind: 'circle',
      id: 'cross-section:symbol:centroid',
      center: worldPoint(ys, zs),
      // Screen-konstant: der Schwerpunkt ist ein ZEICHEN und hat keine
      // Ausdehnung. Geteilt durch `scale`, weil `radius` eine Weltgroesse ist.
      radius: style.centroidRadiusPx / vp.scale,
      fillColor: style.centroidColor,
    },
  ];

  const shearCentre = shearCentreSpec(properties, vp, style);
  if (shearCentre !== undefined) children.push(shearCentre);

  children.push(...stressPointSpecs(stressPoints, ys, zs, vp, style));

  const group: GroupSpec = {
    kind: 'group',
    id: 'cross-section:symbols',
    layer: SYMBOL_LAYER,
    // Die Kinder tragen Weltkoordinaten, die Gruppe verschiebt nichts: sie ist
    // hier die Klammer um eine Reihenfolge, keine Transformation.
    position: worldPoint(0, 0),
    translation: worldPoint(0, 0),
    children,
  };
  return [group];
}

function shearCentreSpec(
  properties: SectionProperties,
  vp: Viewport,
  style: Required<CrossSectionStyle>,
): ShapeSpec | undefined {
  const { yM, zM } = properties;
  // BEIDE oder keiner: eine halbe Lage ist keine Lage.
  if (yM === undefined || zM === undefined) return undefined;

  return {
    kind: 'circle',
    id: 'cross-section:symbol:shear-centre',
    // Im SELBEN System wie `ys`/`zs` — das ist die Invariante von
    // `SectionProperties`, und deshalb steht hier keine Verschiebung.
    center: worldPoint(yM * M_TO_MM, zM * M_TO_MM),
    radius: style.shearCentreRadiusPx / vp.scale,
    fillColor: style.shearCentreColor,
  };
}

function stressPointSpecs(
  stressPoints: readonly StressPoint[] | undefined,
  ys: number,
  zs: number,
  vp: Viewport,
  style: Required<CrossSectionStyle>,
): readonly ShapeSpec[] {
  if (stressPoints === undefined) return [];

  const size = style.stressPointSizePx / vp.scale;
  return (
    [...stressPoints]
      // Nach `nr` und nicht nach Arrayreihenfolge: die Ordnungsnummer ist die
      // fachliche Identitaet, aus der auch die ID faellt.
      .sort((a, b) => a.nr - b.nr)
      .map((point) => ({
        kind: 'rectangle',
        id: `cross-section:symbol:stress-point:${point.nr}`,
        // RELATIV ZUM SCHWERPUNKT, in mm — so definiert sie `StressPoint`. Der
        // absolute Ort entsteht erst hier, und nur hier.
        topLeft: worldPoint(ys + point.y - size / 2, zs + point.z - size / 2),
        width: size,
        height: size,
        fillColor: style.stressPointColor,
      }))
  );
}
