export type Point = { readonly y: number; readonly z: number };

export type Vector = { readonly dy: number; readonly dz: number };

export type Line = { readonly p1: Point; readonly p2: Point };

export type Polyline = { readonly points: Point[] };

export type Polygon = { readonly points: readonly Point[] };

export type Arc = {
  readonly center: Point;
  readonly radius: number;
  readonly startAngle: number;
  /**
   * Signed sweep angle in radians. Positive sweeps from `+y` towards `+z`,
   * which is clockwise as drawn (`z` points down); negative runs the other way.
   */
  readonly sweep: number;
};

export type BoundingBox = {
  readonly min: Point;
  readonly max: Point;
};

export interface Transformable<T> {
  translate(shape: T, vector: Vector): T;
  rotate(shape: T, angle: number, origin?: Point): T;
  mirror(shape: T, axisP1: Point, axisP2: Point): T;
}
