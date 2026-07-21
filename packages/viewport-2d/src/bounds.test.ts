import { describe, expect, it } from 'vitest';

import {
  InvalidSizeError,
  screenPoint,
  size,
  viewport,
  visibleWorldBounds,
  worldToScreen,
} from './index';

describe('visibleWorldBounds', () => {
  it('identity viewport maps screen size directly to world bounds', () => {
    const vp = viewport(screenPoint(0, 0), 1);

    expect(visibleWorldBounds(vp, size(800, 600))).toEqual({
      minU: 0,
      minV: 0,
      maxU: 800,
      maxV: 600,
    });
  });

  it('shifted origin and scale != 1 produce correct bounds', () => {
    // Ursprung in der Bildmitte, doppelter Zoom.
    const vp = viewport(screenPoint(400, 300), 2);

    expect(visibleWorldBounds(vp, size(800, 600))).toEqual({
      minU: -200,
      minV: -150,
      maxU: 200,
      maxV: 150,
    });
  });

  it('bounds corners map back onto the screen edges', () => {
    const vp = viewport(screenPoint(123, -45), 1.75);
    const b = visibleWorldBounds(vp, size(640, 480));

    const topLeft = worldToScreen({ u: b.minU, v: b.minV }, vp);
    const bottomRight = worldToScreen({ u: b.maxU, v: b.maxV }, vp);

    expect(topLeft.x).toBeCloseTo(0, 10);
    expect(topLeft.y).toBeCloseTo(0, 10);
    expect(bottomRight.x).toBeCloseTo(640, 10);
    expect(bottomRight.y).toBeCloseTo(480, 10);
  });

  it('min is always <= max because scale is positive', () => {
    const vp = viewport(screenPoint(5000, 5000), 0.25);
    const b = visibleWorldBounds(vp, size(300, 200));

    expect(b.minU).toBeLessThanOrEqual(b.maxU);
    expect(b.minV).toBeLessThanOrEqual(b.maxV);
  });
});

describe('size validation', () => {
  it.each([
    [0, 100],
    [100, 0],
    [-1, 100],
    [100, -1],
    [Number.NaN, 100],
    [100, Number.NaN],
    [Number.POSITIVE_INFINITY, 100],
    [100, Number.POSITIVE_INFINITY],
  ])('throws InvalidSizeError for size(%s, %s)', (width, height) => {
    expect(() => size(width, height)).toThrow(InvalidSizeError);
  });

  it('visibleWorldBounds validates the screen size itself', () => {
    const vp = viewport(screenPoint(0, 0), 1);

    expect(() => visibleWorldBounds(vp, { width: 0, height: 100 })).toThrow(
      InvalidSizeError,
    );
  });
});
