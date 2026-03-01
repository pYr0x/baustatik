export type Point = { readonly y: number; readonly z: number };

export const Point = {
    /**
     * Creates a new Point.
     */
    make: (y: number, z: number): Point => ({ y, z }),

    /**
     * Calculates the Euclidean distance between two points.
     */
    distance: (a: Point, b: Point): number => {
        return Math.sqrt((a.y - b.y) ** 2 + (a.z - b.z) ** 2);
    },

    /**
     * Checks if two points are equal within a given tolerance.
     */
    equals: (a: Point, b: Point, tolerance = 1e-10): boolean => {
        return Math.abs(a.y - b.y) <= tolerance && Math.abs(a.z - b.z) <= tolerance;
    },
};
