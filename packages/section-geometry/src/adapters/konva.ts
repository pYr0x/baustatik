import { Contour } from '../primitives/contour';
import { Segment } from '../primitives/segment';

/**
 * Transforms a Contour into an SVG path string for Konva.
 * Transformation: x = Y, y = -Z (to make Z go "up" on screen).
 */
export function contourToKonvaPath(contour: Contour): string {
    if (contour.segments.length === 0) return '';

    const segments = contour.segments;
    const first = segments[0];
    const start = Segment.startPoint(first);

    let path = `M ${start.y},${-start.z}`;

    for (const seg of segments) {
        if (Segment.isLine(seg)) {
            const end = seg.p2;
            path += ` L ${end.y},${-end.z}`;
        } else {
            // SVG Arc command: A rx ry x-axis-rotation large-arc-flag sweep-flag x y
            const end = Segment.endPoint(seg);
            const rx = seg.radius;
            const ry = seg.radius;
            const xAxisRotation = 0;

            // Determine flags
            const diff = seg.endAngle - seg.startAngle;
            const largeArcFlag = Math.abs(diff) > Math.PI ? 1 : 0;
            // In our system (Z down), positive diff is clockwise.
            // In screen system (y=-Z), clockwise in YZ becomes counter-clockwise in XY?
            // Let's think: 
            // Y+ is Right, Z+ is Down. Point (1,0) to (0,1) is CW.
            // After transforms: (1,0) to (0,-1). 
            // On screen (xy): (1,0) to (0,-1) is CCW? 
            // No, screen y is down. If we map Z to -Z, then -Z positive means Z negative (UP).
            // Standard SVG sweep-flag: 1 for clockwise, 0 for counter-clockwise.
            // If we want Z-up on screen, we are mirroring the Z axis.
            // Mirroring one axis flips the orientation (CW -> CCW).
            const sweepFlag = diff > 0 ? 0 : 1;

            path += ` A ${rx} ${ry} ${xAxisRotation} ${largeArcFlag} ${sweepFlag} ${end.y} ${-end.z}`;
        }
    }

    return path;
}
