import {
  screenPoint,
  screenToWorld,
  type Viewport,
  type WorldPoint,
  worldPoint,
} from '@baustatik/render-core';

import { InvalidGridSpacingError } from './errors';

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

/**
 * Computes the world-space rectangle visible in the current viewport.
 *
 * Assumes `vp.scale > 0` (enforced by `render-core`), which guarantees
 * that screen (0, 0) maps to the world minimum and (W, H) to the maximum.
 */
export function visibleWorldBounds(
  screenWidth: number,
  screenHeight: number,
  vp: Viewport,
): VisibleWorldBounds {
  const min = screenToWorld(screenPoint(0, 0), vp);
  const max = screenToWorld(screenPoint(screenWidth, screenHeight), vp);

  return {
    minU: min.u,
    maxU: max.u,
    minV: min.v,
    maxV: max.v,
  };
}

function gridStart(min: number, spacing: number): number {
  return Math.ceil(min / spacing) * spacing;
}

export function buildGridLines(
  bounds: VisibleWorldBounds,
  spacing: number,
): GridLine[] {
  if (!Number.isFinite(spacing) || spacing <= 0) {
    throw new InvalidGridSpacingError('spacing muss > 0 und endlich sein');
  }

  const lines: GridLine[] = [];

  for (
    let u = gridStart(bounds.minU, spacing);
    u <= bounds.maxU;
    u += spacing
  ) {
    lines.push({
      from: worldPoint(u, bounds.minV),
      to: worldPoint(u, bounds.maxV),
      kind: 'grid',
    });
  }

  for (
    let v = gridStart(bounds.minV, spacing);
    v <= bounds.maxV;
    v += spacing
  ) {
    lines.push({
      from: worldPoint(bounds.minU, v),
      to: worldPoint(bounds.maxU, v),
      kind: 'grid',
    });
  }

  return lines;
}

export function buildAxisLines(bounds: VisibleWorldBounds): GridLine[] {
  const lines: GridLine[] = [];

  if (bounds.minV <= 0 && bounds.maxV >= 0) {
    lines.push({
      from: worldPoint(bounds.minU, 0),
      to: worldPoint(bounds.maxU, 0),
      kind: 'axis',
      axis: 'u',
    });
  }

  if (bounds.minU <= 0 && bounds.maxU >= 0) {
    lines.push({
      from: worldPoint(0, bounds.minV),
      to: worldPoint(0, bounds.maxV),
      kind: 'axis',
      axis: 'v',
    });
  }

  return lines;
}
