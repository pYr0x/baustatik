export type Point = { readonly x: number; readonly z: number };

export type Vector = { readonly dx: number; readonly dz: number };

export type Line = { readonly p1: Point; readonly p2: Point };

export type Polyline = { readonly points: Point[] };

export type Polygon = { readonly points: Point[] };

export type BoundingBox = {
  readonly min: Point;
  readonly max: Point;
};

export interface Transformable<T> {
  translate(shape: T, vector: Vector): T;
  rotate(shape: T, angle: number, origin?: Point): T;
  mirror(shape: T, axisP1: Point, axisP2: Point): T;
}
