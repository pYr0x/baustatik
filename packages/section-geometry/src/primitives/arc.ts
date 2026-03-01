import { Point } from './point';
import { CollinearPointsError } from '../errors';

export type Arc = {
    readonly center: Point;
    readonly radius: number;
    readonly startAngle: number; // Radians, clockwise from Y-axis (Z down)
    readonly endAngle: number;
};

export const Arc = {
    /**
     * Creates an Arc from center, radius, and angles.
     */
    fromCenter: (center: Point, radius: number, startAngle: number, endAngle: number): Arc => ({
        center,
        radius,
        startAngle,
        endAngle,
    }),

    /**
     * Creates an Arc that passes through three points.
     * p1: Start point
     * p2: Point on arc
     * p3: End point
     */
    fromPoints: (p1: Point, p2: Point, p3: Point): Arc => {
        // Perpendicular bisector of (p1, p2)
        const mid1 = Point.make((p1.y + p2.y) / 2, (p1.z + p2.z) / 2);
        const dy1 = p2.y - p1.y;
        const dz1 = p2.z - p1.z;

        // Perpendicular bisector of (p2, p3)
        const mid2 = Point.make((p2.y + p3.y) / 2, (p2.z + p3.z) / 2);
        const dy2 = p3.y - p2.y;
        const dz2 = p3.z - p2.z;

        // Line 1: mid1 + t * (-dz1, dy1)
        // Line 2: mid2 + s * (-dz2, dy2)
        // Intersection: mid1.y - t*dz1 = mid2.y - s*dz2
        //               mid1.z + t*dy1 = mid2.z + s*dy2

        // Solve for t:
        // t*(-dz1) + s*(dz2) = mid2.y - mid1.y
        // t*(dy1) + s*(-dy2) = mid2.z - mid1.z

        const det = -dz1 * -dy2 - dz2 * dy1;
        if (Math.abs(det) < 1e-12) {
            throw new CollinearPointsError();
        }

        const t = ((mid2.y - mid1.y) * -dy2 - dz2 * (mid2.z - mid1.z)) / det;

        const center = Point.make(mid1.y - t * dz1, mid1.z + t * dy1);
        const radius = Point.distance(center, p1);

        const startAngle = Math.atan2(p1.z - center.z, p1.y - center.y);
        const midAngle = Math.atan2(p2.z - center.z, p2.y - center.y);
        const endAngle = Math.atan2(p3.z - center.z, p3.y - center.y);

        // Normalize midAngle relative to startAngle to check direction
        // and ensure p2 is between p1 and p3.
        // However, the standard fromPoints logic often assumes the path p1 -> p2 -> p3.

        // We need to handle the wrapping of atan2.
        let normalizedEnd = endAngle;
        let normalizedMid = midAngle;

        // Ensure we go from start to mid to end in a consistent direction
        // The implementation plan says "Winkel-Konvention für Arc: Uhrzeigersinn"
        // and "Z nach unten -> Uhrzeigersinn ist 'positiv'".

        // Let's determine direction from p1, p2, p3 cross product
        const crossProduct = (p2.y - p1.y) * (p3.z - p2.z) - (p2.z - p1.z) * (p3.y - p2.y);
        const isClockwise = crossProduct > 0;

        if (isClockwise) {
            while (normalizedMid < startAngle) normalizedMid += 2 * Math.PI;
            while (normalizedEnd < normalizedMid) normalizedEnd += 2 * Math.PI;
        } else {
            while (normalizedMid > startAngle) normalizedMid -= 2 * Math.PI;
            while (normalizedEnd > normalizedMid) normalizedEnd -= 2 * Math.PI;
        }

        return Arc.fromCenter(center, radius, startAngle, normalizedEnd);
    },

    /**
     * Calculates the arc length.
     */
    length: (arc: Arc): number => {
        return arc.radius * Math.abs(arc.endAngle - arc.startAngle);
    },

    /**
     * Approximates the arc with a polyline.
     * Number of segments defaults to 1 per degree.
     */
    toPolyline: (arc: Arc, segments?: number): Point[] => {
        const angleDiff = arc.endAngle - arc.startAngle;
        const absAngleDeg = Math.abs(angleDiff) * (180 / Math.PI);
        const n = segments ?? Math.ceil(absAngleDeg);

        const points: Point[] = [];
        for (let i = 0; i <= n; i++) {
            const angle = arc.startAngle + (angleDiff * i) / n;
            points.push(
                Point.make(
                    arc.center.y + arc.radius * Math.cos(angle),
                    arc.center.z + arc.radius * Math.sin(angle)
                )
            );
        }
        return points;
    },
};
