import { describe, expect, it } from 'vitest';

import { screenPoint, viewport, worldPoint } from '@baustatik/render-core';

import {
  worldPolygonToKonvaLineProps,
  worldPolygonToKonvaPoints,
  worldPolylineToKonvaLineProps,
  worldPolylineToKonvaPoints,
  worldToKonvaPoint,
} from '../../src/konva-builders';

describe('world -> konva builders', () => {
  it('transforms world point with viewport', () => {
    const vp = viewport(screenPoint(100, 50), 2);

    expect(worldToKonvaPoint(worldPoint(3, -4), vp)).toEqual(screenPoint(106, 42));
  });

  it('returns konva points in [x1, y1, x2, y2, ...] format', () => {
    const vp = viewport(screenPoint(0, 0), 1);
    const points = [worldPoint(1, 2), worldPoint(3, 4)] as const;

    expect(worldPolylineToKonvaPoints(points, vp)).toEqual([1, 2, 3, 4]);
    expect(worldPolygonToKonvaPoints(points, vp)).toEqual([1, 2, 3, 4]);
  });

  it('polygon props use closed: true and do not duplicate start point', () => {
    const vp = viewport(screenPoint(0, 0), 1);
    const points = [worldPoint(0, 0), worldPoint(1, 0), worldPoint(1, 1)] as const;

    expect(worldPolygonToKonvaLineProps(points, vp)).toEqual({
      points: [0, 0, 1, 0, 1, 1],
      closed: true,
    });
  });

  it('handles empty input arrays deterministically', () => {
    const vp = viewport(screenPoint(0, 0), 1);

    expect(worldPolylineToKonvaPoints([], vp)).toEqual([]);
    expect(worldPolygonToKonvaPoints([], vp)).toEqual([]);
    expect(worldPolylineToKonvaLineProps([], vp)).toEqual({ points: [] });
    expect(worldPolygonToKonvaLineProps([], vp)).toEqual({ points: [], closed: true });
  });

  it('does not mutate input arrays', () => {
    const vp = viewport(screenPoint(10, 20), 2);
    const input = Object.freeze([
      Object.freeze({ u: 1, v: 2 }),
      Object.freeze({ u: 3, v: 4 }),
    ]);
    const before = structuredClone(input);

    expect(() => worldPolylineToKonvaPoints(input, vp)).not.toThrow();
    expect(() => worldPolygonToKonvaPoints(input, vp)).not.toThrow();
    expect(input).toEqual(before);
  });
});
