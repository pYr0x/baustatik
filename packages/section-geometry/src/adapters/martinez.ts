import type { Polygon } from 'martinez-polygon-clipping';
import { Segment } from '../primitives/segment';
import { Point } from '../primitives/point';
import { Arc } from '../primitives/arc';
import { Line } from '../primitives/line';

/**
 * Transforms a Segment with thickness t into a Polygon for martinez-polygon-clipping.
 * Coordinates are transformed: Y -> x, Z -> y.
 */
export function segmentToPolygon(seg: Segment, t: number): Polygon {
    const halfT = t / 2;
    const points: Point[] = Segment.isLine(seg) ? [seg.p1, seg.p2] : Arc.toPolyline(seg);

    const leftSide: [number, number][] = [];
    const rightSide: [number, number][] = [];

    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        let dy = 0;
        let dz = 0;

        if (points.length === 2) {
            // Simple line
            dy = points[1].y - points[0].y;
            dz = points[1].z - points[0].z;
        } else {
            // Polyline approximation for Arc
            if (i === 0) {
                dy = points[1].y - points[0].y;
                dz = points[1].z - points[0].z;
            } else if (i === points.length - 1) {
                dy = points[i].y - points[i - 1].y;
                dz = points[i].z - points[i - 1].z;
            } else {
                // Average direction
                dy = points[i + 1].y - points[i - 1].y;
                dz = points[i + 1].z - points[i - 1].z;
            }
        }

        const len = Math.sqrt(dy ** 2 + dz ** 2);
        const ny = -dz / len; // Normal Y
        const nz = dy / len;  // Normal Z

        leftSide.push([p.y + ny * halfT, p.z + nz * halfT]);
        rightSide.push([p.y - ny * halfT, p.z - nz * halfT]);
    }

    // Combine to form a closed loop: left side forwards, then right side backwards
    const ring = [...leftSide, ...rightSide.reverse()];
    // Close the ring if not already closed (it shouldn't be, but Martinez likes it)
    if (ring.length > 0) {
        ring.push([ring[0][0], ring[0][1]]);
    }

    return [ring];
}
