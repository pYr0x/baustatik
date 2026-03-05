import { describe, expect, it } from 'vitest';
import {
  Arc,
  CollinearPointsError,
  DegenerateAxisError,
  DegenerateVectorError,
  DiscontinuousLinesError,
  InvalidArcError,
  InvalidPolygonError,
  InvalidPolylineError,
  Line,
  OpenPolylineError,
  Point,
  Polygon,
  Polyline,
  Vector,
} from '../src';

describe('error re-export surface', () => {
  it('propagates all upstream geometry-2d error classes', () => {
    expect(() =>
      Arc.fromPoints(Point.make(0, 0), Point.make(1, 0), Point.make(2, 0)),
    ).toThrow(CollinearPointsError);

    expect(() => Vector.normalize(Vector.make(0, 0))).toThrow(
      DegenerateVectorError,
    );

    expect(() =>
      Point.mirror(Point.make(1, 2), Point.make(0, 0), Point.make(0, 0)),
    ).toThrow(DegenerateAxisError);

    expect(() => Polygon.make([Point.make(0, 0), Point.make(1, 0)])).toThrow(
      InvalidPolygonError,
    );

    expect(() => Arc.fromCenter(Point.make(0, 0), 0, 0, Math.PI)).toThrow(
      InvalidArcError,
    );

    expect(() => Polyline.toPolygon(Polyline.make([Point.make(0, 0)]))).toThrow(
      OpenPolylineError,
    );

    expect(() => Polyline.pointAt(Polyline.make([]), 0.5)).toThrow(
      InvalidPolylineError,
    );

    const lines = [
      Line.make(Point.make(0, 0), Point.make(1, 0)),
      Line.make(Point.make(5, 0), Point.make(6, 0)),
    ];
    expect(() => Polyline.fromLines(lines)).toThrow(DiscontinuousLinesError);
  });
});
