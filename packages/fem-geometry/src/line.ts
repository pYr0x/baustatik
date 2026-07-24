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
  Line as FEMLine,
  Point as FEMPoint,
  Transformable,
  Vector,
} from './types';
import { Vector as VectorMath } from './vector';

export type Line = FEMLine;

/**
 * Lokales Stab-Koordinatensystem: `ex` zeigt vom Anfangs- zum Endknoten,
 * `ez` steht senkrecht darauf und entsteht aus `ex` durch dieselbe Drehung,
 * die global `x` nach `z` überführt (z abwärts). Beide Achsen sind normiert
 * und in globalen x/z-Koordinaten ausgedrückt.
 *
 * Für `ex = (cosα, sinα)` gilt `ez = (−sinα, cosα)`, identisch mit
 * `Line.normalVector`.
 */
export type LineFrame = { readonly ex: Vector; readonly ez: Vector };

export const Line: Transformable<FEMLine> & {
  make(p1: FEMPoint, p2: FEMPoint): FEMLine;
  length(line: FEMLine): number;
  midpoint(line: FEMLine): FEMPoint;
  direction(line: FEMLine): Vector;
  normalVector(line: FEMLine): Vector;
  frame(line: FEMLine): LineFrame;
  toLocal(line: FEMLine, vector: Vector): Vector;
  toGlobal(line: FEMLine, vector: Vector): Vector;
  extend(line: FEMLine, startDelta: number, endDelta: number): FEMLine;
  parallel(line: FEMLine, distance: number): FEMLine;
  split(line: FEMLine, point: FEMPoint): [FEMLine, FEMLine];
  closestPoint(line: FEMLine, point: FEMPoint): FEMPoint;
  distanceToPoint(line: FEMLine, point: FEMPoint): number;
  intersect(a: FEMLine, b: FEMLine): FEMPoint | null;
  intersectSegment(a: FEMLine, b: FEMLine): FEMPoint | null;
  isParallel(a: FEMLine, b: FEMLine, tolerance?: number): boolean;
  isPerpendicular(a: FEMLine, b: FEMLine, tolerance?: number): boolean;
  angle(a: FEMLine, b: FEMLine): number;
} = {
  make: (p1, p2) => ({ p1, p2 }),

  length: (line) => GeometryLine.length(toXYLine(line)),

  midpoint: (line) => fromXYPoint(GeometryLine.midpoint(toXYLine(line))),

  direction: (line) => fromXYVector(GeometryLine.direction(toXYLine(line))),

  normalVector: (line) =>
    fromXYVector(GeometryLine.normalVector(toXYLine(line))),

  // Seit `convert.ts` orientierungstreu ist, faellt `ez` mit `normalVector`
  // zusammen. Trotzdem steht die Drehung hier bewusst direkt in x/z
  // ((dx, dz) → (−dz, dx)) statt an geometry-2d zu delegieren: das ist die
  // massgebliche Definition der lokalen Stabachse, und der Test
  // `ez === normalVector` in `tests/line.test.ts` vergleicht sie gegen den
  // delegierten Weg. Wuerde `frame` selbst delegieren, gaebe es nichts mehr zu
  // vergleichen — eine wieder eingefuehrte Spiegelung in `convert.ts` wuerde
  // beide Seiten gleichzeitig kippen und unbemerkt durchgehen.
  frame: (line) => {
    const ex = Line.direction(line);
    return { ex, ez: VectorMath.make(-ex.dz, ex.dx) };
  },

  // Zerlegung in Achsanteile: die Basis ist orthonormal, deshalb genügen
  // Skalarprodukte — kein Winkel, keine Drehmatrix, keine Vorzeichenherleitung.
  toLocal: (line, vector) => {
    const { ex, ez } = Line.frame(line);
    return VectorMath.make(
      VectorMath.dot(vector, ex),
      VectorMath.dot(vector, ez),
    );
  },

  toGlobal: (line, vector) => {
    const { ex, ez } = Line.frame(line);
    return VectorMath.add(
      VectorMath.scale(ex, vector.dx),
      VectorMath.scale(ez, vector.dz),
    );
  },

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
