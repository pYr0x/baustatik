import { describe, expect, it } from 'vitest';

import { screenPoint, screenToWorld, viewport } from '@baustatik/render-core';

import { panViewport, zoomViewportAt } from '../../src/viewport-controls';

describe('panViewport', () => {
  it('shifts only origin', () => {
    const vp = viewport(screenPoint(10, 20), 2);

    expect(panViewport(vp, 5, -3)).toEqual({
      origin: { x: 15, y: 17 },
      scale: 2,
    });
  });

  it('does not mutate input viewport', () => {
    const vp = Object.freeze({ origin: Object.freeze({ x: 10, y: 20 }), scale: 2 });
    const before = structuredClone(vp);

    expect(() => panViewport(vp, 1, 2)).not.toThrow();
    expect(vp).toEqual(before);
  });
});

describe('zoomViewportAt', () => {
  it('changes scale', () => {
    const vp = viewport(screenPoint(10, 20), 2);
    const anchor = screenPoint(100, 50);

    expect(zoomViewportAt(vp, 1.5, anchor).scale).toBeCloseTo(3);
  });

  it('keeps world point under anchor stable on screen', () => {
    const vp = viewport(screenPoint(100, 50), 2);
    const anchor = screenPoint(140, 10);
    const worldAtAnchor = screenToWorld(anchor, vp);

    const zoomed = zoomViewportAt(vp, 2, anchor);

    const worldAtAnchorAfter = screenToWorld(anchor, zoomed);
    expect(worldAtAnchorAfter.u).toBeCloseTo(worldAtAnchor.u, 12);
    expect(worldAtAnchorAfter.v).toBeCloseTo(worldAtAnchor.v, 12);
  });

  it('rejects factor <= 0', () => {
    const vp = viewport(screenPoint(0, 0), 2);
    const anchor = screenPoint(0, 0);

    expect(() => zoomViewportAt(vp, 0, anchor)).toThrow();
    expect(() => zoomViewportAt(vp, -1, anchor)).toThrow();
  });

  it('does not mutate input viewport', () => {
    const vp = Object.freeze({ origin: Object.freeze({ x: 10, y: 20 }), scale: 2 });
    const anchor = screenPoint(0, 0);
    const before = structuredClone(vp);

    expect(() => zoomViewportAt(vp, 1.2, anchor)).not.toThrow();
    expect(vp).toEqual(before);
  });
});
