import { Line as GeometryLine } from '@baustatik/geometry-2d';
import {
  fromXYLine,
  fromXYPoint,
  fromXYVector,
  toXYLine,
  toXYPoint,
  toXYVector,
} from './convert';
import type {
  Point,
  Line as SectionLine,
  Transformable,
  Vector,
} from './types';

export const Line: Transformable<SectionLine> & {
  make(p1: Point, p2: Point): SectionLine;
  length(line: SectionLine): number;
  midpoint(line: SectionLine): Point;
  direction(line: SectionLine): Vector;
  normalVector(line: SectionLine): Vector;
  extend(line: SectionLine, startDelta: number, endDelta: number): SectionLine;
  parallel(line: SectionLine, distance: number): SectionLine;
  split(line: SectionLine, point: Point): [SectionLine, SectionLine];
  closestPoint(line: SectionLine, point: Point): Point;
  distanceToPoint(line: SectionLine, point: Point): number;
  intersect(a: SectionLine, b: SectionLine): Point | null;
  intersectSegment(a: SectionLine, b: SectionLine): Point | null;
  isParallel(a: SectionLine, b: SectionLine, tolerance?: number): boolean;
  isPerpendicular(a: SectionLine, b: SectionLine, tolerance?: number): boolean;
  angle(a: SectionLine, b: SectionLine): number;
} = {
  make: (p1, p2) => ({ p1, p2 }),

  length: (line) => GeometryLine.length(toXYLine(line)),

  midpoint: (line) => fromXYPoint(GeometryLine.midpoint(toXYLine(line))),

  direction: (line) => fromXYVector(GeometryLine.direction(toXYLine(line))),

  normalVector: (line) =>
    fromXYVector(GeometryLine.normalVector(toXYLine(line))),

  extend: (line, startDelta, endDelta) =>
    fromXYLine(GeometryLine.extend(toXYLine(line), startDelta, endDelta)),

  parallel: (line, distance) =>
    fromXYLine(GeometryLine.parallel(toXYLine(line), distance)),

  split: (line, point) => {
    const [first, second] = GeometryLine.split(
      toXYLine(line),
      toXYPoint(point),
    );
    return [fromXYLine(first), fromXYLine(second)];
  },

  closestPoint: (line, point) =>
    fromXYPoint(GeometryLine.closestPoint(toXYLine(line), toXYPoint(point))),

  distanceToPoint: (line, point) =>
    GeometryLine.distanceToPoint(toXYLine(line), toXYPoint(point)),

  intersect: (a, b) => {
    const result = GeometryLine.intersect(toXYLine(a), toXYLine(b));
    return result ? fromXYPoint(result) : null;
  },

  intersectSegment: (a, b) => {
    const result = GeometryLine.intersectSegment(toXYLine(a), toXYLine(b));
    return result ? fromXYPoint(result) : null;
  },

  isParallel: (a, b, tolerance = 1e-10) =>
    GeometryLine.isParallel(toXYLine(a), toXYLine(b), tolerance),

  isPerpendicular: (a, b, tolerance = 1e-10) =>
    GeometryLine.isPerpendicular(toXYLine(a), toXYLine(b), tolerance),

  angle: (a, b) => GeometryLine.angle(toXYLine(a), toXYLine(b)),

  translate: (line, vector) =>
    fromXYLine(GeometryLine.translate(toXYLine(line), toXYVector(vector))),

  rotate: (line, angle, origin) =>
    fromXYLine(
      GeometryLine.rotate(
        toXYLine(line),
        angle,
        origin ? toXYPoint(origin) : undefined,
      ),
    ),

  mirror: (line, axisP1, axisP2) =>
    fromXYLine(
      GeometryLine.mirror(toXYLine(line), toXYPoint(axisP1), toXYPoint(axisP2)),
    ),
};
