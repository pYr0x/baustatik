import { DegenerateVectorError } from './errors';
import type { Point } from './point';

export type Vector = { readonly dx: number; readonly dy: number };

export const Vector = {
  make: (dx: number, dy: number): Vector => ({ dx, dy }),
  fromPoints: (a: Point, b: Point): Vector => ({
    dx: b.x - a.x,
    dy: b.y - a.y,
  }),
  length: (v: Vector): number => Math.sqrt(v.dx ** 2 + v.dy ** 2),
  normalize: (v: Vector): Vector => {
    const len = Vector.length(v);
    if (len < 1e-14) throw new DegenerateVectorError();
    return { dx: v.dx / len, dy: v.dy / len };
  },
  add: (a: Vector, b: Vector): Vector => ({ dx: a.dx + b.dx, dy: a.dy + b.dy }),
  subtract: (a: Vector, b: Vector): Vector => ({
    dx: a.dx - b.dx,
    dy: a.dy - b.dy,
  }),
  scale: (v: Vector, factor: number): Vector => ({
    dx: v.dx * factor,
    dy: v.dy * factor,
  }),
  negate: (v: Vector): Vector => ({ dx: -v.dx, dy: -v.dy }),
  dot: (a: Vector, b: Vector): number => a.dx * b.dx + a.dy * b.dy,
  cross: (a: Vector, b: Vector): number => a.dx * b.dy - a.dy * b.dx,
  angle: (v: Vector): number => Math.atan2(v.dy, v.dx),
  rotate: (v: Vector, angle: number): Vector => ({
    dx: v.dx * Math.cos(angle) - v.dy * Math.sin(angle),
    dy: v.dx * Math.sin(angle) + v.dy * Math.cos(angle),
  }),
  perpendicular: (v: Vector): Vector => ({ dx: -v.dy, dy: v.dx }),
};
