import { assertNever, type PrimitiveSpec } from '@baustatik/render-core';
import Konva from 'konva';
import { circleConfig } from './circle';
import { lineConfig } from './line';
import { polygonConfig } from './polygon';
import { rectangleConfig } from './rectangle';
import { triangleConfig } from './triangle';

export {
  circleConfig,
  lineConfig,
  polygonConfig,
  rectangleConfig,
  triangleConfig,
};

// configFor und buildPrimitive schalten bewusst BEIDE ueber spec.kind: nur so
// bekommt jeder Konva-Konstruktor seinen passend typisierten Config-Typ, ohne
// Cast. Auseinanderlaufen koennen sie nicht — beide enden in assertNever, ein
// neues Spec-Kind erzeugt deshalb in beiden Schaltern einen Compile-Fehler.

// Einzige Quelle fuer die Konva-Felder eines Primitives. build UND patch lesen
// dieselbe Config, deshalb koennen sie nicht auseinanderlaufen.
function configFor(spec: PrimitiveSpec): Konva.ShapeConfig {
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
    default:
      return assertNever(spec);
  }
}

// Einzige Stelle im Package mit `new Konva.X`.
export function buildPrimitive(spec: PrimitiveSpec): Konva.Shape {
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
    default:
      return assertNever(spec);
  }
}

// setAttrs setzt jedes Config-Feld — auch undefined. Damit gleicht der Patch
// exakt dem Neubau, und ein weggefallener Wert (z.B. dashed -> solid) wird
// zurueckgesetzt statt eingefroren.
export function patchPrimitive(shape: Konva.Shape, spec: PrimitiveSpec): void {
  shape.setAttrs(configFor(spec));
}
