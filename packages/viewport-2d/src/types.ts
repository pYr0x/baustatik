export type WorldPoint = { readonly u: number; readonly v: number };
export type ScreenPoint = { readonly x: number; readonly y: number };

export type Viewport = {
  readonly origin: ScreenPoint;
  readonly scale: number;
};
