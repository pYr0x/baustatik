import { describe, expect, it } from 'vitest';
import {
  fromXYArc,
  fromXYBoundingBox,
  fromXYLine,
  fromXYPoint,
  fromXYVector,
  normalizeAngleYZ,
  toXYArc,
  toXYLine,
  toXYPoint,
  toXYVector,
} from '../src/convert';

describe('normalizeAngleYZ', () => {
  it('normalizes negative angles into [0, 2pi)', () => {
    expect(normalizeAngleYZ(-0.1)).toBeCloseTo(2 * Math.PI - 0.1);
  });

  it('normalizes 2pi to 0', () => {
    expect(normalizeAngleYZ(2 * Math.PI)).toBeCloseTo(0);
  });

  it('normalizes large positive angles', () => {
    expect(normalizeAngleYZ(9 * Math.PI)).toBeCloseTo(Math.PI);
  });
});

describe('point and vector conversion', () => {
  it('roundtrips a point', () => {
    const point = { y: 3, z: -7 };
    expect(fromXYPoint(toXYPoint(point))).toEqual(point);
  });

  it('roundtrips a vector', () => {
    const vector = { dy: -2, dz: 5 };
    expect(fromXYVector(toXYVector(vector))).toEqual(vector);
  });

  // Der Wächter über die Orientierung: kein Vorzeichenwechsel. Eine
  // Spiegelung hier würde jede Drehung in ihre Umkehrung konjugieren
  // (M·P·M = P⁻¹) und angle/rotate/perpendicular/Arc still invertieren.
  it('maps z to y without flipping the sign', () => {
    const point = { y: 3, z: 2 };
    expect(toXYPoint(point)).toEqual({ x: 3, y: 2 });
    expect(toXYVector({ dy: 3, dz: 2 })).toEqual({ dx: 3, dy: 2 });
  });
});

describe('compound conversion', () => {
  it('roundtrips a line', () => {
    const line = { p1: { y: 0, z: 0 }, p2: { y: 2, z: 3 } };
    expect(fromXYLine(toXYLine(line))).toEqual(line);
  });

  it('maps arc angles 1:1 (orientation-preserving, no swap, no negation)', () => {
    const arc = {
      center: { y: 0, z: 0 },
      radius: 2,
      startAngle: 0,
      sweep: Math.PI / 2,
    };
    const xyArc = toXYArc(arc);
    // No swap, no negation: startXY = startYZ, sweepXY = sweepYZ
    expect(xyArc.startAngle).toBeCloseTo(0);
    expect(xyArc.sweep).toBeCloseTo(Math.PI / 2);
    // Round-trip
    expect(fromXYArc(xyArc).startAngle).toBeCloseTo(0);
    expect(fromXYArc(xyArc).sweep).toBeCloseTo(Math.PI / 2);
  });

  it('keeps bounding box min/max ordered after conversion', () => {
    const yzBoundingBox = fromXYBoundingBox({
      min: { x: -2, y: -4 },
      max: { x: 3, y: 1 },
    });
    expect(yzBoundingBox.min.y).toBeLessThanOrEqual(yzBoundingBox.max.y);
    expect(yzBoundingBox.min.z).toBeLessThanOrEqual(yzBoundingBox.max.z);
  });
});
