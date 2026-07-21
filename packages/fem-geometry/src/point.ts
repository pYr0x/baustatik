import { Point as GeometryPoint } from '@baustatik/geometry-2d';
import { fromXYPoint, toXYPoint, toXYVector } from './convert';
import type { Point as FEMPoint, Transformable } from './types';

export type Point = FEMPoint;

export const Point: Transformable<FEMPoint> & {
  make(x: number, z: number): FEMPoint;
  distance(a: FEMPoint, b: FEMPoint): number;
  equals(a: FEMPoint, b: FEMPoint, tolerance?: number): boolean;
} = {
  make: (x, z) => ({ x, z }),
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
