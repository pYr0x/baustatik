import type { Viewport, WorldPoint } from '@baustatik/render-core';

export type GridLine = {
  readonly from: WorldPoint;
  readonly to: WorldPoint;
  readonly kind: 'grid' | 'axis';
  readonly axis?: 'u' | 'v';
};

export type VisibleWorldBounds = {
  readonly minU: number;
  readonly maxU: number;
  readonly minV: number;
  readonly maxV: number;
};

export function visibleWorldBounds(
  _screenWidth: number,
  _screenHeight: number,
  _vp: Viewport,
): VisibleWorldBounds {
  throw new Error('TODO: visibleWorldBounds not implemented');
}

export function buildGridLines(
  _bounds: VisibleWorldBounds,
  _spacing: number,
): GridLine[] {
  throw new Error('TODO: buildGridLines not implemented');
}

export function buildAxisLines(_bounds: VisibleWorldBounds): GridLine[] {
  throw new Error('TODO: buildAxisLines not implemented');
}
