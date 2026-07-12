import type { WorldPoint } from '@baustatik/viewport-2d';

interface SpecBase {
  readonly id: string; // unique ID, reconcile()
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

export interface TriangleSpec extends SpecBase, Stroke, Filled {
  readonly kind: 'triangle';
  readonly center: WorldPoint;
  readonly sideLength: number;
}

export type Spec = LineSpec | CircleSpec | PolygonSpec | TriangleSpec;
