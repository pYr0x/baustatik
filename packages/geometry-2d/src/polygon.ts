import { atOrThrow } from '@baustatik/core';
import { diff, intersection, union } from 'martinez-polygon-clipping';
import { DiscontinuousLinesError, InvalidPolygonError } from './errors';
import type { Line } from './line';
import { Point } from './point';
import type { BoundingBox, Transformable } from './types';

export type Polygon = { readonly points: Point[] };

type MartinezCoord = [number, number];
type MartinezRing = MartinezCoord[];
type MartinezPoly = MartinezRing[];

const toMartinez = (poly: Polygon): MartinezPoly => {
  const ring: MartinezRing = poly.points.map((p) => [p.x, p.y]);
  ring.push(atOrThrow(ring, 0));
  return [ring];
};

const signedArea = (points: Point[]): number => {
  let area = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area +=
      atOrThrow(points, i).x * atOrThrow(points, j).y -
      atOrThrow(points, j).x * atOrThrow(points, i).y;
  }
  return area / 2;
};

const fromMartinez = (result: unknown): Polygon[] => {
  if (!result || !Array.isArray(result)) return [];
  return (result as MartinezPoly[]).flatMap((poly) => {
    const ring = atOrThrow(poly, 0);
    const points = ring.slice(0, -1).map(([x, y]) => Point.make(x, y));
    return [Polygon.make(points)];
  });
};

export const Polygon: Transformable<Polygon> & {
  make(points: Point[]): Polygon;
  fromLines(lines: Line[]): Polygon;
  area(polygon: Polygon): number;
  centroid(polygon: Polygon): Point;
  perimeter(polygon: Polygon): number;
  contains(polygon: Polygon, p: Point): boolean;
  isClockwise(polygon: Polygon): boolean;
  toClockwise(polygon: Polygon): Polygon;
  toCounterClockwise(polygon: Polygon): Polygon;
  intersect(a: Polygon, b: Polygon): Polygon[];
  union(a: Polygon, b: Polygon): Polygon[];
  subtract(a: Polygon, b: Polygon): Polygon[];
  boundingBox(polygon: Polygon): BoundingBox;
} = {
  make: (points) => {
    if (points.length < 3)
      throw new InvalidPolygonError('weniger als 3 Punkte');
    return signedArea(points) < 0
      ? { points: [...points].reverse() }
      : { points };
  },

  fromLines: (lines) => {
    if (lines.length < 3)
      throw new InvalidPolygonError(
        'weniger als 3 Linien fuer ein Polygon noetig',
      );

    const points: Point[] = [atOrThrow(lines, 0).p1];
    for (let i = 0; i < lines.length; i++) {
      if (
        i > 0 &&
        !Point.equals(
          atOrThrow(points, points.length - 1),
          atOrThrow(lines, i).p1,
        )
      ) {
        throw new DiscontinuousLinesError(i - 1);
      }
      points.push(atOrThrow(lines, i).p2);
    }

    if (
      !Point.equals(atOrThrow(points, points.length - 1), atOrThrow(points, 0))
    ) {
      throw new InvalidPolygonError('Linien bilden keinen geschlossenen Zug');
    }

    return Polygon.make(points.slice(0, -1));
  },

  area: (poly) => Math.abs(signedArea(poly.points)),

  centroid: (poly) => {
    const n = poly.points.length;
    let cx = 0;
    let cy = 0;
    const a = signedArea(poly.points);

    if (Math.abs(a) < 1e-14) return atOrThrow(poly.points, 0);

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const xj = atOrThrow(poly.points, j).x;
      const yj = atOrThrow(poly.points, j).y;
      const cross =
        atOrThrow(poly.points, i).x * yj - xj * atOrThrow(poly.points, i).y;
      cx += (atOrThrow(poly.points, i).x + xj) * cross;
      cy += (atOrThrow(poly.points, i).y + yj) * cross;
    }

    return Point.make(cx / (6 * a), cy / (6 * a));
  },

  perimeter: (poly) => {
    const pts = poly.points;
    let total = 0;
    for (let i = 0; i < pts.length; i++) {
      total += Point.distance(
        atOrThrow(pts, i),
        atOrThrow(pts, (i + 1) % pts.length),
      );
    }
    return total;
  },

  contains: (poly, p) => {
    let inside = false;
    const pts = poly.points;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const ptI = atOrThrow(pts, i);
      const ptJ = atOrThrow(pts, j);
      const xi = ptI.x;
      const yi = ptI.y;
      const xj = ptJ.x;
      const yj = ptJ.y;
      if (
        yi > p.y !== yj > p.y &&
        p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi
      ) {
        inside = !inside;
      }
    }
    return inside;
  },

  isClockwise: (poly) => signedArea(poly.points) < 0,

  toClockwise: (poly) =>
    Polygon.isClockwise(poly) ? poly : { points: [...poly.points].reverse() },

  toCounterClockwise: (poly) =>
    !Polygon.isClockwise(poly) ? poly : { points: [...poly.points].reverse() },

  intersect: (a, b) => fromMartinez(intersection(toMartinez(a), toMartinez(b))),
  union: (a, b) => fromMartinez(union(toMartinez(a), toMartinez(b))),
  subtract: (a, b) => fromMartinez(diff(toMartinez(a), toMartinez(b))),

  boundingBox: (poly) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const p of poly.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    return { min: Point.make(minX, minY), max: Point.make(maxX, maxY) };
  },

  translate: (poly, v) => ({
    points: poly.points.map((p) => Point.translate(p, v)),
  }),
  rotate: (poly, angle, origin) => ({
    points: poly.points.map((p) => Point.rotate(p, angle, origin)),
  }),
  mirror: (poly, axisP1, axisP2) => {
    const mirrored = poly.points.map((p) => Point.mirror(p, axisP1, axisP2));
    return signedArea(mirrored) < 0
      ? { points: [...mirrored].reverse() }
      : { points: mirrored };
  },
};
