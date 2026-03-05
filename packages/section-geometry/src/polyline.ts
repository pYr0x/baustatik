import { Polyline as GeometryPolyline } from '@baustatik/geometry-2d';
import {
  fromXYPoint,
  fromXYPolyline,
  toXYLine,
  toXYPoint,
  toXYPolyline,
  toXYVector,
} from './convert';
import { Polygon } from './polygon';
import type {
  Line,
  Point,
  Polygon as SectionPolygon,
  Polyline as SectionPolyline,
  Transformable,
} from './types';

export const Polyline: Transformable<SectionPolyline> & {
  make(points: Point[]): SectionPolyline;
  fromLines(lines: Line[]): SectionPolyline;
  length(polyline: SectionPolyline): number;
  isClosed(polyline: SectionPolyline, tolerance?: number): boolean;
  toPolygon(polyline: SectionPolyline): SectionPolygon;
  pointAt(polyline: SectionPolyline, t: number): Point;
  closestPoint(polyline: SectionPolyline, point: Point): Point;
  split(
    polyline: SectionPolyline,
    point: Point,
  ): [SectionPolyline, SectionPolyline];
} = {
  make: (points) => ({ points }),

  fromLines: (lines) =>
    fromXYPolyline(
      GeometryPolyline.fromLines(lines.map((line) => toXYLine(line))),
    ),

  length: (polyline) => GeometryPolyline.length(toXYPolyline(polyline)),

  isClosed: (polyline, tolerance = 1e-10) =>
    GeometryPolyline.isClosed(toXYPolyline(polyline), tolerance),

  toPolygon: (polyline) => {
    const xyPolygon = GeometryPolyline.toPolygon(toXYPolyline(polyline));
    return Polygon.make(xyPolygon.points.map(fromXYPoint));
  },

  pointAt: (polyline, t) =>
    fromXYPoint(GeometryPolyline.pointAt(toXYPolyline(polyline), t)),

  closestPoint: (polyline, point) =>
    fromXYPoint(
      GeometryPolyline.closestPoint(toXYPolyline(polyline), toXYPoint(point)),
    ),

  split: (polyline, point) => {
    const [first, second] = GeometryPolyline.split(
      toXYPolyline(polyline),
      toXYPoint(point),
    );
    return [fromXYPolyline(first), fromXYPolyline(second)];
  },

  translate: (polyline, vector) =>
    fromXYPolyline(
      GeometryPolyline.translate(toXYPolyline(polyline), toXYVector(vector)),
    ),

  rotate: (polyline, angle, origin) =>
    fromXYPolyline(
      GeometryPolyline.rotate(
        toXYPolyline(polyline),
        angle,
        origin ? toXYPoint(origin) : undefined,
      ),
    ),

  mirror: (polyline, axisP1, axisP2) =>
    fromXYPolyline(
      GeometryPolyline.mirror(
        toXYPolyline(polyline),
        toXYPoint(axisP1),
        toXYPoint(axisP2),
      ),
    ),
};
