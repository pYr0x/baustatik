import { Vector as GeometryVector } from '@baustatik/geometry-2d';
import {
  fromXYVector,
  normalizeAngleYZ,
  toXYPoint,
  toXYVector,
} from './convert';
import type { Point, Vector as SectionVector } from './types';

export const Vector = {
  make: (dy: number, dz: number): SectionVector => ({ dy, dz }),

  fromPoints: (a: Point, b: Point): SectionVector =>
    fromXYVector(GeometryVector.fromPoints(toXYPoint(a), toXYPoint(b))),

  length: (vector: SectionVector): number =>
    GeometryVector.length(toXYVector(vector)),

  normalize: (vector: SectionVector): SectionVector =>
    fromXYVector(GeometryVector.normalize(toXYVector(vector))),

  add: (a: SectionVector, b: SectionVector): SectionVector => ({
    dy: a.dy + b.dy,
    dz: a.dz + b.dz,
  }),

  subtract: (a: SectionVector, b: SectionVector): SectionVector => ({
    dy: a.dy - b.dy,
    dz: a.dz - b.dz,
  }),

  scale: (vector: SectionVector, factor: number): SectionVector => ({
    dy: vector.dy * factor,
    dz: vector.dz * factor,
  }),

  negate: (vector: SectionVector): SectionVector => ({
    dy: -vector.dy,
    dz: -vector.dz,
  }),

  dot: (a: SectionVector, b: SectionVector): number =>
    a.dy * b.dy + a.dz * b.dz,

  cross: (a: SectionVector, b: SectionVector): number =>
    a.dy * b.dz - a.dz * b.dy,

  angle: (vector: SectionVector): number =>
    normalizeAngleYZ(GeometryVector.angle(toXYVector(vector))),

  rotate: (vector: SectionVector, angle: number): SectionVector =>
    fromXYVector(GeometryVector.rotate(toXYVector(vector), angle)),

  perpendicular: (vector: SectionVector): SectionVector =>
    fromXYVector(GeometryVector.perpendicular(toXYVector(vector))),
};
