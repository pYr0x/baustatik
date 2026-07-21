import type Konva from 'konva';

// strokeStyle steht am gemeinsamen Stroke-Interface von render-core und gilt fuer
// ALLE Primitives. Deshalb liegt die Uebersetzung hier zentral, nicht pro Shape.
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';

// Strichbilder in SCREEN-Pixeln. Der Adapter setzt durchgaengig
// strokeScaleEnabled:false; Konva setzt den Transform vor setLineDash auf
// Identitaet, damit sind dash UND strokeWidth zoom-invariant.
export const DASH_PATTERNS = {
  solid: undefined,
  dashed: [8, 4],
  dotted: [1, 3],
} as const satisfies Record<StrokeStyle, readonly number[] | undefined>;

interface StrokeInput {
  readonly strokeColor?: string;
  readonly strokeWidth?: number;
  readonly strokeStyle?: StrokeStyle;
}

// Gemeinsame Stroke-Felder fuer jedes Primitive. undefined wird BEWUSST
// durchgereicht: derselbe Wert speist build (new Konva.X) und patch (setAttrs),
// deshalb muss undefined einen Wert zuruecksetzen koennen (dashed -> solid).
export function strokeConfig(spec: StrokeInput): Konva.ShapeConfig {
  const pattern = DASH_PATTERNS[spec.strokeStyle ?? 'solid'];
  return {
    stroke: spec.strokeColor,
    strokeWidth: spec.strokeWidth,
    strokeScaleEnabled: false,
    dash: pattern === undefined ? undefined : [...pattern],
  };
}
