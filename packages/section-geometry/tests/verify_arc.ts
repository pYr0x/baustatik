import { Arc, Point } from '../src';

const arc = Arc.fromCenter(Point.make(0, 0), 1, 0, Math.PI / 2);
console.log('Start angle:', arc.startAngle);
console.log('End angle:', arc.endAngle);

const start = Arc.startPoint(arc);
const end = Arc.endPoint(arc);
const mid = Arc.midpoint(arc);

console.log('Start Point (Angle 0):', start);
console.log('End Point (Angle 90):', end);
console.log('Midpoint (Angle 45):', mid);

// Right: (1, 0)
// Down: (0, 1)
// Midpoint should be around (0.7, 0.7) for CW Right->Down
// Or (0.7, -0.7) for CCW Right->Up
