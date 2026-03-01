import { Point } from './point';

export type Line = { readonly p1: Point; readonly p2: Point };

export const Line = {
    /**
     * Creates a new Line.
     */
    make: (p1: Point, p2: Point): Line => ({ p1, p2 }),

    /**
     * Calculates the length of the line.
     */
    length: (line: Line): number => {
        return Point.distance(line.p1, line.p2);
    },

    /**
     * Calculates the midpoint of the line.
     */
    midpoint: (line: Line): Point => {
        return Point.make((line.p1.y + line.p2.y) / 2, (line.p1.z + line.p2.z) / 2);
    },

    /**
     * Calculates the area of the line assuming a thickness t.
     */
    area: (line: Line, t: number): number => {
        return Line.length(line) * t;
    },
};
