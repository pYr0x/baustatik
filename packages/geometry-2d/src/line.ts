import { Point } from './point'
import { Vector } from './vector'
import { closestPointOnSegment, type Transformable } from './types'

export type Line = { readonly p1: Point; readonly p2: Point }

export const Line: Transformable<Line> & {
  make(p1: Point, p2: Point): Line
  length(line: Line): number
  midpoint(line: Line): Point
  direction(line: Line): Vector
  normalVector(line: Line): Vector
  extend(line: Line, startDelta: number, endDelta: number): Line
  parallel(line: Line, distance: number): Line
  split(line: Line, point: Point): [Line, Line]
  closestPoint(line: Line, p: Point): Point
  distanceToPoint(line: Line, p: Point): number
  intersect(a: Line, b: Line): Point | null
  intersectSegment(a: Line, b: Line): Point | null
  isParallel(a: Line, b: Line, tolerance?: number): boolean
  isPerpendicular(a: Line, b: Line, tolerance?: number): boolean
  angle(a: Line, b: Line): number
} = {
  make: (p1, p2) => ({ p1, p2 }),
  length: (line) => Point.distance(line.p1, line.p2),
  midpoint: (line) => Point.make((line.p1.x + line.p2.x) / 2, (line.p1.y + line.p2.y) / 2),
  direction: (line) => Vector.normalize(Vector.fromPoints(line.p1, line.p2)),
  normalVector: (line) => Vector.perpendicular(Line.direction(line)),
  extend: (line, startDelta, endDelta) => {
    const dir = Line.direction(line)
    return {
      p1: Point.translate(line.p1, Vector.scale(dir, -startDelta)),
      p2: Point.translate(line.p2, Vector.scale(dir, endDelta)),
    }
  },
  parallel: (line, distance) => Line.translate(line, Vector.scale(Line.normalVector(line), distance)),
  split: (line, point) => [Line.make(line.p1, point), Line.make(point, line.p2)],
  closestPoint: (line, p) => closestPointOnSegment(line.p1, line.p2, p),
  distanceToPoint: (line, p) => Point.distance(p, Line.closestPoint(line, p)),
  intersect: (a, b) => {
    const dx1 = a.p2.x - a.p1.x
    const dy1 = a.p2.y - a.p1.y
    const dx2 = b.p2.x - b.p1.x
    const dy2 = b.p2.y - b.p1.y
    const denom = dx1 * dy2 - dy1 * dx2
    if (Math.abs(denom) < 1e-10) return null
    const t = ((b.p1.x - a.p1.x) * dy2 - (b.p1.y - a.p1.y) * dx2) / denom
    return Point.make(a.p1.x + t * dx1, a.p1.y + t * dy1)
  },
  intersectSegment: (a, b) => {
    const dx1 = a.p2.x - a.p1.x
    const dy1 = a.p2.y - a.p1.y
    const dx2 = b.p2.x - b.p1.x
    const dy2 = b.p2.y - b.p1.y
    const denom = dx1 * dy2 - dy1 * dx2
    if (Math.abs(denom) < 1e-10) return null
    const t = ((b.p1.x - a.p1.x) * dy2 - (b.p1.y - a.p1.y) * dx2) / denom
    const u = ((b.p1.x - a.p1.x) * dy1 - (b.p1.y - a.p1.y) * dx1) / denom
    if (t < 0 || t > 1 || u < 0 || u > 1) return null
    return Point.make(a.p1.x + t * dx1, a.p1.y + t * dy1)
  },
  isParallel: (a, b, tolerance = 1e-10) =>
    Math.abs(Vector.cross(Line.direction(a), Line.direction(b))) < tolerance,
  isPerpendicular: (a, b, tolerance = 1e-10) =>
    Math.abs(Vector.dot(Line.direction(a), Line.direction(b))) < tolerance,
  angle: (a, b) =>
    Math.acos(Math.max(-1, Math.min(1, Vector.dot(Line.direction(a), Line.direction(b))))),
  translate: (line, v) => ({ p1: Point.translate(line.p1, v), p2: Point.translate(line.p2, v) }),
  rotate: (line, angle, origin) => ({
    p1: Point.rotate(line.p1, angle, origin),
    p2: Point.rotate(line.p2, angle, origin),
  }),
  mirror: (line, axisP1, axisP2) => ({
    p1: Point.mirror(line.p1, axisP1, axisP2),
    p2: Point.mirror(line.p2, axisP1, axisP2),
  }),
}
