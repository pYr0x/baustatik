/**
 * Der ABGELEITETE UMRISS — mitgefuehrt, nicht nachgerechnet.
 *
 * Er kommt fertig aus dem Satz: bereits diskretisiert, mit den Rundungen, und
 * er stimmt mit den Zahlen ueberein, aus denen `A`, `Iy` und `Iz` fallen —
 * genau dafuer reist er mit (ADR 0030). Der Viewer rechnet ihn nicht nach;
 * taete er es, gaebe es zwei Umrisse und einen Streit darueber, welcher gilt.
 *
 * ORANGE, WEIL ABGELEITET. Wer eine Kerbe am Grad-3-Knoten oder einen gekappten
 * Miter-Spitz sehen will, muss Eingabe und Ergebnis unterscheiden koennen — in
 * Schwarz auf Schwarz sieht man genau das nicht (ADR 0037).
 */

import type { SectionGeometry } from '@baustatik/cross-section';
import type { Spec } from '@baustatik/render-core';
import { worldPoint } from '@baustatik/viewport-2d';

import type { CrossSectionStyle } from './style';

export const OUTLINE_LAYER = 'outlines';

export function outlineSpecs(
  geometry: SectionGeometry,
  style: Required<CrossSectionStyle>,
): readonly Spec[] {
  return (
    [...geometry.outline.entries()]
      // Ein Polygon unter drei Punkten traegt keine Flaeche, und `render-core`
      // weist es zu Recht zurueck. Das Gate laesst es trotzdem durch: es fehlt
      // erst, wenn KEIN Polygon traegt — waehrend der Eingabe ist ein halb
      // gezogener Ring der Normalfall. Dieselbe Haltung wie bei den Waenden:
      // wer ein unfertiges Modell zeichnet, soll den Rest davon sehen.
      .filter(([, polygon]) => polygon.points.length >= 3)
      // DIE ID TRAEGT DEN RINGINDEX, nicht die Position in der gefilterten
      // Liste: waere Ring 0 waehrend der Eingabe kurz entartet, bekaeme jeder
      // folgende Ring eine neue ID — und der Reconciler baute Frame fuer Frame
      // Shapes ab und wieder auf, die sich gar nicht geaendert haben.
      .map(([index, polygon]) => ({
        kind: 'polygon',
        id: `cross-section:outline:${index}`,
        layer: OUTLINE_LAYER,
        closed: true,
        // EINZIGE Stelle des y/z -> u/v Mappings dieser Lage.
        points: polygon.points.map((p) => worldPoint(p.y, p.z)),
        strokeWidth: style.outlineWidthPx,
        strokeColor: style.outlineColor,
      }))
  );
}
