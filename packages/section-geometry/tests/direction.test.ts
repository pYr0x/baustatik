import { describe, expect, it } from 'vitest';
import { Arc, Point } from '../src';

describe('Arc Directionality Verification', () => {
    it('checks if positive endangle goes CCW or CW', () => {
        const arc = Arc.fromCenter(Point.make(0, 0), 1, 0, Math.PI / 2);
        const start = Arc.startPoint(arc);
        const end = Arc.endPoint(arc);
        const mid = Arc.midpoint(arc);
        expect(mid.z).toBeLessThan(0);

        // console.log('--- Arc Verification (0 to 90 deg) ---');
        // console.log('Start Point (Y, Z):', start.y.toFixed(3), start.z.toFixed(3));
        // console.log('Midpoint (Y, Z):', mid.y.toFixed(3), mid.z.toFixed(3));
        // console.log('End Point (Y, Z):', end.y.toFixed(3), end.z.toFixed(3));

        // In Y-right, Z-down:
        // Right is (1, 0)
        // Down is (0, 1)
        // Up is (0, -1)

        // if (mid.z > 0) {
        //     console.log('Result: Arc goes DOWN (Clockwise)');
        // } else {
        //     console.log('Result: Arc goes UP (Counter-Clockwise)');
        // }
        // console.log('---------------------------------------');
    });
});
