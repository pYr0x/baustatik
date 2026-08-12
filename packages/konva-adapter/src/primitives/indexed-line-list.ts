import type { IndexedLineListSpec } from '@baustatik/render-core';
import type Konva from 'konva';
import { strokeConfig } from '../stroke';

/**
 * Der Streckensatz — das einzige Primitive mit einer eigenen `sceneFunc`.
 *
 * WARUM KEINE KONVA-FORM PASST: `Konva.Line` zieht ihre Punkte zu EINEM
 * Linienzug zusammen, und genau das darf hier nicht passieren. Ein Streckensatz
 * besteht aus unabhaengigen Kanten; zwischen zwei von ihnen gehoert keine
 * Verbindungslinie. Eine `Konva.Line` je Kante waere die Alternative, und sie
 * ist der Grund, warum es diesen Spec ueberhaupt gibt: bei einigen tausend
 * Kanten sind das ebenso viele Konva-Knoten.
 *
 * EIN `beginPath()`, JE STRECKE EIN `moveTo()`, EIN `strokeShape()`. Das
 * `moveTo` beginnt jedes Mal einen getrennten Teilpfad — ohne es zoege der
 * Canvas eine Linie vom Ende der einen zum Anfang der naechsten Kante.
 * `strokeShape` uebernimmt Farbe, Dash, Hit-Canvas und die Regel fuer
 * screen-konstante Striche; der Adapter setzt sie also nicht selbst.
 */
function indexedLineListSceneFunc(
  spec: IndexedLineListSpec,
): (context: Konva.Context, shape: Konva.Shape) => void {
  return (context, shape) => {
    const { indices, points } = spec;
    context.beginPath();
    // Schrittweite zwei: `indices` traegt Indexpaare, `points` Koordinatenpaare.
    for (let i = 0; i + 1 < indices.length; i += 2) {
      const from = indices[i] * 2;
      const to = indices[i + 1] * 2;
      context.moveTo(points[from], points[from + 1]);
      context.lineTo(points[to], points[to + 1]);
    }
    context.strokeShape(shape);
  };
}

/**
 * Neutrale `IndexedLineListSpec` -> `Konva.ShapeConfig`. Rein wie jede andere
 * `*Config`: die `sceneFunc` schliesst die Puffer der aktuellen Spec ein, und
 * ein Patch setzt ueber `setAttrs` eine neue auf dieselbe `Konva.Shape`.
 */
export function indexedLineListConfig(
  spec: IndexedLineListSpec,
): Konva.ShapeConfig {
  return {
    id: spec.id,
    sceneFunc: indexedLineListSceneFunc(spec),
    ...strokeConfig(spec),
  };
}
