import { Point } from './point';
import { Line } from './line';
import { Arc } from './arc';

export type Segment = Line | Arc;

export const Segment = {
    /**
     * Calculates the length of the segment.
     */
    length: (seg: Segment): number => {
        return 'p1' in seg ? Line.length(seg) : Arc.length(seg);
    },

    /**
     * Type guard for Line.
     */
    isLine: (seg: Segment): seg is Line => 'p1' in seg,

    /**
     * Type guard for Arc.
     */
    isArc: (seg: Segment): seg is Arc => 'center' in seg,

    /**
     * Gets the start point of the segment.
     */
    startPoint: (seg: Segment): Point => {
        if (Segment.isLine(seg)) {
            return seg.p1;
        }
        return Point.make(
            seg.center.y + seg.radius * Math.cos(seg.startAngle),
            seg.center.z + seg.radius * Math.sin(seg.startAngle)
        );
    },

    /**
     * Gets the end point of the segment.
     */
    endPoint: (seg: Segment): Point => {
        if (Segment.isLine(seg)) {
            return seg.p2;
        }
        return Point.make(
            seg.center.y + seg.radius * Math.cos(seg.endAngle),
            seg.center.z + seg.radius * Math.sin(seg.endAngle)
        );
    },
};
