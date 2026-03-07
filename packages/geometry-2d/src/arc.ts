import { CollinearPointsError, InvalidArcError } from './errors';
import type { Line } from './line';
import { Point } from './point';
import {
  angleInArc,
  normalizeAngle,
  sweepAngle,
  type Transformable,
} from './types';
import { Vector } from './vector';

export type Arc = {
  readonly center: Point;
  readonly radius: number;
  readonly startAngle: number;
  /** Signed sweep angle in radians. Positive = CCW, negative = CW. */
  readonly sweep: number;
};

type ToPolylineOptions = { segments: number } | { tolerance: number };

type PolylineLike = { readonly points: Point[] };

export const Arc: Transformable<Arc> & {
  make(center: Point, radius: number, startAngle: number, sweep: number): Arc;
  fromCenter(
    center: Point,
    radius: number,
    startAngle: number,
    endAngle: number,
  ): Arc;
  fromPoints(p1: Point, p2: Point, p3: Point): Arc;
  swap(arc: Arc): Arc;
  length(arc: Arc): number;
  midpoint(arc: Arc): Point;
  startPoint(arc: Arc): Point;
  endPoint(arc: Arc): Point;
  normalAt(arc: Arc, angle: number): Vector;
  normalAtPoint(arc: Arc, p: Point): Vector;
  offset(arc: Arc, distance: number): Arc;
  toPolyline(arc: Arc, options?: ToPolylineOptions): PolylineLike;
  intersectLine(arc: Arc, line: Line): Point[];
  intersectLineFull(arc: Arc, line: Line): Point[];
  intersectArc(a: Arc, b: Arc): Point[];
  intersectArcFull(a: Arc, b: Arc): Point[];
} = {
  make: (center, radius, startAngle, sweep) => {
    if (radius <= 0) throw new InvalidArcError(`radius ${radius} <= 0`);
    if (Math.abs(sweep) < 1e-10)
      throw new InvalidArcError(`sweep ${sweep} ist 0`);
    if (Math.abs(sweep) > 2 * Math.PI + 1e-10)
      throw new InvalidArcError(
        `sweep ${sweep} überschreitet einen vollen Kreis`,
      );
    return { center, radius, startAngle, sweep };
  },

  fromCenter: (center, radius, startAngle, endAngle) => {
    if (radius <= 0) throw new InvalidArcError(`radius ${radius} <= 0`);
    return {
      center,
      radius,
      startAngle,
      sweep: sweepAngle(startAngle, endAngle),
    };
  },

  fromPoints: (p1, p2, p3) => {
    const ax = p1.x;
    const ay = p1.y;
    const bx = p2.x;
    const by = p2.y;
    const cx = p3.x;
    const cy = p3.y;
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-10) throw new CollinearPointsError();

    const ux =
      ((ax ** 2 + ay ** 2) * (by - cy) +
        (bx ** 2 + by ** 2) * (cy - ay) +
        (cx ** 2 + cy ** 2) * (ay - by)) /
      d;
    const uy =
      ((ax ** 2 + ay ** 2) * (cx - bx) +
        (bx ** 2 + by ** 2) * (ax - cx) +
        (cx ** 2 + cy ** 2) * (bx - ax)) /
      d;

    const center = Point.make(ux, uy);
    let startAngle = Math.atan2(p1.y - uy, p1.x - ux);
    let endAngle = Math.atan2(p3.y - uy, p3.x - ux);
    const p2Angle = Math.atan2(p2.y - uy, p2.x - ux);
    const sweep = sweepAngle(startAngle, endAngle);

    if (!angleInArc(p2Angle, startAngle, sweep)) {
      const tmp = startAngle;
      startAngle = endAngle;
      endAngle = tmp;
    }

    return {
      center,
      radius: Point.distance(center, p1),
      startAngle,
      sweep: sweepAngle(startAngle, endAngle),
    };
  },

  swap: (arc) => ({
    ...arc,
    startAngle: arc.startAngle + arc.sweep,
    sweep: -arc.sweep,
  }),

  length: (arc) => Math.abs(arc.sweep) * arc.radius,

  midpoint: (arc) => {
    const mid = arc.startAngle + arc.sweep / 2;
    return Point.make(
      arc.center.x + arc.radius * Math.cos(mid),
      arc.center.y + arc.radius * Math.sin(mid),
    );
  },

  startPoint: (arc) =>
    Point.make(
      arc.center.x + arc.radius * Math.cos(arc.startAngle),
      arc.center.y + arc.radius * Math.sin(arc.startAngle),
    ),

  endPoint: (arc) => {
    const endAngle = arc.startAngle + arc.sweep;
    return Point.make(
      arc.center.x + arc.radius * Math.cos(endAngle),
      arc.center.y + arc.radius * Math.sin(endAngle),
    );
  },

  normalAt: (_, angle) => Vector.make(Math.cos(angle), Math.sin(angle)),

  normalAtPoint: (arc, p) => {
    const angle = Math.atan2(p.y - arc.center.y, p.x - arc.center.x);
    return Arc.normalAt(arc, angle);
  },

  offset: (arc, distance) => {
    const newRadius = arc.radius + distance;
    if (newRadius <= 0)
      throw new InvalidArcError(
        `Offset ${distance} erzeugt Radius ${newRadius} <= 0`,
      );
    return { ...arc, radius: newRadius };
  },

  toPolyline: (arc, options = { tolerance: 0.1 }) => {
    if ('segments' in options && options.segments <= 0)
      throw new InvalidArcError(`segments ${options.segments} <= 0`);
    if ('tolerance' in options && options.tolerance <= 0)
      throw new InvalidArcError(`tolerance ${options.tolerance} <= 0`);

    const absSweep = Math.abs(arc.sweep);
    const segments =
      'segments' in options
        ? options.segments
        : Math.max(
            2,
            Math.ceil(
              absSweep /
                Math.acos(
                  Math.max(-1, Math.min(1, 1 - options.tolerance / arc.radius)),
                ),
            ),
          );

    const points: Point[] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = arc.startAngle + arc.sweep * (i / segments);
      points.push(
        Point.make(
          arc.center.x + arc.radius * Math.cos(angle),
          arc.center.y + arc.radius * Math.sin(angle),
        ),
      );
    }
    return { points };
  },

  intersectLineFull: (arc, line) => {
    const dx = line.p2.x - line.p1.x;
    const dy = line.p2.y - line.p1.y;
    const fx = line.p1.x - arc.center.x;
    const fy = line.p1.y - arc.center.y;
    const a = dx * dx + dy * dy;
    if (a < 1e-14) return [];

    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - arc.radius * arc.radius;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return [];

    if (disc < 1e-10) {
      const t = -b / (2 * a);
      return [Point.make(line.p1.x + t * dx, line.p1.y + t * dy)];
    }

    return [-1, 1].map((s) => {
      const t = (-b + s * Math.sqrt(disc)) / (2 * a);
      return Point.make(line.p1.x + t * dx, line.p1.y + t * dy);
    });
  },

  intersectLine: (arc, line) => {
    return Arc.intersectLineFull(arc, line).filter((p) => {
      const angle = Math.atan2(p.y - arc.center.y, p.x - arc.center.x);
      return angleInArc(angle, arc.startAngle, arc.sweep);
    });
  },

  intersectArcFull: (a, b) => {
    const d = Point.distance(a.center, b.center);
    if (
      d > a.radius + b.radius ||
      d < Math.abs(a.radius - b.radius) ||
      d < 1e-10
    )
      return [];

    const cosA = (a.radius ** 2 + d ** 2 - b.radius ** 2) / (2 * a.radius * d);
    const baseAngle = Math.atan2(
      b.center.y - a.center.y,
      b.center.x - a.center.x,
    );
    const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));

    if (alpha < 1e-10) {
      return [
        Point.make(
          a.center.x + a.radius * Math.cos(baseAngle),
          a.center.y + a.radius * Math.sin(baseAngle),
        ),
      ];
    }

    return [alpha, -alpha].map((da) =>
      Point.make(
        a.center.x + a.radius * Math.cos(baseAngle + da),
        a.center.y + a.radius * Math.sin(baseAngle + da),
      ),
    );
  },

  intersectArc: (a, b) => {
    return Arc.intersectArcFull(a, b).filter((p) => {
      const angleA = Math.atan2(p.y - a.center.y, p.x - a.center.x);
      const angleB = Math.atan2(p.y - b.center.y, p.x - b.center.x);
      return (
        angleInArc(angleA, a.startAngle, a.sweep) &&
        angleInArc(angleB, b.startAngle, b.sweep)
      );
    });
  },

  translate: (arc, v) => ({ ...arc, center: Point.translate(arc.center, v) }),

  rotate: (arc, angle, origin) => ({
    ...arc,
    center: Point.rotate(arc.center, angle, origin),
    startAngle: arc.startAngle + angle,
    // sweep bleibt unverändert – Richtung und Länge ändern sich beim Rotieren nicht
  }),

  mirror: (arc, axisP1, axisP2) => {
    const axisAngle = Math.atan2(axisP2.y - axisP1.y, axisP2.x - axisP1.x);
    const oldEnd = arc.startAngle + arc.sweep;
    return {
      ...arc,
      center: Point.mirror(arc.center, axisP1, axisP2),
      startAngle: normalizeAngle(2 * axisAngle - oldEnd),
      sweep: -arc.sweep,
    };
  },
};
