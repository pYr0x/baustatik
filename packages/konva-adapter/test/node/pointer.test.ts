import { describe, expect, it } from 'vitest';

import { screenPoint, viewport } from '@baustatik/render-core';

import { pointerScreenToWorld } from '../../src/pointer';

describe('pointerScreenToWorld', () => {
  it('uses the same inverse logic as render-core screenToWorld', () => {
    const vp = viewport(screenPoint(100, 200), 2);
    const pointer = screenPoint(120, 260);

    expect(pointerScreenToWorld(pointer, vp)).toEqual({ u: 10, v: 30 });
  });

  it('does not apply hidden offsets', () => {
    const vp = viewport(screenPoint(0, 0), 1);

    expect(pointerScreenToWorld(screenPoint(3, 4), vp)).toEqual({ u: 3, v: 4 });
  });
});
