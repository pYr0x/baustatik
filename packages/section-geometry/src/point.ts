import { Point as GeometryPoint } from '@baustatik/geometry-2d';
import { fromXYPoint, toXYPoint, toXYVector } from './convert';
import type { Point as SectionPoint, Transformable } from './types';

export const Point: Transformable<SectionPoint> & {
  make(y: number, z: number): SectionPoint;
  distance(a: SectionPoint, b: SectionPoint): number;
  equals(a: SectionPoint, b: SectionPoint, tolerance?: number): boolean;
} = {
  make: (y, z) => ({ y, z }),
  distance: (a, b) => GeometryPoint.distance(toXYPoint(a), toXYPoint(b)),
  equals: (a, b, tolerance = 1e-10) =>
    GeometryPoint.equals(toXYPoint(a), toXYPoint(b), tolerance),
  translate: (point, vector) =>
    fromXYPoint(GeometryPoint.translate(toXYPoint(point), toXYVector(vector))),
  rotate: (point, angle, origin) =>
    fromXYPoint(
      GeometryPoint.rotate(
        toXYPoint(point),
        angle,
        origin ? toXYPoint(origin) : undefined,
      ),
    ),
  mirror: (point, axisP1, axisP2) =>
    fromXYPoint(
      GeometryPoint.mirror(
        toXYPoint(point),
        toXYPoint(axisP1),
        toXYPoint(axisP2),
      ),
    ),
};
