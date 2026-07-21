import { Vector as GeometryVector } from '@baustatik/geometry-2d';
import {
  fromXYVector,
  normalizeAngleYZ,
  toXYPoint,
  toXYVector,
} from './convert';
import type { Point as FEMPoint, Vector as FEMVector } from './types';

export type Vector = FEMVector;

export const Vector = {
  make: (dx: number, dz: number): FEMVector => ({ dx, dz }),

  fromPoints: (a: FEMPoint, b: FEMPoint): FEMVector =>
    fromXYVector(GeometryVector.fromPoints(toXYPoint(a), toXYPoint(b))),

  length: (vector: FEMVector): number =>
    GeometryVector.length(toXYVector(vector)),

  normalize: (vector: FEMVector): FEMVector =>
    fromXYVector(GeometryVector.normalize(toXYVector(vector))),

  add: (a: FEMVector, b: FEMVector): FEMVector => ({
    dx: a.dx + b.dx,
    dz: a.dz + b.dz,
  }),

  subtract: (a: FEMVector, b: FEMVector): FEMVector => ({
    dx: a.dx - b.dx,
    dz: a.dz - b.dz,
  }),

  scale: (vector: FEMVector, factor: number): FEMVector => ({
    dx: vector.dx * factor,
    dz: vector.dz * factor,
  }),

  negate: (vector: FEMVector): FEMVector => ({
    dx: -vector.dx,
    dz: -vector.dz,
  }),

  dot: (a: FEMVector, b: FEMVector): number => a.dx * b.dx + a.dz * b.dz,

  cross: (a: FEMVector, b: FEMVector): number => a.dx * b.dz - a.dz * b.dx,

  angle: (vector: FEMVector): number =>
    normalizeAngleYZ(GeometryVector.angle(toXYVector(vector))),

  rotate: (vector: FEMVector, angle: number): FEMVector =>
    fromXYVector(GeometryVector.rotate(toXYVector(vector), angle)),

  perpendicular: (vector: FEMVector): FEMVector =>
    fromXYVector(GeometryVector.perpendicular(toXYVector(vector))),
};
