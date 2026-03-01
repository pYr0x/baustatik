import { DegenerateAxisError } from './errors';
import type { Transformable } from './types';

export type Point = { readonly x: number; readonly y: number };

export const Point: Transformable<Point> & {
  make(x: number, y: number): Point;
  distance(a: Point, b: Point): number;
  equals(a: Point, b: Point, tolerance?: number): boolean;
} = {
  make: (x, y) => ({ x, y }),
  distance: (a, b) => Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2),
  equals: (a, b, tolerance = 1e-10) =>
    Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance,
  translate: (p, v) => ({ x: p.x + v.dx, y: p.y + v.dy }),
  rotate: (p, angle, origin = { x: 0, y: 0 }) => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = p.x - origin.x;
    const dy = p.y - origin.y;
    return {
      x: origin.x + dx * cos - dy * sin,
      y: origin.y + dx * sin + dy * cos,
    };
  },
  mirror: (p, axisP1, axisP2) => {
    const dx = axisP2.x - axisP1.x;
    const dy = axisP2.y - axisP1.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-14) throw new DegenerateAxisError();
    const t = ((p.x - axisP1.x) * dx + (p.y - axisP1.y) * dy) / lenSq;
    return {
      x: 2 * (axisP1.x + t * dx) - p.x,
      y: 2 * (axisP1.y + t * dy) - p.y,
    };
  },
};
