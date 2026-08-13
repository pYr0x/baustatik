/**
 * Die SZENE: gespeicherte Geometrie und von aussen gelieferte Ergebnisse zu
 * einer Spec-Liste zusammengesetzt.
 *
 * Diese Datei komponiert nur. Was eine Wand zeichnet, steht in
 * `thin-walls.ts`; der Umriss in `outlines.ts`; das Netz in `fe.ts`; die
 * Ergebnispunkte in `symbols.ts`. Kein Driver, kein Konva, kein Zustand —
 * deshalb in Node testbar.
 *
 * DER VIEWER LEITET NICHTS AB: weder einen Umriss noch ein Netz noch
 * Querschnittswerte. Was er zeichnet, hat jemand anders gerechnet und
 * mitgegeben.
 *
 * DIE ARRAYREIHENFOLGE FOLGT LESBAR DEN BAENDERN, garantiert wird die z-Order
 * aber von `CROSS_SECTION_LAYERS`, die der Driver beim Aufbau bekommt.
 */

import type {
  SectionGeometry,
  SectionPolicy,
  SectionProperties,
  StressPoint,
} from '@baustatik/cross-section';
import type { Spec } from '@baustatik/render-core';
import type { Viewport } from '@baustatik/viewport-2d';

import { type CrossSectionFEMesh, feSpecs } from './fe';
import { outlineSpecs } from './outlines';
import { type CrossSectionStyle, DEFAULT_STYLE } from './style';
import { symbolSpecs } from './symbols';
import { thinWallSpecs } from './thin-walls';

// EIN Optionsobjekt statt Positionsparametern: sonst stuenden drei optionale
// Ergebnisse in Folge nebeneinander, und ein vertauschtes Paar fiele an keiner
// Typgrenze auf.
export interface CrossSectionSceneOptions {
  readonly geometry: SectionGeometry;
  /**
   * Aus DEMSELBEN Satz wie die Geometrie
   * ([ADR 0033](../../../docs/adr/0033-the-cross-section-has-a-creation-policy.md)).
   *
   * `discretisationTolerance` entscheidet mit, welche Kante ueberhaupt als Bogen
   * gezeichnet wird, und sie steht seit `schemaVersion: 7` im selben Satz wie
   * der Umriss daneben. Eine Modulkonstante zoege die Toleranz aus einer
   * anderen Quelle als den Satz.
   */
  readonly sectionPolicy: SectionPolicy;
  readonly viewport: Viewport;
  /** Weggelassen = noch nicht gerechnet, und dann steht kein Symbol im Bild. */
  readonly properties?: SectionProperties;
  readonly stressPoints?: readonly StressPoint[];
  readonly feMesh?: CrossSectionFEMesh;
  readonly style?: CrossSectionStyle;
}

export function crossSectionSpecs(
  options: CrossSectionSceneOptions,
): readonly Spec[] {
  const {
    geometry,
    sectionPolicy,
    viewport: vp,
    properties,
    stressPoints,
    feMesh,
    style,
  } = options;

  // EINMAL aufgeloest und an alle Lagen durchgereicht: sonst haetten Waende,
  // Umriss, Netz und Symbole je eigene Vorgaben, und ein Aufrufer-Override
  // wirkte nur auf einem Viertel.
  const resolved = { ...DEFAULT_STYLE, ...style };

  return [
    ...thinWallSpecs(
      geometry,
      sectionPolicy.discretisationTolerance,
      vp,
      resolved,
    ),
    ...outlineSpecs(geometry, resolved),
    ...feSpecs(feMesh, resolved),
    ...symbolSpecs(properties, stressPoints, vp, resolved),
  ];
}
