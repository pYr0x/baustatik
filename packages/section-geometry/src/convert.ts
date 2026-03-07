import type {
  Arc,
  BoundingBox,
  Line,
  Point,
  Polygon,
  Polyline,
  Vector,
} from './types';

const TAU = 2 * Math.PI;

export type XYPoint = { readonly x: number; readonly y: number };
export type XYVector = { readonly dx: number; readonly dy: number };
export type XYLine = { readonly p1: XYPoint; readonly p2: XYPoint };
export type XYPolyline = { readonly points: XYPoint[] };
export type XYPolygon = { readonly points: XYPoint[] };
export type XYArc = {
  readonly center: XYPoint;
  readonly radius: number;
  readonly startAngle: number;
  readonly sweep: number;
};
export type XYBoundingBox = { readonly min: XYPoint; readonly max: XYPoint };

const normalizeAngleXY = (angle: number): number => ((angle % TAU) + TAU) % TAU;

export const normalizeAngleYZ = (angle: number): number =>
  normalizeAngleXY(angle);

export const toXYPoint = (point: Point): XYPoint => ({
  x: point.y,
  y: -point.z,
});

export const fromXYPoint = (point: XYPoint): Point => ({
  y: point.x,
  z: -point.y,
});

export const toXYVector = (vector: Vector): XYVector => ({
  dx: vector.dy,
  dy: -vector.dz,
});

export const fromXYVector = (vector: XYVector): Vector => ({
  dy: vector.dx,
  dz: -vector.dy,
});

export const toXYLine = (line: Line): XYLine => ({
  p1: toXYPoint(line.p1),
  p2: toXYPoint(line.p2),
});

export const fromXYLine = (line: XYLine): Line => ({
  p1: fromXYPoint(line.p1),
  p2: fromXYPoint(line.p2),
});

export const toXYPolyline = (polyline: Polyline): XYPolyline => ({
  points: polyline.points.map(toXYPoint),
});

export const fromXYPolyline = (polyline: XYPolyline): Polyline => ({
  points: polyline.points.map(fromXYPoint),
});

export const toXYPolygon = (polygon: Polygon): XYPolygon => ({
  points: polygon.points.map(toXYPoint),
});

export const toXYArc = (arc: Arc): XYArc => ({
  center: toXYPoint(arc.center),
  radius: arc.radius,
  // CCW YZ ⇔ CCW XY: angles map 1:1, no swap, no negation
  startAngle: arc.startAngle,
  sweep: arc.sweep,
});

export const fromXYArc = (arc: XYArc): Arc => ({
  center: fromXYPoint(arc.center),
  radius: arc.radius,
  startAngle: arc.startAngle,
  sweep: arc.sweep,
});

export const toXYBoundingBox = (boundingBox: BoundingBox): XYBoundingBox => {
  const mappedMin = toXYPoint(boundingBox.min);
  const mappedMax = toXYPoint(boundingBox.max);
  return {
    min: {
      x: Math.min(mappedMin.x, mappedMax.x),
      y: Math.min(mappedMin.y, mappedMax.y),
    },
    max: {
      x: Math.max(mappedMin.x, mappedMax.x),
      y: Math.max(mappedMin.y, mappedMax.y),
    },
  };
};

export const fromXYBoundingBox = (boundingBox: XYBoundingBox): BoundingBox => {
  const mappedMin = fromXYPoint(boundingBox.min);
  const mappedMax = fromXYPoint(boundingBox.max);
  return {
    min: {
      y: Math.min(mappedMin.y, mappedMax.y),
      z: Math.min(mappedMin.z, mappedMax.z),
    },
    max: {
      y: Math.max(mappedMin.y, mappedMax.y),
      z: Math.max(mappedMin.z, mappedMax.z),
    },
  };
};
