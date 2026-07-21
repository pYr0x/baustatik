export type WorldPoint = { readonly u: number; readonly v: number };
export type ScreenPoint = { readonly x: number; readonly y: number };

export type Viewport = {
  readonly origin: ScreenPoint;
  readonly scale: number;
};

// Groesse einer Zeichenflaeche in Pixeln.
export type Size = { readonly width: number; readonly height: number };

// Sichtbarer Weltausschnitt (achsenparallel).
export type WorldBounds = {
  readonly minU: number;
  readonly minV: number;
  readonly maxU: number;
  readonly maxV: number;
};
