import {
  assertNever,
  type PrimitiveSpec,
  type ShapeSpec,
} from '@baustatik/render-core';
import Konva from 'konva';
import { arcPathConfig, arcPathData } from './arc-path';
import { arrowConfig } from './arrow';
import { circleConfig } from './circle';
import {
  buildLabel,
  labelTagConfig,
  labelTextConfig,
  labelTopLeft,
  patchLabel,
} from './label';
import { lineConfig } from './line';
import { polygonConfig } from './polygon';
import { rectangleConfig } from './rectangle';
import { triangleConfig } from './triangle';

export {
  arcPathConfig,
  arcPathData,
  arrowConfig,
  circleConfig,
  labelTagConfig,
  labelTextConfig,
  labelTopLeft,
  lineConfig,
  polygonConfig,
  rectangleConfig,
  triangleConfig,
};

/**
 * Die Knoten, die ein Primitive erzeugen kann. `Konva.Label` ist als einziges
 * KEINE `Konva.Shape`, sondern eine Gruppe aus Tag und Text — deshalb steht hier
 * eine Union statt `Konva.Shape`.
 */
export type LeafNode = Konva.Shape | Konva.Label;

// configFor und buildPrimitive schalten bewusst BEIDE ueber spec.kind: nur so
// bekommt jeder Konva-Konstruktor seinen passend typisierten Config-Typ, ohne
// Cast. Auseinanderlaufen koennen sie nicht — beide enden in assertNever, ein
// neues Spec-Kind erzeugt deshalb in beiden Schaltern einen Compile-Fehler.

// Einzige Quelle fuer die Konva-Felder eines Primitives. build UND patch lesen
// dieselbe Config, deshalb koennen sie nicht auseinanderlaufen. Das Label faellt
// heraus: es ist zusammengesetzt und hat seine eigenen zwei Configs.
function configFor(spec: ShapeSpec): Konva.ShapeConfig {
  switch (spec.kind) {
    case 'line':
      return lineConfig(spec);
    case 'circle':
      return circleConfig(spec);
    case 'polygon':
      return polygonConfig(spec);
    case 'rectangle':
      return rectangleConfig(spec);
    case 'triangle':
      return triangleConfig(spec);
    case 'arrow':
      return arrowConfig(spec);
    case 'arcPath':
      return arcPathConfig(spec);
    default:
      return assertNever(spec);
  }
}

// Einzige Stelle im Package mit `new Konva.X` — ausser `label.ts`, das seine
// drei Knoten (Label, Tag, Text) selbst baut, weil sie zusammengehoeren.
export function buildPrimitive(spec: PrimitiveSpec): LeafNode {
  switch (spec.kind) {
    case 'line':
      return new Konva.Line(lineConfig(spec));
    case 'circle':
      return new Konva.Circle(circleConfig(spec));
    case 'polygon':
      return new Konva.Line(polygonConfig(spec));
    case 'rectangle':
      return new Konva.Rect(rectangleConfig(spec));
    case 'triangle':
      return new Konva.RegularPolygon(triangleConfig(spec));
    case 'arrow':
      return new Konva.Arrow(arrowConfig(spec));
    case 'arcPath':
      return new Konva.Path(arcPathConfig(spec));
    case 'label':
      return buildLabel(spec);
    default:
      return assertNever(spec);
  }
}

// setAttrs setzt jedes Config-Feld — auch undefined. Damit gleicht der Patch
// exakt dem Neubau, und ein weggefallener Wert (z.B. dashed -> solid) wird
// zurueckgesetzt statt eingefroren.
//
// Das Label braucht einen eigenen Pfad: Tag und Text tragen die Felder, und die
// Box muss nach dem Textwechsel neu vermessen und versetzt werden. Der Cast ist
// sicher, weil der Reconciler nur bei GLEICHEM `kind` patcht.
export function patchPrimitive(node: LeafNode, spec: PrimitiveSpec): void {
  if (spec.kind === 'label') {
    patchLabel(node as Konva.Label, spec);
    return;
  }
  (node as Konva.Shape).setAttrs(configFor(spec));
}
