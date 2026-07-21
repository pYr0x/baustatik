import type { WorldPoint } from '@baustatik/viewport-2d';

interface SpecBase {
  readonly id: string; // unique ID, reconcile()
  // Zeichenband (paint band). Welche Namen es gibt und in welcher Reihenfolge
  // sie gemalt werden, legt der Driver fest — render-core bleibt neutral.
  // Baender vergroebern die Array-Reihenfolge: zwischen Baendern gewinnt die
  // Band-Reihenfolge, innerhalb eines Bandes gilt die Array-Reihenfolge.
  readonly layer?: string;
}

interface Stroke {
  readonly strokeColor?: string;
  readonly strokeWidth?: number;
  readonly strokeStyle?: 'solid' | 'dashed' | 'dotted';
}

// Gemeinsames Vokabular fuer ALLES, das eine Flaeche hat.
interface Filled {
  readonly fillColor?: string;
}

export interface LineSpec extends SpecBase, Stroke {
  readonly kind: 'line';
  readonly from: WorldPoint;
  readonly to: WorldPoint;
}

export interface CircleSpec extends SpecBase, Stroke, Filled {
  readonly kind: 'circle';
  readonly center: WorldPoint;
  readonly radius: number;
}

export interface PolygonSpec extends SpecBase, Stroke, Filled {
  readonly kind: 'polygon';
  readonly points: readonly WorldPoint[];
  readonly closed: boolean;
}

export interface RectangleSpec extends SpecBase, Stroke, Filled {
  readonly kind: 'rectangle';
  readonly topLeft: WorldPoint;
  readonly width: number;
  readonly height: number;
  readonly cornerRadius?: number[];
}

export interface TriangleSpec extends SpecBase, Stroke, Filled {
  readonly kind: 'triangle';
  readonly center: WorldPoint;
  readonly sideLength: number;
}

export type PrimitiveSpec =
  | LineSpec
  | CircleSpec
  | PolygonSpec
  | RectangleSpec
  | TriangleSpec;

export interface GroupSpec extends SpecBase {
  readonly kind: 'group';
  // Weltposition des Gruppenankers. Der Adapter legt diesen Punkt auf x/y.
  readonly position: WorldPoint;
  // Sichtbare Verschiebung relativ zum Anker. Der Konva-Adapter uebersetzt sie
  // auf die inverse offsetX/offsetY-Semantik von Konva.
  readonly translation: WorldPoint;
  readonly rotationDeg?: number;
  readonly children: readonly PrimitiveSpec[];
}

export type Spec = PrimitiveSpec | GroupSpec;
