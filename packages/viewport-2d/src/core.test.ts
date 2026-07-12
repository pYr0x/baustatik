import { describe, expect, it } from 'vitest';

import {
  InvalidScreenPointError,
  InvalidViewportError,
  InvalidWorldPointError,
  screenPoint,
  screenToWorld,
  viewport,
  worldPoint,
  worldPointsToFlatArray,
  worldToScreen,
} from './index';

describe('world/screen transforms', () => {
  it('(0,0) in world is at viewport origin', () => {
    const vp = viewport(screenPoint(120, 80), 2);

    expect(worldToScreen(worldPoint(0, 0), vp)).toEqual(screenPoint(120, 80));
  });

  it('positive u maps to positive screen x direction', () => {
    const vp = viewport(screenPoint(10, 20), 3);
    const originOnScreen = worldToScreen(worldPoint(0, 0), vp);
    const p = worldToScreen(worldPoint(1, 0), vp);

    expect(p.x).toBeGreaterThan(originOnScreen.x);
  });

  it('positive v maps to positive screen y direction', () => {
    const vp = viewport(screenPoint(10, 20), 3);
    const originOnScreen = worldToScreen(worldPoint(0, 0), vp);
    const p = worldToScreen(worldPoint(0, 1), vp);

    expect(p.y).toBeGreaterThan(originOnScreen.y);
  });

  it('screenToWorld(worldToScreen(p)) returns p within tolerance', () => {
    const vp = viewport(screenPoint(100, -50), 2.5);
    const input = worldPoint(-13.125, 8.875);

    const output = screenToWorld(worldToScreen(input, vp), vp);

    expect(output.u).toBeCloseTo(input.u, 12);
    expect(output.v).toBeCloseTo(input.v, 12);
  });

  it('does not mutate input objects', () => {
    const p = Object.freeze({ u: 2, v: 3 });
    const origin = Object.freeze({ x: 5, y: 7 });
    const vp = Object.freeze({ origin, scale: 4 });

    expect(() => worldToScreen(p, vp)).not.toThrow();

    expect(p).toEqual({ u: 2, v: 3 });
    expect(origin).toEqual({ x: 5, y: 7 });
    expect(vp).toEqual({ origin: { x: 5, y: 7 }, scale: 4 });
  });
});

describe('viewport()', () => {
  it('rejects scale <= 0', () => {
    const o = screenPoint(0, 0);

    expect(() => viewport(o, 0)).toThrowError(InvalidViewportError);
    expect(() => viewport(o, -1)).toThrowError(InvalidViewportError);
  });
});

describe('worldPointsToFlatArray()', () => {
  it('returns [u1, v1, u2, v2, ...]', () => {
    const points = [worldPoint(1, 2), worldPoint(-3, 4), worldPoint(0.5, -0.25)] as const;

    expect(worldPointsToFlatArray(points)).toEqual([1, 2, -3, 4, 0.5, -0.25]);
  });

  it('allows empty arrays', () => {
    expect(worldPointsToFlatArray([])).toEqual([]);
  });

  it('does not mutate input array', () => {
    const points = Object.freeze([
      Object.freeze({ u: 1, v: 2 }),
      Object.freeze({ u: 3, v: 4 }),
    ]);

    const before = structuredClone(points);
    expect(() => worldPointsToFlatArray(points)).not.toThrow();
    expect(points).toEqual(before);
  });

  it('rejects invalid points in array', () => {
    expect(() => worldPointsToFlatArray([{ u: Number.NaN, v: 1 }])).toThrowError(
      InvalidWorldPointError,
    );
    expect(() => worldPointsToFlatArray([{ u: 1, v: Number.POSITIVE_INFINITY }])).toThrowError(
      InvalidWorldPointError,
    );
  });
});

describe('error handling and numeric edge cases', () => {
  it('worldPoint rejects NaN and infinities', () => {
    expect(() => worldPoint(Number.NaN, 0)).toThrowError(InvalidWorldPointError);
    expect(() => worldPoint(Number.POSITIVE_INFINITY, 0)).toThrowError(InvalidWorldPointError);
    expect(() => worldPoint(0, Number.NEGATIVE_INFINITY)).toThrowError(InvalidWorldPointError);
  });

  it('screenPoint rejects NaN and infinities', () => {
    expect(() => screenPoint(Number.NaN, 0)).toThrowError(InvalidScreenPointError);
    expect(() => screenPoint(Number.POSITIVE_INFINITY, 0)).toThrowError(InvalidScreenPointError);
    expect(() => screenPoint(0, Number.NEGATIVE_INFINITY)).toThrowError(InvalidScreenPointError);
  });

  it('viewport rejects NaN and infinities in origin and scale', () => {
    const validOrigin = screenPoint(0, 0);

    expect(() => viewport({ x: Number.NaN, y: 0 }, 1)).toThrowError(InvalidScreenPointError);
    expect(() => viewport({ x: 0, y: Number.POSITIVE_INFINITY }, 1)).toThrowError(
      InvalidScreenPointError,
    );
    expect(() => viewport(validOrigin, Number.NaN)).toThrowError(InvalidViewportError);
    expect(() => viewport(validOrigin, Number.POSITIVE_INFINITY)).toThrowError(
      InvalidViewportError,
    );
    expect(() => viewport(validOrigin, Number.NEGATIVE_INFINITY)).toThrowError(
      InvalidViewportError,
    );
  });

  it('worldToScreen rejects invalid world points', () => {
    const vp = viewport(screenPoint(0, 0), 2);

    expect(() => worldToScreen({ u: Number.NaN, v: 0 }, vp)).toThrowError(InvalidWorldPointError);
    expect(() => worldToScreen({ u: 0, v: Number.POSITIVE_INFINITY }, vp)).toThrowError(
      InvalidWorldPointError,
    );
  });

  it('screenToWorld rejects invalid screen points', () => {
    const vp = viewport(screenPoint(0, 0), 2);

    expect(() => screenToWorld({ x: Number.NaN, y: 0 }, vp)).toThrowError(
      InvalidScreenPointError,
    );
    expect(() => screenToWorld({ x: 0, y: Number.NEGATIVE_INFINITY }, vp)).toThrowError(
      InvalidScreenPointError,
    );
  });

  it('supports very small and very large positive scale', () => {
    const smallVp = viewport(screenPoint(0, 0), 1e-12);
    const largeVp = viewport(screenPoint(0, 0), 1e12);
    const p = worldPoint(1.25, -2.5);

    const smallRoundTrip = screenToWorld(worldToScreen(p, smallVp), smallVp);
    expect(smallRoundTrip.u).toBeCloseTo(p.u, 9);
    expect(smallRoundTrip.v).toBeCloseTo(p.v, 9);

    const largeRoundTrip = screenToWorld(worldToScreen(p, largeVp), largeVp);
    expect(largeRoundTrip.u).toBeCloseTo(p.u, 9);
    expect(largeRoundTrip.v).toBeCloseTo(p.v, 9);
  });

  it('returns new objects (no shared references)', () => {
    const origin = screenPoint(10, 20);
    const vp = viewport(origin, 2);
    const p = worldPoint(3, 4);

    expect(vp.origin).not.toBe(origin);

    const s1 = worldToScreen(p, vp);
    const s2 = worldToScreen(p, vp);
    expect(s1).not.toBe(s2);

    const w1 = screenToWorld(s1, vp);
    const w2 = screenToWorld(s1, vp);
    expect(w1).not.toBe(w2);
  });
});
