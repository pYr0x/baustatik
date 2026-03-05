import { Arc as GeometryArc } from '@baustatik/geometry-2d';
import {
  fromXYArc,
  fromXYPoint,
  fromXYPolyline,
  fromXYVector,
  normalizeAngleYZ,
  toXYArc,
  toXYLine,
  toXYPoint,
  toXYVector,
} from './convert';
import type {
  Line,
  Point,
  Polyline,
  Arc as SectionArc,
  Transformable,
  Vector,
} from './types';

type ToPolylineOptions = { segments: number } | { tolerance: number };

export const Arc: Transformable<SectionArc> & {
  fromCenter(
    center: Point,
    radius: number,
    startAngle: number,
    endAngle: number,
  ): SectionArc;
  fromPoints(p1: Point, p2: Point, p3: Point): SectionArc;
  length(arc: SectionArc): number;
  midpoint(arc: SectionArc): Point;
  startPoint(arc: SectionArc): Point;
  endPoint(arc: SectionArc): Point;
  normalAt(arc: SectionArc, angle: number): Vector;
  normalAtPoint(arc: SectionArc, point: Point): Vector;
  offset(arc: SectionArc, distance: number): SectionArc;
  toPolyline(arc: SectionArc, options?: ToPolylineOptions): Polyline;
  intersectLine(arc: SectionArc, line: Line): Point[];
  intersectLineFull(arc: SectionArc, line: Line): Point[];
  intersectArc(a: SectionArc, b: SectionArc): Point[];
  intersectArcFull(a: SectionArc, b: SectionArc): Point[];
} = {
  fromCenter: (center, radius, startAngle, endAngle) =>
    fromXYArc(
      GeometryArc.fromCenter(
        toXYPoint(center),
        radius,
        // CCW YZ = CCW XY: angles map 1:1, no negation, no swap
        startAngle,
        endAngle,
      ),
    ),

  fromPoints: (p1, p2, p3) =>
    fromXYArc(
      GeometryArc.fromPoints(toXYPoint(p1), toXYPoint(p2), toXYPoint(p3)),
    ),

  length: (arc) => GeometryArc.length(toXYArc(arc)),

  midpoint: (arc) => fromXYPoint(GeometryArc.midpoint(toXYArc(arc))),

  startPoint: (arc) => fromXYPoint(GeometryArc.startPoint(toXYArc(arc))),

  endPoint: (arc) => fromXYPoint(GeometryArc.endPoint(toXYArc(arc))),

  normalAt: (arc, angle) =>
    fromXYVector(GeometryArc.normalAt(toXYArc(arc), angle)),

  normalAtPoint: (arc, point) =>
    fromXYVector(GeometryArc.normalAtPoint(toXYArc(arc), toXYPoint(point))),

  offset: (arc, distance) =>
    fromXYArc(GeometryArc.offset(toXYArc(arc), distance)),

  toPolyline: (arc, options = { tolerance: 0.1 }) =>
    fromXYPolyline(GeometryArc.toPolyline(toXYArc(arc), options)),


  intersectLine: (arc, line) =>
    GeometryArc.intersectLine(toXYArc(arc), toXYLine(line)).map(fromXYPoint),

  intersectLineFull: (arc, line) =>
    GeometryArc.intersectLineFull(toXYArc(arc), toXYLine(line)).map(
      fromXYPoint,
    ),

  intersectArc: (a, b) =>
    GeometryArc.intersectArc(toXYArc(a), toXYArc(b)).map(fromXYPoint),

  intersectArcFull: (a, b) =>
    GeometryArc.intersectArcFull(toXYArc(a), toXYArc(b)).map(fromXYPoint),

  translate: (arc, vector) =>
    fromXYArc(GeometryArc.translate(toXYArc(arc), toXYVector(vector))),

  rotate: (arc, angle, origin) =>
    fromXYArc(
      GeometryArc.rotate(
        toXYArc(arc),
        angle,
        origin ? toXYPoint(origin) : undefined,
      ),
    ),

  mirror: (arc, axisP1, axisP2) =>
    fromXYArc(
      GeometryArc.mirror(toXYArc(arc), toXYPoint(axisP1), toXYPoint(axisP2)),
    ),
};
