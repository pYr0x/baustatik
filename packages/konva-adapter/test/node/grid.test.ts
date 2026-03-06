import { describe, expect, it } from 'vitest';

import { screenPoint, viewport } from '@baustatik/render-core';

import { buildAxisLines, buildGridLines, visibleWorldBounds } from '../../src/grid';

describe('grid and axes', () => {
  it('computes visible world bounds from screen and viewport', () => {
    const vp = viewport(screenPoint(100, 50), 2);

    expect(visibleWorldBounds(400, 200, vp)).toEqual({
      minU: -50,
      maxU: 150,
      minV: -25,
      maxV: 75,
    });
  });

  it('rejects spacing <= 0', () => {
    const bounds = { minU: -1, maxU: 1, minV: -1, maxV: 1 };

    expect(() => buildGridLines(bounds, 0)).toThrow();
    expect(() => buildGridLines(bounds, -1)).toThrow();
  });

  it('places grid lines on spacing multiples', () => {
    const bounds = { minU: -2.2, maxU: 2.2, minV: -1.2, maxV: 1.2 };
    const lines = buildGridLines(bounds, 1);

    for (const line of lines) {
      expect(line.kind).toBe('grid');
      const isVertical = line.from.u === line.to.u;
      if (isVertical) {
        expect(Number.isInteger(line.from.u)).toBe(true);
      } else {
        expect(Number.isInteger(line.from.v)).toBe(true);
      }
    }
  });

  it('builds axis lines only when visible', () => {
    expect(
      buildAxisLines({ minU: 1, maxU: 2, minV: 1, maxV: 2 }),
    ).toEqual([]);

    expect(
      buildAxisLines({ minU: -1, maxU: 2, minV: -3, maxV: 4 }),
    ).toEqual([
      { from: { u: -1, v: 0 }, to: { u: 2, v: 0 }, kind: 'axis', axis: 'u' },
      { from: { u: 0, v: -3 }, to: { u: 0, v: 4 }, kind: 'axis', axis: 'v' },
    ]);
  });

  it('returns deterministic output for same input', () => {
    const bounds = { minU: -3, maxU: 3, minV: -2, maxV: 2 };

    expect(buildGridLines(bounds, 0.5)).toEqual(buildGridLines(bounds, 0.5));
    expect(buildAxisLines(bounds)).toEqual(buildAxisLines(bounds));
  });

  it('does not mutate bounds', () => {
    const bounds = Object.freeze({ minU: -2, maxU: 2, minV: -2, maxV: 2 });
    const before = structuredClone(bounds);

    expect(() => buildGridLines(bounds, 1)).not.toThrow();
    expect(() => buildAxisLines(bounds)).not.toThrow();
    expect(bounds).toEqual(before);
  });
});
