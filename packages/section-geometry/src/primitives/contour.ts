import { Point } from './point';
import { Segment } from './segment';
import { Arc } from './arc';

export type Contour = { readonly segments: Segment[] };

export const Contour = {
    /**
     * Creates a new Contour.
     */
    make: (segments: Segment[]): Contour => ({ segments }),

    /**
     * Checks if the contour is closed.
     */
    isClosed: (contour: Contour, tolerance = 1e-10): boolean => {
        if (contour.segments.length === 0) return false;
        const first = contour.segments[0];
        const last = contour.segments[contour.segments.length - 1];
        return Point.equals(Segment.startPoint(first), Segment.endPoint(last), tolerance);
    },

    /**
     * Calculates the total length of the contour.
     */
    length: (contour: Contour): number => {
        return contour.segments.reduce((acc, seg) => acc + Segment.length(seg), 0);
    },

    /**
     * Calculates the bounding box of the contour.
     */
    boundingBox: (contour: Contour): { min: Point; max: Point } => {
        let min = { y: Infinity, z: Infinity };
        let max = { y: -Infinity, z: -Infinity };

        const update = (p: Point) => {
            min = { y: Math.min(min.y, p.y), z: Math.min(min.z, p.z) };
            max = { y: Math.max(max.y, p.y), z: Math.max(max.z, p.z) };
        };

        for (const seg of contour.segments) {
            if (Segment.isLine(seg)) {
                update(seg.p1);
                update(seg.p2);
            } else {
                // Start and end points
                update(Segment.startPoint(seg));
                update(Segment.endPoint(seg));

                // Check for extrema (top, bottom, left, right)
                // These occur at angles 0, PI/2, PI, 3PI/2 (or multiples)
                const angles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
                const { startAngle, endAngle } = seg;
                const normalizedStart = startAngle % (2 * Math.PI);
                let normalizedEnd = endAngle % (2 * Math.PI);
                if (normalizedEnd < normalizedStart && endAngle > startAngle) normalizedEnd += 2 * Math.PI;
                if (normalizedEnd > normalizedStart && endAngle < startAngle) normalizedEnd -= 2 * Math.PI;

                for (const a of angles) {
                    // We need to check if 'a' (plus multiples of 2PI) is between startAngle and endAngle
                    // This is tricky with floating point and wrapping.
                    // Simplest is to check if it's within [min(start, end), max(start, end)] 
                    // after proper normalization.

                    let checkAngle = a;
                    const s = Math.min(startAngle, endAngle);
                    const e = Math.max(startAngle, endAngle);

                    // Check a few multiples
                    for (let m = -2; m <= 2; m++) {
                        const angle = a + m * 2 * Math.PI;
                        if (angle >= s && angle <= e) {
                            update(Point.make(
                                seg.center.y + seg.radius * Math.cos(angle),
                                seg.center.z + seg.radius * Math.sin(angle)
                            ));
                        }
                    }
                }
            }
        }

        return { min, max };
    },
};
